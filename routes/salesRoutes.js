const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');

const Sale = require('../models/Sale');
const Produit = require('../models/produitModel');
const Client = require('../models/clientModel');
const Facture = require('../models/Facture');
const Counter = require('../models/Counter');
const { requirePermission } = require('../middleware/permissions');
const { genererFactureVentePDF } = require('../utils/saleInvoiceGenerator');
const { sendEmail } = require('../utils/emailSender');

const router = express.Router();

const TAUX_TPS = 0.05;
const TAUX_TVQ = 0.09975;
const DOSSIER_FACTURES_VENTES = path.join(__dirname, '..', 'public', 'generated', 'sales-invoices');

router.get('/', requirePermission('sales', 'read'), async (req, res) => {
  try {
    const filtre = construireFiltreVentes(req.query);
    const ventes = await Sale.find(filtre)
      .populate('client', 'nom prenom email telephone')
      .populate('items.productId', 'nom model imei prixachat prixvente disponibilite datevente')
      .sort({ dateVente: -1, numeroVente: -1 })
      .lean();

    res.json(ventes);
  } catch (err) {
    console.error('Erreur liste ventes :', err);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

router.get('/:id', requirePermission('sales', 'read'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) return res.status(400).json({ erreur: 'ID vente invalide.' });

    const vente = await Sale.findById(req.params.id)
      .populate('client', 'nom prenom email telephone')
      .populate('items.productId', 'nom model imei prixachat prixvente disponibilite datevente venteId')
      .lean();

    if (!vente) return res.status(404).json({ erreur: 'Vente introuvable.' });
    res.json(vente);
  } catch (err) {
    console.error('Erreur detail vente :', err);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

router.post('/', requirePermission('sales', 'create'), async (req, res) => {
  try {
    const vente = await construireVenteDepuisBody(req.body, req.utilisateur);

    if (vente.envoyerFactureEmail && !emailValide(vente.emailFacture)) {
      return res.status(400).json({ erreur: 'Courriel requis pour envoyer la facture.' });
    }

    await vente.save();
    await marquerProduitsVendus(vente);

    let message = 'Vente creee.';
    if (vente.factureGeneree || vente.envoyerFactureEmail) {
      await genererFacturePourVente(vente._id);
      message = 'Vente creee et facture generee.';
    }

    if (vente.envoyerFactureEmail) {
      const resultat = await envoyerFactureVente(vente._id, vente.emailFacture);
      message = resultat.ok
        ? 'Vente creee, facture generee et courriel envoye.'
        : 'Vente creee, mais l envoi du courriel a echoue.';
    }

    const venteComplete = await lireVenteComplete(vente._id);
    res.status(201).json({ message, vente: venteComplete });
  } catch (err) {
    console.error('Erreur creation vente :', err);
    res.status(err.statusCode || 400).json({ erreur: err.message || 'Erreur creation vente' });
  }
});

router.put('/:id', requirePermission('sales', 'update'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) return res.status(400).json({ erreur: 'ID vente invalide.' });

    const vente = await Sale.findById(req.params.id);
    if (!vente) return res.status(404).json({ erreur: 'Vente introuvable.' });

    if (vente.factureGeneree && req.body.items) {
      return res.status(409).json({ erreur: 'Impossible de modifier les articles apres generation de la facture.' });
    }

    const update = await construireUpdateVente(req.body, vente, req.utilisateur);
    vente.set(update);
    await vente.save();

    res.json(await lireVenteComplete(vente._id));
  } catch (err) {
    console.error('Erreur modification vente :', err);
    res.status(err.statusCode || 400).json({ erreur: err.message || 'Erreur modification vente' });
  }
});

router.delete('/:id', requirePermission('sales', 'delete'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) return res.status(400).json({ erreur: 'ID vente invalide.' });

    const vente = await Sale.findById(req.params.id);
    if (!vente) return res.status(404).json({ erreur: 'Vente introuvable.' });
    if (venteAnnulee(vente)) {
      return res.status(409).json({ erreur: 'Cette vente est deja annulee.' });
    }

    await remettreProduitsDisponibles(vente);
    await restaurerAccessoiresVendus(vente);

    vente.statut = 'annulee';
    vente.statutVente = 'annulee';
    vente.annuleeLe = new Date();
    vente.deletedAt = vente.annuleeLe;
    vente.annuleePar = req.utilisateur && req.utilisateur.id;
    vente.raisonAnnulation = req.body && req.body.raisonAnnulation || '';
    vente.updatedBy = req.utilisateur && req.utilisateur.id;
    await vente.save();
    await marquerFactureVenteAnnulee(vente);

    res.json({ success: true, message: 'Vente annulee avec succes' });
  } catch (err) {
    console.error('Erreur annulation vente :', err);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

router.get('/:id/invoice', requirePermission('sales', 'read'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) return res.status(400).json({ erreur: 'ID vente invalide.' });

    const vente = await Sale.findById(req.params.id);
    if (!vente) return res.status(404).json({ erreur: 'Vente introuvable.' });
    if (!vente.factureGeneree || !vente.facturePdfPath) {
      return res.status(404).json({ erreur: 'Facture PDF non generee.' });
    }
    res.download(vente.facturePdfPath, path.basename(vente.facturePdfPath));
  } catch (err) {
    console.error('Erreur telechargement facture vente :', err);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

router.post('/:id/generate-invoice', requirePermission('sales', 'update'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) return res.status(400).json({ erreur: 'ID vente invalide.' });
    const vente = await genererFacturePourVente(req.params.id);
    res.json({ message: 'Facture generee.', vente });
  } catch (err) {
    console.error('Erreur generation facture vente :', err);
    res.status(err.statusCode || 500).json({ erreur: err.message || 'Erreur serveur' });
  }
});

router.post('/:id/send-invoice', requirePermission('sales', 'update'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) return res.status(400).json({ erreur: 'ID vente invalide.' });
    const email = req.body.emailFacture;
    if (!emailValide(email)) return res.status(400).json({ erreur: 'Courriel valide requis.' });

    const resultat = await envoyerFactureVente(req.params.id, email);
    const vente = await lireVenteComplete(req.params.id);
    res.status(resultat.ok ? 200 : 502).json({
      message: resultat.ok ? 'Facture envoyee.' : 'Facture generee, mais envoi echoue.',
      vente
    });
  } catch (err) {
    console.error('Erreur envoi facture vente :', err);
    res.status(err.statusCode || 500).json({ erreur: err.message || 'Erreur serveur' });
  }
});

