const express = require('express');
const router = express.Router();
const Reparation = require('../models/reparationModel');

// Ajouter une réparation à un produit
router.post('/', async (req, res) => {
  try {
    const reparation = new Reparation(req.body);
    await reparation.save();
    res.status(201).json(reparation);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Récupérer toutes les réparations
router.get('/', async (req, res) => {
  try {
    const reparations = await Reparation.find().populate('produit');
    res.json(reparations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Récupérer les réparations d’un produit
router.get('/:id', async (req, res) => {
  try {
    const reparations = await Reparation.find({ produit: req.params.id });
    res.json(reparations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
