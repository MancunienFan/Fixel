// routes/factures.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Facture = require('../models/Facture');
const { genererPDF } = require('../utils/pdfGenerator');
const envoyerFactureParEmail = require('../utils/emailSender');

const Client = require('../models/clientModel');
const Produit = require('../models/produitModel');
const Reparation = require('../models/reparationModel');

router.get('/', async (req, res) => {
  try {
    const factures = await Facture.find()
      .populate('client', 'nom prenom email telephone')
      .populate('produit', 'nom model imei')
      .sort({ date: -1, numeroFacture: -1 });

    res.json(factures);
  } catch (err) {
    console.error('Erreur liste factures :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', async (req, res) => {
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
    console.error('Erreur facture :', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id/statut', async (req, res) => {
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
      updateData.datePaiement = new Date();
      if (modePaiement) updateData.modePaiement = modePaiement;
    }

    const facture = await Facture.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!facture) return res.status(404).json({ error: 'Facture introuvable' });
    res.json(facture);
  } catch (err) {
    console.error('Erreur statut facture :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send('ID facture invalide');
    }

    const facture = await Facture.findById(req.params.id)
      .populate('client')
      .populate('produit')
      .populate('reparations');

    if (!facture) return res.status(404).send('Facture introuvable');

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

module.exports = router;
