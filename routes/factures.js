// routes/factures.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs/promises');
const path = require('path');

const Facture = require('../models/Facture');
const Sale = require('../models/Sale');
const Counter = require('../models/Counter');
const { genererPDF } = require('../utils/pdfGenerator');
const envoyerFactureParEmail = require('../utils/emailSender');
const { sendEmail } = require('../utils/emailSender');
const { genererFactureVentePDF } = require('../utils/saleInvoiceGenerator');
const { SALES_INVOICE_STORAGE_DIR, cheminDansStockageFactures, masquerCheminsFacture } = require('../utils/invoiceStorage');
const { messageErreurPublique } = require('../utils/apiError');
const { journaliser } = require('../utils/auditLog');

const Client = require('../models/clientModel');
const Produit = require('../models/produitModel');
const Reparation = require('../models/reparationModel');
const { requirePermission, requireRole } = require('../middleware/permissions');

const DOSSIER_FACTURES_VENTES = SALES_INVOICE_STORAGE_DIR;

router.get('/', requirePermission('factures', 'read'), async (req, res) => {
  try {
    await synchroniserFacturesVentesManquantes();
    const filtre = construireFiltreFactures(req.query);
    const factures = await Facture.find(filtre)
      .populate('client', 'nom prenom email telephone')
      .populate('produit', 'nom model imei')
      .populate('reparations', 'description prix statut createdAt')
      .populate('sale', 'numeroVente dateVente total statutPaiement modePaiement statut statutVente annuleeLe deletedAt')
      .sort({ date: -1, numeroFacture: -1 });

    res.json(masquerCheminsFacture(factures));
  } catch (err) {
    console.error('Erreur liste factures :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id', requirePermission('factures', 'read'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID facture invalide' });
    }

    const facture = await Facture.findById(req.params.id)
      .populate('client', 'nom prenom email telephone')
      .populate('produit', 'nom model imei')
      .populate('reparations')
      .populate('sale');

    if (!facture) return res.status(404).json({ error: 'Facture introuvable' });
    res.json(masquerCheminsFacture(facture));
  } catch (err) {
    console.error('Erreur detail facture :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { clientId, produitId, reparationIds, inclureTaxes, envoyerParMail } = req.body;
    const appliquerTaxes = inclureTaxes === true || inclureTaxes === 'true';
    const reparationsArray = Array.isArray(reparationIds) ? reparationIds.flat() : [];

    if (!mongoose.Types.ObjectId.isValid(clientId) || !mongoose.Types.ObjectId.isValid(produitId)) {
      return res.status(400).json({ erreur: 'Client ou produit invalide' });
    }

    const objectIds = reparationsArray
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    if (objectIds.length === 0) {
      return res.status(400).json({ erreur: 'Aucune réparation valide fournie' });
    }

    const client = await Client.findById(clientId);
    const produit = await Produit.findById(produitId);
    const reparations = await Reparation.find({ _id: { $in: objectIds } });

    if (!client || !produit || reparations.length !== objectIds.length) {
      return res.status(404).json({ error: 'Client, produit ou réparations introuvables' });
    }

    if (produit.clientId && produit.clientId.toString() !== client._id.toString()) {
      return res.status(400).json({ error: 'Le produit ne correspond pas au client choisi' });
    }

    const reparationsHorsProduit = reparations.some(reparation => (
      reparation.produit && reparation.produit.toString() !== produit._id.toString()
    ));

    if (reparationsHorsProduit) {
      return res.status(400).json({ error: 'Une reparation ne correspond pas au produit choisi' });
    }

    const factureExistante = await Facture.exists({ reparations: { $in: objectIds } });
    if (factureExistante) {
      return res.status(409).json({ error: 'Une des reparations est deja liee a une facture' });
    }

    const facture = new Facture({
      type: 'reparation',
      sourceModel: 'Produit',
      client: client._id,
      produit: produit._id,
      reparations: reparations.map(r => r._id),
      inclureTaxes: appliquerTaxes,
      statut: 'emise',
      envoyeeParEmail: false,
      emailDestinataire: client.email || '',
      totalHT: 0,
      tps: 0,
      tvq: 0,
      totalTTC: 0
    });

    await facture.save();

    const {
      nomFichier,
      totalHT,
      tps,
      tvq,
      totalTTC,
      pdfBuffer
    } = await genererPDF(client, produit, reparations, facture.numeroFacture, appliquerTaxes);

    facture.totalHT = totalHT;
    facture.tps = tps;
    facture.tvq = tvq;
    facture.totalTTC = totalTTC;
    await facture.save();

    if (envoyerParMail) {
      if (!client.email || !pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
        return res.status(400).json({ error: 'Email du client manquant ou génération PDF échouée.' });
      }

      await envoyerFactureParEmail(client.email, client.nom, pdfBuffer, nomFichier);
      facture.envoyeeParEmail = true;
      facture.dateEnvoiEmail = new Date();
      facture.statut = 'envoyee';
      await facture.save();

      return res.json({ message: 'Facture générée et envoyée avec succès.', _id: facture._id });
    }

    res.json({
      message: 'Facture générée sans envoi par mail.',
      _id: facture._id
    });
  } catch (error) {
    console.error('Erreur facture :', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id/statut', requireRole('admin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID facture invalide' });
    }

    const statutsAutorises = ['emise', 'envoyee', 'payee', 'annulee'];
    const { statut, modePaiement } = req.body;

    if (!statutsAutorises.includes(statut)) {
      return res.status(400).json({ error: 'Statut invalide' });
    }

    const updateData = { statut };
    if (statut === 'payee') {
      updateData.statutPaiement = 'paye';
      updateData.datePaiement = new Date();
      if (modePaiement) updateData.modePaiement = modePaiement;
    }

    const facture = await Facture.findById(req.params.id);
    if (!facture) return res.status(404).json({ error: 'Facture introuvable' });
    const dejaPayee = facture.statut === 'payee' || facture.statutPaiement === 'paye';
    facture.set(updateData);

    if (statut === 'payee' && !dejaPayee) {
      facture.paiements.push({
        date: updateData.datePaiement,
        montant: montant(req.body.montant || facture.totalTTC || facture.totalHT),
        modePaiement: modePaiement || facture.modePaiement || '',
        note: req.body.note || 'Paiement confirme',
        utilisateur: req.utilisateur && req.utilisateur.id
      });
    }

    await facture.save();
    await journaliser(req, {
      action: 'facture.statut',
      entity: 'facture',
      entityId: facture._id,
      entityLabel: formatNumero(facture.numeroFacture),
      details: { statut, modePaiement: modePaiement || facture.modePaiement || '' }
    });
    res.json(masquerCheminsFacture(facture));
  } catch (err) {
    console.error('Erreur statut facture :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/pdf', requirePermission('factures', 'read'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send('ID facture invalide');
    }

    const facture = await Facture.findById(req.params.id)
      .populate('client')
      .populate('produit')
      .populate('reparations');

    if (!facture) return res.status(404).send('Facture introuvable');

    if (facture.type === 'vente') {
      const cheminPdf = await obtenirPdfFactureVente(facture);
      return res.download(cheminPdf, path.basename(cheminPdf));
    }

    const appliquerTaxes = req.query.inclureTaxes === 'true'
      ? true
      : Boolean(facture.inclureTaxes);

    const { nomFichier, pdfBuffer } = await genererPDF(
      facture.client,
      facture.produit,
      facture.reparations,
      facture.numeroFacture,
      appliquerTaxes
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nomFichier}"`
    });

    res.send(pdfBuffer);
  } catch (err) {
    console.error('Erreur téléchargement PDF :', err);
    res.status(500).send('Erreur serveur');
  }
});

router.post('/:id/send-email', requirePermission('factures', 'update'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'ID facture invalide' });
    }

    const facture = await Facture.findById(req.params.id)
      .populate('client', 'nom prenom email telephone')
      .populate('sale');

    if (!facture) return res.status(404).json({ error: 'Facture introuvable' });

    if (facture.type === 'vente') {
      const resultat = await envoyerFactureVenteDepuisFacture(facture, req.body.emailFacture || req.body.email);
      return res.status(resultat.ok ? 200 : 502).json({
        message: resultat.ok ? 'Facture envoyee.' : 'Facture generee, mais envoi echoue.',
        facture: masquerCheminsFacture(await Facture.findById(facture._id).populate('client', 'nom prenom email telephone').populate('sale'))
      });
    }

    const email = String(req.body.emailFacture || req.body.email || facture.emailDestinataire || facture.client && facture.client.email || '').trim();
    if (!emailValide(email)) return res.status(400).json({ error: 'Courriel valide requis.' });

    const appliquerTaxes = req.body.inclureTaxes === true || req.body.inclureTaxes === 'true'
      ? true
      : Boolean(facture.inclureTaxes);
    const factureComplete = await Facture.findById(facture._id)
      .populate('client')
      .populate('produit')
      .populate('reparations');
    const { nomFichier, pdfBuffer } = await genererPDF(
      factureComplete.client,
      factureComplete.produit,
      factureComplete.reparations,
      factureComplete.numeroFacture,
      appliquerTaxes
    );

    await envoyerFactureParEmail(email, factureComplete.client && factureComplete.client.nom, pdfBuffer, nomFichier);
    facture.emailDestinataire = email;
    facture.envoyeeParEmail = true;
    facture.emailEnvoye = true;
    facture.dateEnvoiEmail = new Date();
    facture.emailEnvoyeLe = facture.dateEnvoiEmail;
    facture.statut = 'envoyee';
    await facture.save();
    await journaliser(req, {
      action: 'facture.email',
      entity: 'facture',
      entityId: facture._id,
      entityLabel: formatNumero(facture.numeroFacture),
      details: { email }
    });

    res.json({ message: 'Facture envoyee.', facture: masquerCheminsFacture(facture) });
  } catch (err) {
    console.error('Erreur envoi facture :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/bulk', requirePermission('factures', 'delete'), async (req, res) => {
  try {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
    const idsUniques = [...new Set(ids.map(id => String(id || '').trim()).filter(Boolean))];
    const idsValides = idsUniques.filter(id => mongoose.Types.ObjectId.isValid(id));
    const idsInvalides = idsUniques.filter(id => !mongoose.Types.ObjectId.isValid(id));

    const factures = idsValides.length
      ? await Facture.find({ _id: { $in: idsValides } }).populate('sale', 'statut statutVente annuleeLe deletedAt statutPaiement factureGeneree factureId')
      : [];
    const facturesParId = new Map(factures.map(facture => [String(facture._id), facture]));
    const facturesSupprimables = [];
    const ignorees = [];

    idsInvalides.forEach(id => {
      ignorees.push({ id, raison: 'ID facture invalide.' });
    });

    idsValides.forEach(id => {
      const facture = facturesParId.get(id);
      if (!facture) {
        ignorees.push({ id, raison: 'Facture introuvable.' });
        return;
      }

      if (!factureSupprimable(facture)) {
        ignorees.push({
          id,
          numeroFacture: facture.numeroFacture,
          raison: 'Seules les factures annulees peuvent etre supprimees.'
        });
        return;
      }

      facturesSupprimables.push(facture);
    });

    const idsASupprimer = facturesSupprimables.map(facture => facture._id);
    if (idsASupprimer.length) {
      for (const facture of facturesSupprimables) {
        await preparerSuppressionFacture(facture, req.utilisateur);
      }
      await Facture.deleteMany({ _id: { $in: idsASupprimer } });
    }

    res.json({
      demandes: idsUniques.length,
      supprimees: idsASupprimer.length,
      ignorees: ignorees.length,
      facturesIgnorees: ignorees,
      idsSupprimes: idsASupprimer.map(String)
    });
  } catch (err) {
    console.error('Erreur suppression factures :', err);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

router.delete('/:id', requirePermission('factures', 'delete'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ erreur: 'ID facture invalide.' });
    }

    const facture = await Facture.findById(req.params.id).populate('sale', 'statut statutVente annuleeLe deletedAt statutPaiement factureGeneree factureId');
    if (!facture) return res.status(404).json({ erreur: 'Facture introuvable.' });

    if (!factureSupprimable(facture)) {
      return res.status(403).json({ erreur: 'Seules les factures annulees peuvent etre supprimees.' });
    }

    await preparerSuppressionFacture(facture, req.utilisateur);
    await Facture.findByIdAndDelete(facture._id);
    await journaliser(req, {
      action: 'facture.supprimee',
      entity: 'facture',
      entityId: facture._id,
      entityLabel: formatNumero(facture.numeroFacture)
    });
    res.json({ message: 'Facture supprimee.', id: String(facture._id) });
  } catch (err) {
    console.error('Erreur suppression facture :', err);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

function construireFiltreFactures(query) {
  const filtre = {};

  if (query.type && query.type !== 'toutes') filtre.type = query.type;
  if (query.statutPaiement) filtre.statutPaiement = query.statutPaiement;
  if (query.emailEnvoye !== undefined && query.emailEnvoye !== '') {
    filtre.emailEnvoye = bool(query.emailEnvoye);
  }
  if (query.pdfDisponible !== undefined && query.pdfDisponible !== '') {
    filtre.pdfPath = bool(query.pdfDisponible) ? { $nin: [null, ''] } : { $in: [null, ''] };
  }
  if (query.statutFacture && query.statutFacture !== 'toutes') {
    filtre.statutFacture = query.statutFacture;
  }
  if (query.client && mongoose.Types.ObjectId.isValid(query.client)) filtre.client = query.client;

  const debut = query.dateDu ? dateValide(`${query.dateDu}T00:00:00`) : null;
  const fin = query.dateAu ? dateValide(`${query.dateAu}T23:59:59.999`) : null;
  if (debut || fin) {
    filtre.date = {};
    if (debut) filtre.date.$gte = debut;
    if (fin) filtre.date.$lte = fin;
  }

  return filtre;
}

function factureSupprimable(facture) {
  return Boolean(
    facture
    && (
      facture.statutFacture === 'annulee'
      || facture.statut === 'annulee'
      || facture.statutPaiement === 'annulee'
      || (
        facture.sale
        && (
          facture.sale.statut === 'annulee'
          || facture.sale.statutVente === 'annulee'
          || facture.sale.annuleeLe
          || facture.sale.deletedAt
        )
      )
    )
  );
}

async function preparerSuppressionFacture(facture, utilisateur) {
  if (facture.type === 'vente') {
    await marquerVenteFactureSupprimee(facture, utilisateur);
  }

  facture.statutPaiement = 'annulee';
  facture.statut = 'annulee';
  facture.statutFacture = 'annulee';
  await facture.save();
}

async function marquerVenteFactureSupprimee(facture, utilisateur) {
  const vente = await trouverVenteLieeFacture(facture);
  if (!vente) return;

  vente.statutPaiement = 'annulee';
  vente.factureSupprimee = true;
  vente.factureSupprimeeLe = new Date();
  vente.factureSupprimeePar = utilisateur && utilisateur.id;
  vente.factureGeneree = false;
  vente.factureId = null;
  vente.factureEnvoyee = false;
  vente.envoyerFactureEmail = false;
  vente.erreurEnvoiFacture = '';
  await vente.save();
}

async function trouverVenteLieeFacture(facture) {
  const saleId = facture.sale && facture.sale._id ? facture.sale._id : facture.sale || facture.sourceId;
  if (saleId && mongoose.Types.ObjectId.isValid(saleId)) {
    const vente = await Sale.findById(saleId);
    if (vente) return vente;
  }

  return Sale.findOne({ factureId: facture._id });
}

async function synchroniserFacturesVentesManquantes() {
  const ventes = await Sale.find({ factureGeneree: true, factureSupprimee: { $ne: true } })
    .populate('client', 'nom prenom email telephone')
    .limit(200);

  for (const vente of ventes) {
    const factureExistante = await Facture.findOne({ sale: vente._id });
    if (factureExistante) {
      if (!vente.factureId || String(vente.factureId) !== String(factureExistante._id)) {
        vente.factureId = factureExistante._id;
        await vente.save();
      }
      continue;
    }

    await assurerNumeroFactureVente(vente);
    const facture = await Facture.create(donneesFactureDepuisVente(vente));
    vente.factureId = facture._id;
    await vente.save();
  }
}

function donneesFactureDepuisVente(vente) {
  const venteAnnulee = vente.statut === 'annulee' || vente.statutVente === 'annulee' || vente.deletedAt || vente.annuleeLe;
  const statutFacture = venteAnnulee ? 'annulee' : 'active';
  return {
    numeroFacture: vente.factureNumero,
    type: 'vente',
    sourceId: vente._id,
    sourceModel: 'Sale',
    sale: vente._id,
    client: vente.client && vente.client._id ? vente.client._id : vente.client || null,
    clientNomAffiche: vente.client ? '' : 'Vente comptoir',
    date: vente.factureDate || vente.dateVente || vente.createdAt || new Date(),
    dateEmission: vente.factureDate || vente.dateVente || vente.createdAt || new Date(),
    datePaiement: vente.datePaiement,
    statut: statutFacture === 'annulee' ? 'annulee' : vente.factureEnvoyee ? 'envoyee' : vente.statutPaiement === 'paye' ? 'payee' : 'emise',
    statutFacture,
    inclureTaxes: Boolean(vente.taxesActivees),
    taxesActivees: Boolean(vente.taxesActivees),
    rabais: montant(vente.rabais),
    tps: montant(vente.montantTPS),
    tvq: montant(vente.montantTVQ),
    montantTPS: montant(vente.montantTPS),
    montantTVQ: montant(vente.montantTVQ),
    totalTaxes: montant(vente.totalTaxes),
    totalHT: montant(vente.sousTotalApresRabais || vente.sousTotal),
    totalTTC: montant(vente.total),
    modePaiement: vente.modePaiement || '',
    statutPaiement: vente.statutPaiement || '',
    envoyeeParEmail: Boolean(vente.factureEnvoyee),
    emailEnvoye: Boolean(vente.factureEnvoyee),
    dateEnvoiEmail: vente.factureEnvoyeeLe,
    emailEnvoyeLe: vente.factureEnvoyeeLe,
    emailDestinataire: vente.emailFacture || '',
    fichierPDF: vente.facturePdfPath || '',
    pdfPath: vente.facturePdfPath || '',
    createdBy: vente.createdBy,
    updatedBy: vente.updatedBy
  };
}

async function assurerNumeroFactureVente(vente) {
  let numero = vente.factureNumero;
  while (!numero || await numeroFactureDejaUtilise(numero, vente._id)) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'facture' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    numero = counter.seq;
  }

  if (vente.factureNumero !== numero) {
    vente.factureNumero = numero;
    vente.factureDate = vente.factureDate || new Date();
    await vente.save();
  }
  await Counter.updateOne({ _id: 'facture' }, { $max: { seq: numero } }, { upsert: true });
}

async function numeroFactureDejaUtilise(numero, venteId) {
  const facture = await Facture.findOne({ numeroFacture: numero }).select('sale').lean();
  return Boolean(facture && String(facture.sale || '') !== String(venteId));
}

async function obtenirPdfFactureVente(facture) {
  if (cheminDansStockageFactures(facture.pdfPath) && await fichierExiste(facture.pdfPath)) return facture.pdfPath;

  const venteId = facture.sale || facture.sourceId;
  if (!venteId) throw new Error('Vente liee introuvable.');

  const vente = await Sale.findById(venteId)
    .populate('client', 'nom prenom email telephone')
    .populate('items.productId', 'nom model imei prixachat prixvente');
  if (!vente) throw new Error('Vente liee introuvable.');

  const { pdfBuffer, nomFichier } = await genererFactureVentePDF(vente);
  await fs.mkdir(DOSSIER_FACTURES_VENTES, { recursive: true });
  const cheminPdf = path.join(DOSSIER_FACTURES_VENTES, nomFichier);
  await fs.writeFile(cheminPdf, pdfBuffer);

  vente.factureGeneree = true;
  vente.facturePdfPath = cheminPdf;
  vente.factureDate = vente.factureDate || facture.date || new Date();
  if (!vente.factureId) vente.factureId = facture._id;
  await vente.save();

  facture.pdfPath = cheminPdf;
  facture.fichierPDF = cheminPdf;
  facture.date = facture.date || vente.factureDate;
  await facture.save();

  return cheminPdf;
}

async function envoyerFactureVenteDepuisFacture(facture, email) {
  const vente = facture.sale && facture.sale._id ? facture.sale : await Sale.findById(facture.sale || facture.sourceId).populate('client', 'nom prenom email telephone');
  const emailFinal = String(email || facture.emailDestinataire || vente && vente.emailFacture || vente && vente.client && vente.client.email || '').trim();
  if (!emailValide(emailFinal)) {
    const err = new Error('Courriel valide requis.');
    err.statusCode = 400;
    throw err;
  }

  const cheminPdf = await obtenirPdfFactureVente(facture);
  try {
    await sendEmail({
      to: emailFinal,
      subject: `Votre facture Fixel - ${formatNumero(facture.numeroFacture)}`,
      text: 'Bonjour,\n\nVous trouverez en piece jointe votre facture pour votre achat chez Fixel.\n\nMerci pour votre confiance.\n\nFixel',
      html: '<p>Bonjour,</p><p>Vous trouverez en piece jointe votre facture pour votre achat chez Fixel.</p><p>Merci pour votre confiance.</p><p>Fixel</p>',
      attachments: [{
        filename: path.basename(cheminPdf),
        path: cheminPdf,
        contentType: 'application/pdf'
      }]
    });

    const dateEnvoi = new Date();
    facture.emailDestinataire = emailFinal;
    facture.envoyeeParEmail = true;
    facture.emailEnvoye = true;
    facture.dateEnvoiEmail = dateEnvoi;
    facture.emailEnvoyeLe = dateEnvoi;
    facture.statut = 'envoyee';
    await facture.save();

    if (vente) {
      vente.emailFacture = emailFinal;
      vente.factureEnvoyee = true;
      vente.factureEnvoyeeLe = dateEnvoi;
      vente.erreurEnvoiFacture = '';
      vente.factureId = facture._id;
      await vente.save();
    }

    return { ok: true };
  } catch (err) {
    if (vente) {
      vente.emailFacture = emailFinal;
      vente.factureEnvoyee = false;
      vente.erreurEnvoiFacture = messageErreurPublique(err, 'Erreur envoi facture');
      await vente.save();
    }
    return { ok: false, erreur: messageErreurPublique(err, 'Erreur envoi facture') };
  }
}

async function fichierExiste(chemin) {
  try {
    await fs.access(chemin);
    return true;
  } catch {
    return false;
  }
}

function bool(valeur) {
  return valeur === true || valeur === 'true' || valeur === '1' || valeur === 1;
}

function montant(valeur) {
  if (valeur === '' || valeur === null || valeur === undefined) return 0;
  const nombre = Number.parseFloat(valeur);
  return Number.isFinite(nombre) ? Math.round((nombre + Number.EPSILON) * 100) / 100 : 0;
}

function dateValide(valeur) {
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

function emailValide(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function formatNumero(numero) {
  return numero ? `#${String(numero).padStart(4, '0')}` : '-';
}

module.exports = router;
