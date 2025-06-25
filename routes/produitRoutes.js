const express = require('express');
const router = express.Router();
const Produit = require('../models/produitModel');

// GET tous les produits
router.get('/', async (req, res) => {
  const produits = await Produit.find();
  res.json(produits);
});

// POST un produit
router.post('/', async (req, res) => {
  try {
    const produit = new Produit(req.body);
    await produit.save();
    res.status(201).json(produit);
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

// Récupérer toutes les réparations pour un produit donné
router.get('/produit/:id', async (req, res) => {
  try {
    const reparations = await Reparation.find({ produit: req.params.id }).populate('produit');
    res.json(reparations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
