const express = require('express');
const router = express.Router();
const Produit = require('../models/produitModel');

// GET tous les produits
/*
router.get('/produits', async (req, res) => {
  const produits = await Produit.find();
  res.json(produits);
});*/

router.get('/produits', async (req, res) => {
  try {
    const produits = await Produit.find({ type: 'stock' }).sort({ dateachat: -1 });
    res.json(produits);
  } catch (err) {
    console.error('Erreur lors de la récupération des produits :', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
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

// PUT : mise à jour
router.put('/produit/:id', async (req, res) => {
  try {
    const produit = await Produit.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!produit) return res.status(404).json({ erreur: 'Produit non trouvé' });
    res.json(produit);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// DELETE : suppression
router.delete('/produit/:id', async (req, res) => {
  try {
    const deleted = await Produit.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ erreur: 'Produit non trouvé' });
    res.json({ message: 'Produit supprimé' });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});


router.get('/produits/client/:clientId', async (req, res) => {
  try {
    const produits = await Produit.find({
      clientId: req.params.clientId,
      type: "client"  // Important pour filtrer les téléphones du client
    });
    res.json(produits);
  } catch (err) {
    res.status(500).send(err.message);
  }
});


router.post('/produits/client/:clientId', async (req, res) => {
  try {
    const nouveauProduit = new Produit({
      ...req.body,
      clientId: req.params.clientId,
      type: "client", // on force le type ici
      dateCreation: new Date(),
      dateModification: new Date()
    });

    const savedProduit = await nouveauProduit.save();
    res.status(201).json(savedProduit);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});



module.exports = router;