async function construireVenteDepuisBody(body, utilisateur) {
  const client = await lireClientOptionnel(body.clientId || body.client);
  const dateVente = dateValide(body.dateVente) || new Date();
  const items = await construireItems(body.items || []);
  if (!items.length) {
    const err = new Error('Au moins un article est requis.');
    err.statusCode = 400;
    throw err;
  }

  const totaux = calculerTotaux(items, body);
  const garantie = calculerGarantie(body, dateVente);
  const emailFacture = String(body.emailFacture || (client && client.email) || '').trim().toLowerCase();

  return new Sale({
    client: client ? client._id : null,
    dateVente,
    items,
    ...totaux,
    modePaiement: normaliserModePaiement(body.modePaiement),
    factureGeneree: bool(body.factureGeneree),
    envoyerFactureEmail: bool(body.envoyerFactureEmail),
    emailFacture,
    ...garantie,
    notes: body.notes || '',
    createdBy: utilisateur && utilisateur.id,
    updatedBy: utilisateur && utilisateur.id
  });
}

async function construireUpdateVente(body, venteExistante, utilisateur) {
  const client = Object.prototype.hasOwnProperty.call(body, 'clientId') || Object.prototype.hasOwnProperty.call(body, 'client')
    ? await lireClientOptionnel(body.clientId || body.client)
    : undefined;
  const dateVente = body.dateVente ? dateValide(body.dateVente) : venteExistante.dateVente;
  const items = body.items ? await construireItems(body.items, venteExistante._id) : venteExistante.items;
  const totaux = calculerTotaux(items, { ...venteExistante.toObject(), ...body });
  const garantie = calculerGarantie({ ...venteExistante.toObject(), ...body }, dateVente);
  const update = {
    dateVente,
    items,
    ...totaux,
    modePaiement: normaliserModePaiement(body.modePaiement || venteExistante.modePaiement),
    factureGeneree: bool(body.factureGeneree ?? venteExistante.factureGeneree),
    envoyerFactureEmail: bool(body.envoyerFactureEmail ?? venteExistante.envoyerFactureEmail),
    emailFacture: String(body.emailFacture || venteExistante.emailFacture || '').trim().toLowerCase(),
    ...garantie,
    notes: body.notes ?? venteExistante.notes,
    updatedBy: utilisateur && utilisateur.id
  };

  if (client !== undefined) update.client = client ? client._id : null;
  return update;
}

