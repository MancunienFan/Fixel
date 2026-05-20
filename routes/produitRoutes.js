const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Produit = require('../models/produitModel');
const Reparation = require('../models/reparationModel');
const Facture = require('../models/Facture');
const Client = require('../models/clientModel');
const { SavReturn } = require('../models/savReturnModel');
const { requirePermission, requireRole } = require('../middleware/permissions');

function idInvalide(id) {
  return !mongoose.Types.ObjectId.isValid(id);
}

router.get('/produits', requirePermission('produits', 'read'), async (req, res) => {
  try {
    const produits = await Produit.find({ type: 'stock' }).sort({ dateachat: -1 });
    res.json(produits);
  } catch (err) {
    console.error('Erreur lors de la recuperation des produits :', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/produits', requireRole('admin'), async (req, res) => {
  try {
    const produit = new Produit({
      ...req.body,
      type: req.body.type || 'stock'
    });
    await produit.save();
    res.status(201).json(produit);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

router.get('/produits/:id', requirePermission('produits', 'read'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) {
      return res.status(400).json({ erreur: 'ID produit invalide.' });
    }

    const reparations = await Reparation.find({ produit: req.params.id }).populate('produit');
    res.json(reparations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/produit/:id', requirePermission('produits', 'read'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) {
      return res.status(400).json({ erreur: 'ID produit invalide.' });
    }

    const produit = await Produit.findById(req.params.id);
    if (!produit) return res.status(404).json({ erreur: 'Produit non trouve' });
    res.json(produit);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

router.put('/produit/:id', requireRole('admin'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) {
      return res.status(400).json({ erreur: 'ID produit invalide.' });
    }

    const updateData = {
      ...req.body,
      datemodification: new Date()
    };

    const produit = await Produit.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!produit) return res.status(404).json({ erreur: 'Produit non trouve' });
    res.json(produit);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

router.delete('/produit/:id', requireRole('admin'), async (req, res) => {
  try {
    if (idInvalide(req.params.id)) {
      return res.status(400).json({ erreur: 'ID produit invalide.' });
    }

    const produit = await Produit.findById(req.params.id);
    if (!produit) return res.status(404).json({ erreur: 'Produit non trouve' });

    const [reparationLiee, factureLiee, savLie] = await Promise.all([
      Reparation.exists({ produit: req.params.id }),
      Facture.exists({ produit: req.params.id }),
      SavReturn.exists({ productId: req.params.id })
    ]);

    if (reparationLiee || factureLiee || savLie) {
      return res.status(409).json({
        erreur: 'Impossible de supprimer ce produit: il est lie a des reparations, factures ou retours SAV.'
      });
    }

    await produit.deleteOne();
    res.json({ message: 'Produit supprime' });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.get('/produits/client/:clientId', requirePermission('produits', 'read'), async (req, res) => {
  try {
    if (idInvalide(req.params.clientId)) {
      return res.status(400).json({ erreur: 'ID client invalide.' });
    }

    const produits = await Produit.find({
      clientId: req.params.clientId,
      type: 'client'
    }).sort({ datemodification: -1, dateCreation: -1 });

    res.json(produits);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.post('/produits/client/:clientId', requireRole('admin'), async (req, res) => {
  try {
    if (idInvalide(req.params.clientId)) {
      return res.status(400).json({ erreur: 'ID client invalide.' });
    }

    const nouveauProduit = new Produit({
      ...req.body,
      clientId: req.params.clientId,
      type: 'client',
      dateCreation: new Date(),
      datemodification: new Date()
    });

    const clientExiste = await Client.exists({ _id: req.params.clientId });
    if (!clientExiste) {
      return res.status(404).json({ erreur: 'Client introuvable.' });
    }

    const savedProduit = await nouveauProduit.save();
    res.status(201).json(savedProduit);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

module.exports = router;
