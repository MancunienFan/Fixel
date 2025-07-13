const express = require('express');
const router = express.Router();
const Reparation = require('../models/reparationModel');
const Produit = require('../models/produitModel');


//-1 Obtenir toutes les réparations d’un produit
router.get('/reparations/produit/:id', async (req, res) => {
  try {
    const reparations = await Reparation.find({ produit: req.params.id });
    res.json(reparations);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

//-2 ajouter réparation

router.post('/reparation', async (req, res) => {
  try {
    const { produit, description, date, prix, statut, notes } = req.body;

    // 1. Vérifier que l'ID produit est fourni
    if (!produit) {
      return res.status(400).json({ erreur: "ID du produit requis." });
    }

    // 2. Vérifier que le produit existe
    const produitExiste = await Produit.findById(produit);
    if (!produitExiste) {
      return res.status(404).json({ erreur: "Produit introuvable." });
    }

    // 3. Créer la réparation
    const reparation = new Reparation({
      produit,
      description,
      date: date || new Date(),
      prix,
      statut: statut || 'en cours',
      notes: notes || ''
    });

    await reparation.save();
    res.status(201).json(reparation);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// GET réparation par ID
router.get('/reparations/:id', async (req, res) => {
  const reparation = await Reparation.findById(req.params.id);
  res.json(reparation);
});

// PUT mise à jour
router.put('/reparations/:id', async (req, res) => {
  try {
    const r = await Reparation.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(r);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// DELETE
router.delete('/reparations/:id', async (req, res) => {
  try {
    await Reparation.findByIdAndDelete(req.params.id);
    res.json({ message: "Supprimée" });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});




///////////////////////////////////////

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


// GET /api/reparations/client/:clientId
router.get('/client/:clientId', async (req, res) => {
  try {
    const reparations = await Reparation.find({ clientId: req.params.clientId });
    res.json(reparations);
  } catch (err) {
    res.status(500).send(err.message);
  }
});



module.exports = router;