async function construireItems(itemsInput, venteAutoriseeId = null) {
  if (!Array.isArray(itemsInput)) return [];

  const items = [];
  for (const item of itemsInput) {
    const type = normaliserTypeItem(item.type);
    const quantite = Math.max(montant(item.quantite) || 1, 0);
    let description = String(item.description || '').trim();
    let prixUnitaire = montant(item.prixUnitaire);
    let coutUnitaire = montant(item.coutUnitaire);
    let productId = null;

    if (type === 'produit') {
      if (!item.productId || idInvalide(item.productId)) {
        throw erreurValidation('Produit invalide dans la vente.');
      }

      const produit = await Produit.findById(item.productId).lean();
      if (!produit) throw erreurValidation('Produit introuvable dans la vente.');
      if (
        normaliserTexte(produit.disponibilite) === 'vendu'
        && (!venteAutoriseeId || String(produit.venteId || '') !== String(venteAutoriseeId))
      ) {
        throw erreurValidation(`Produit deja vendu: ${produit.nom || produit._id}`);
      }

      productId = produit._id;
      description = description || [produit.nom, produit.model, produit.imei].filter(Boolean).join(' - ') || 'Telephone';
      prixUnitaire = prixUnitaire || montant(produit.prixvente || produit.prix);
      coutUnitaire = coutUnitaire || montant(produit.prixachat);
    }

    if (!description) description = type === 'accessoire' ? 'Accessoire' : 'Article manuel';

    const totalLigne = arrondir(quantite * prixUnitaire);
    const coutLigne = arrondir(quantite * coutUnitaire);
    items.push({
      type,
      productId,
      accessoryId: item.accessoryId && !idInvalide(item.accessoryId) ? item.accessoryId : undefined,
      description,
      quantite,
      prixUnitaire: arrondir(prixUnitaire),
      coutUnitaire: arrondir(coutUnitaire),
      totalLigne,
      coutLigne,
      profitLigne: arrondir(totalLigne - coutLigne)
    });
  }

  return items;
}

function calculerTotaux(items, body) {
  const sousTotal = arrondir(somme(items.map(item => item.totalLigne)));
  const rabais = Math.min(arrondir(montant(body.rabais)), sousTotal);
  const sousTotalApresRabais = arrondir(Math.max(sousTotal - rabais, 0));
  const taxesActivees = bool(body.taxesActivees);
  const montantTPS = taxesActivees ? arrondir(sousTotalApresRabais * TAUX_TPS) : 0;
  const montantTVQ = taxesActivees ? arrondir(sousTotalApresRabais * TAUX_TVQ) : 0;
  const totalTaxes = arrondir(montantTPS + montantTVQ);
  const total = arrondir(sousTotalApresRabais + totalTaxes);
  const coutTotal = arrondir(somme(items.map(item => item.coutLigne)));
  const profitTotal = arrondir(sousTotalApresRabais - coutTotal);
  const montantPaye = arrondir(Math.max(montant(body.montantPaye), 0));
  const solde = arrondir(Math.max(total - montantPaye, 0));
  const statutPaiement = montantPaye >= total && total > 0
    ? 'paye'
    : montantPaye > 0
      ? 'partiellement paye'
      : 'non paye';

  return {
    sousTotal,
    rabais,
    sousTotalApresRabais,
    taxesActivees,
    tauxTPS: TAUX_TPS,
    tauxTVQ: TAUX_TVQ,
    montantTPS,
    montantTVQ,
    totalTaxes,
    total,
    coutTotal,
    profitTotal,
    montantPaye,
    solde,
    statutPaiement,
    datePaiement: montantPaye > 0 ? new Date() : undefined
  };
}

function calculerGarantie(body, dateVente) {
  const garantieActive = bool(body.garantieActive);
  const garantieJours = Math.max(Number.parseInt(body.garantieJours, 10) || 30, 0);
  const dateDebutGarantie = garantieActive ? new Date(dateVente) : undefined;
  const dateFinGarantie = garantieActive ? new Date(dateVente) : undefined;
  if (dateFinGarantie) dateFinGarantie.setDate(dateFinGarantie.getDate() + garantieJours);

  return {
    garantieActive,
    garantieJours,
    noteGarantie: body.noteGarantie || '',
    dateDebutGarantie,
    dateFinGarantie
  };
}

async function marquerProduitsVendus(vente) {
  const produits = vente.items.filter(item => item.type === 'produit' && item.productId);
  for (const item of produits) {
    await Produit.findByIdAndUpdate(
      item.productId,
      {
        disponibilite: 'vendu',
        datevente: vente.dateVente,
        venteId: vente._id,
        prixvente: item.prixUnitaire
      },
      { runValidators: true }
    );
  }
}

