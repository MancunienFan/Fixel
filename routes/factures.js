// routes/factures.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Facture = require('../models/Facture');
const { genererPDF, generateVentePDF } = require('../utils/pdfGenerator');
const envoyerFactureParEmail = require('../utils/emailSender');

const Client = require('../models/clientModel');
const Produit = require('../models/produitModel');
const Reparation = require('../models/reparationModel');

const path = require('path');
const fs = require('fs');
router.post('/', async (req, res) => {
  try {
    const { clientId, produitId, reparationIds, inclureTaxes, envoyerParMail  } = req.body;
    console.log('Réparations reçues du body:', reparationIds, inclureTaxes);
  const appliquerTaxes = inclureTaxes === true || inclureTaxes === 'true';
    const reparationsArray = Array.isArray(reparationIds) ? reparationIds.flat() : [];
    const objectIds = reparationsArray
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    if (objectIds.length === 0) {
      return res.status(400).json({ erreur: 'Aucune réparation valide fournie' });
    }

    const client = await Client.findById(clientId);
    const produit = await Produit.findById(produitId);
    const reparations = await Reparation.find({ _id: { $in: objectIds } });

    if (!client || !produit || reparations.length === 0) {
      return res.status(404).json({ error: 'Client, produit ou réparations introuvables' });
    }

    // Création de la facture dans MongoDB
    const facture = new Facture({
      client: client._id,
      produit: produit._id,
      reparations: reparations.map(r => r._id),
      totalHT: 0,
      tps: 0,
      tvq: 0,
      totalTTC: 0
    });

    await facture.save();

    // Génération du PDF (en mémoire uniquement)
    const {
      nomFichier,
      totalHT,
      tps,
      tvq,
      totalTTC,
      pdfBuffer
    } = await genererPDF(client, produit, reparations, facture.numeroFacture, appliquerTaxes);

    // Mise à jour de la facture
    facture.totalHT = totalHT;
    facture.tps = tps;
    facture.tvq = tvq;
    facture.totalTTC = totalTTC;
    await facture.save();

    // Envoi du PDF par email
 if (envoyerParMail) {
  if (client.email && pdfBuffer && Buffer.isBuffer(pdfBuffer)) {
    try {
      await envoyerFactureParEmail(client.email, client.nom, pdfBuffer, nomFichier);
      console.log(`Facture envoyée par mail à ${client.email}`);
          res.json({ message: 'Facture générée avec succès.', _id: facture._id  });

    } catch (err) {
      console.error("Erreur lors de l'envoi de l'email :", err);
      return res.status(500).json({ error: "Erreur lors de l'envoi de l'email." });
    }
  } else {
    console.warn("Aucun email envoyé : email ou pdfBuffer manquant.");
    return res.status(400).json({ error: "Email du client manquant ou génération PDF échouée." });
  }
} else {
    res.json({
    message: "Facture générée sans envoi par mail",
    _id: facture._id
  });
  console.log("Facture générée sans envoi par mail.");
}
    // ✅ Réponse 

  } catch (error) {
    console.error("Erreur facture :", error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const facture = await Facture.findById(req.params.id)
      .populate('client')
      .populate('produit')
      .populate('reparations');

    if (!facture) return res.status(404).send("Facture introuvable");

    const appliquerTaxes = req.query.inclureTaxes === 'true';
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
    console.log("nom nomFichier:", nomFichier)

    // 👇 Ici, on définit le nom du fichier dans les headers
   

    res.send(pdfBuffer);
  } catch (err) {
    console.error("Erreur téléchargement PDF :", err);
    res.status(500).send("Erreur serveur");
  }
});

router.post('/vente/pdf', async (req, res) => {
  try {
    const { produit, taxes } = req.body;

    if (!produit || !produit.nom || !produit.prixvente) {
      return res.status(400).json({ message: 'Produit invalide pour la facture.' });
    }

    // Appel du générateur PDF sans enregistrement
    const pdfBuffer = await generateVentePDF(produit, taxes);

    // Définir un nom de fichier propre
    const fileName = `facture_vente_${produit.nom.replace(/\s+/g, '_')}_${Date.now()}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`
    });

    res.send(pdfBuffer);

  } catch (err) {
    console.error('Erreur génération facture vente :', err);
    res.status(500).json({ message: 'Erreur lors de la génération du PDF (vente).' });
  }
});

module.exports = router;
