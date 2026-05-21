const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Client = require('../models/clientModel');
const Produit = require('../models/produitModel');
const Reparation = require('../models/reparationModel');
const Facture = require('../models/Facture');
const Sale = require('../models/Sale');
const { SavReturn } = require('../models/savReturnModel');
const { requirePermission, requireRole } = require('../middleware/permissions');

router.get('/', requirePermission('clients', 'read'), async (req, res) => {
  try {
    const clients = await Client.find().sort({ dateModification: -1 });
    res.json(clients);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.get('/:id', requirePermission('clients', 'read'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ erreur: 'ID client invalide.' });
    }

    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ erreur: 'Client introuvable.' });
    res.json(client);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { nom, prenom, telephone, email, notes } = req.body;
    if (!nom || !prenom || !telephone) {
      return res.status(400).json({ erreur: 'Nom, prenom et telephone sont requis.' });
    }

    const newClient = new Client({ nom, prenom, telephone, email, notes });
    await newClient.save();
    res.status(201).json(newClient);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ erreur: 'ID client invalide.' });
    }

    const updated = await Client.findByIdAndUpdate(
      req.params.id,
      { ...req.body, dateModification: new Date() },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ erreur: 'Client introuvable.' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ erreur: 'ID client invalide.' });
    }

    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ erreur: 'Client introuvable.' });

    const [produitLie, reparationLiee, factureLiee, venteLiee, savLie] = await Promise.all([
      Produit.exists({ clientId: req.params.id }),
      Reparation.exists({ client: req.params.id }),
      Facture.exists({ client: req.params.id }),
      Sale.exists({ client: req.params.id }),
      SavReturn.exists({ clientId: req.params.id })
    ]);

    if (produitLie || reparationLiee || factureLiee || venteLiee || savLie) {
      return res.status(409).json({
        erreur: 'Impossible de supprimer ce client: il est lie a des produits, reparations, factures, ventes ou retours SAV.'
      });
    }

    await client.deleteOne();
    res.json({ message: 'Client supprime.' });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

module.exports = router;