async function remettreProduitsDisponibles(vente) {
  const produits = vente.items.filter(item => item.type === 'produit' && item.productId);
  for (const item of produits) {
    await Produit.findOneAndUpdate(
      { _id: item.productId, venteId: vente._id },
      {
        $set: {
          disponibilite: 'disponible',
          datevente: null,
          venteId: null
        },
        $unset: {
          soldAt: '',
          dateVente: '',
          saleId: ''
        }
      },
      { runValidators: true }
    );
  }
}

async function restaurerAccessoiresVendus(vente) {
  const accessoires = vente.items.filter(item => item.type === 'accessoire' && item.accessoryId);
  if (!accessoires.length) return;
  // Aucun modele d'inventaire accessoires n'existe actuellement dans Fixel.
  // Les lignes accessoires annulees sont donc simplement exclues des statistiques avec la vente.
}

async function genererFacturePourVente(id) {
  const vente = await Sale.findById(id);
  if (!vente) throw erreurValidation('Vente introuvable.', 404);

  vente.factureGeneree = true;
  vente.factureDate = vente.factureDate || new Date();
  await vente.save();
  await assurerNumeroFactureVente(vente);

  const venteComplete = await Sale.findById(id)
    .populate('client', 'nom prenom email telephone')
    .populate('items.productId', 'nom model imei prixachat prixvente');
  const { pdfBuffer, nomFichier } = await genererFactureVentePDF(venteComplete);
  await fs.mkdir(DOSSIER_FACTURES_VENTES, { recursive: true });
  const cheminPdf = path.join(DOSSIER_FACTURES_VENTES, nomFichier);
  await fs.writeFile(cheminPdf, pdfBuffer);

  venteComplete.facturePdfPath = cheminPdf;
  venteComplete.factureGeneree = true;
  venteComplete.factureDate = venteComplete.factureDate || new Date();
  await venteComplete.save();
  await synchroniserFactureVente(venteComplete);

  return lireVenteComplete(id);
}

async function envoyerFactureVente(id, email) {
  const vente = await Sale.findById(id);
  if (!vente) throw erreurValidation('Vente introuvable.', 404);
  if (!vente.factureGeneree || !vente.facturePdfPath) await genererFacturePourVente(id);

  const venteComplete = await Sale.findById(id).populate('client', 'nom prenom email telephone');
  const emailFinal = String(email || venteComplete.emailFacture || (venteComplete.client && venteComplete.client.email) || '').trim();
  if (!emailValide(emailFinal)) throw erreurValidation('Courriel valide requis.', 400);

  try {
    await sendEmail({
      to: emailFinal,
      subject: `Votre facture Fixel - ${formatNumero(venteComplete.factureNumero)}`,
      text: 'Bonjour,\n\nVous trouverez en piece jointe votre facture pour votre achat chez Fixel.\n\nMerci pour votre confiance.\n\nFixel',
      html: '<p>Bonjour,</p><p>Vous trouverez en piece jointe votre facture pour votre achat chez Fixel.</p><p>Merci pour votre confiance.</p><p>Fixel</p>',
      attachments: [{
        filename: path.basename(venteComplete.facturePdfPath),
        path: venteComplete.facturePdfPath,
        contentType: 'application/pdf'
      }]
    });

    venteComplete.emailFacture = emailFinal;
    venteComplete.factureEnvoyee = true;
    venteComplete.factureEnvoyeeLe = new Date();
    venteComplete.erreurEnvoiFacture = '';
    await venteComplete.save();
    await synchroniserFactureVente(venteComplete);
    return { ok: true };
  } catch (err) {
    venteComplete.emailFacture = emailFinal;
    venteComplete.factureEnvoyee = false;
    venteComplete.erreurEnvoiFacture = err.message || 'Erreur envoi facture';
    await venteComplete.save();
    await synchroniserFactureVente(venteComplete);
    return { ok: false, erreur: venteComplete.erreurEnvoiFacture };
  }
}

