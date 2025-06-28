const express = require('express');
const router = express.Router();
const Produit = require('../models/produitModel');

// GET tous les produits
router.get('/produits', async (req, res) => {
  const produits = await Produit.find();
  res.json(produits);
});

// POST un produit
router.post('/produits', async (req, res) => {
  try {
    const produit = new Produit(req.body);
    await produit.save();
    res.status(201).json(produit);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

// Récupérer toutes les réparations pour un produit donné
router.get('/produits/:id', async (req, res) => {
  try {
    const reparations = await Reparation.find({ produit: req.params.id }).populate('produit');
    res.json(reparations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/produit/:id', async (req, res) => {
  try {
    const produit = await Produit.findById(req.params.id);
    if (!produit) return res.status(404).json({ erreur: 'Produit non trouvé' });
    res.json(produit);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});


module.exports = router;