async function synchroniserFactureVente(venteDocument) {
  const vente = venteDocument && typeof venteDocument.toObject === 'function'
    ? venteDocument
    : await Sale.findById(venteDocument && venteDocument._id || venteDocument);
  if (!vente || !vente.factureGeneree) return null;
  await assurerNumeroFactureVente(vente);

  const clientId = vente.client && vente.client._id ? vente.client._id : vente.client || null;
  const clientNomAffiche = clientId
    ? ''
    : 'Vente comptoir';
  const statutFacture = venteAnnulee(vente) ? 'annulee' : 'active';
  const statut = statutFacture === 'annulee'
    ? 'annulee'
    : vente.factureEnvoyee
      ? 'envoyee'
      : mapStatutPaiementVersFacture(vente.statutPaiement);

  const donnees = {
    type: 'vente',
    sourceId: vente._id,
    sourceModel: 'Sale',
    sale: vente._id,
    client: clientId,
    clientNomAffiche,
    date: vente.factureDate || vente.dateVente || vente.createdAt || new Date(),
    dateEmission: vente.factureDate || vente.dateVente || vente.createdAt || new Date(),
    datePaiement: vente.datePaiement,
    statut,
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
    updatedBy: vente.updatedBy
  };

  if (vente.factureNumero) donnees.numeroFacture = vente.factureNumero;
  if (vente.createdBy) donnees.createdBy = vente.createdBy;

  const facture = await Facture.findOneAndUpdate(
    { sale: vente._id },
    { $set: donnees },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  if (!vente.factureId || String(vente.factureId) !== String(facture._id)) {
    vente.factureId = facture._id;
    await vente.save();
  }

  return facture;
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

async function marquerFactureVenteAnnulee(vente) {
  const facture = await synchroniserFactureVente(vente);
  if (!facture) {
    await Facture.updateOne(
      { sale: vente._id },
      {
        $set: {
          statut: 'annulee',
          statutFacture: 'annulee',
          updatedBy: vente.updatedBy
        }
      }
    );
  }
}

function mapStatutPaiementVersFacture(statutPaiement) {
  if (statutPaiement === 'paye') return 'payee';
  return 'emise';
}

async function lireVenteComplete(id) {
  return Sale.findById(id)
    .populate('client', 'nom prenom email telephone')
    .populate('items.productId', 'nom model imei prixachat prixvente disponibilite datevente')
    .lean();
}

async function lireClientOptionnel(clientId) {
  if (!clientId) return null;
  if (idInvalide(clientId)) throw erreurValidation('Client invalide.');
  const client = await Client.findById(clientId);
  if (!client) throw erreurValidation('Client introuvable.', 404);
  return client;
}

function construireFiltreVentes(query) {
  const filtre = {};
  if (query.inclureAnnulees !== 'true') {
    filtre.statut = { $ne: 'annulee' };
    filtre.statutVente = { $ne: 'annulee' };
    filtre.deletedAt = null;
    filtre.annuleeLe = null;
  }
  if (query.statutPaiement) filtre.statutPaiement = query.statutPaiement;
  if (query.modePaiement) filtre.modePaiement = query.modePaiement;
  if (query.factureGeneree !== undefined) filtre.factureGeneree = bool(query.factureGeneree);
  if (query.factureEnvoyee !== undefined) filtre.factureEnvoyee = bool(query.factureEnvoyee);
  if (query.taxesActivees !== undefined) filtre.taxesActivees = bool(query.taxesActivees);
  if (query.client && !idInvalide(query.client)) filtre.client = query.client;

  const debut = query.dateDebut ? dateValide(`${query.dateDebut}T00:00:00`) : null;
  const fin = query.dateFin ? dateValide(`${query.dateFin}T23:59:59.999`) : null;
  if (debut || fin) {
    filtre.dateVente = {};
    if (debut) filtre.dateVente.$gte = debut;
    if (fin) filtre.dateVente.$lte = fin;
  }

  return filtre;
}

function venteAnnulee(vente) {
  return vente && (
    vente.statut === 'annulee'
    || vente.statutVente === 'annulee'
    || vente.deletedAt
    || vente.annuleeLe
  );
}

function somme(valeurs) {
  return valeurs.reduce((total, valeur) => total + montant(valeur), 0);
}

function montant(valeur) {
  if (valeur === '' || valeur === null || valeur === undefined) return 0;
  const nombre = Number.parseFloat(valeur);
  return Number.isFinite(nombre) ? nombre : 0;
}

function arrondir(valeur) {
  return Math.round((montant(valeur) + Number.EPSILON) * 100) / 100;
}

function bool(valeur) {
  return valeur === true || valeur === 'true' || valeur === '1' || valeur === 1;
}

function idInvalide(id) {
  return !mongoose.Types.ObjectId.isValid(id);
}

function dateValide(valeur) {
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date;
}

function emailValide(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function normaliserTexte(valeur) {
  return (valeur || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function normaliserTypeItem(type) {
  const valeur = normaliserTexte(type);
  if (['produit', 'telephone', 'phone'].includes(valeur)) return 'produit';
  if (['accessoire', 'accessory'].includes(valeur)) return 'accessoire';
  return 'manuel';
}

function normaliserModePaiement(valeur) {
  const mode = normaliserTexte(valeur);
  if (['interac', 'virement', 'carte', 'autre'].includes(mode)) return mode;
  return 'comptant';
}

function erreurValidation(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function formatNumero(numero) {
  return numero ? `#${String(numero).padStart(4, '0')}` : '-';
}

module.exports = router;
