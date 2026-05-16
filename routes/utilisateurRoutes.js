const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Utilisateur = require('../models/utilisateur');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const verifierToken = require('../middleware/verifierToken');

const ROLES_AUTORISES = ['admin', 'mod', 'consultant'];

router.post('/register', verifierToken(['admin']), async (req, res) => {
  try {
    const { nom, email, motdepasse, role } = req.body;

    if (!email || !motdepasse) {
      return res.status(400).json({ erreur: 'Email et mot de passe requis.' });
    }

    if (role && !ROLES_AUTORISES.includes(role)) {
      return res.status(400).json({ erreur: 'Role invalide.' });
    }

    const utilisateur = new Utilisateur({ nom, email, motdepasse, role });
    await utilisateur.save();
    res.status(201).json({ message: 'Utilisateur enregistre.' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ erreur: 'Email deja utilise.' });
    }
    res.status(400).json({ erreur: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, motdepasse } = req.body;

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ erreur: 'Configuration JWT manquante.' });
    }

    if (!email || !motdepasse) {
      return res.status(400).json({ erreur: 'Email et mot de passe requis.' });
    }

    const utilisateur = await Utilisateur.findOne({ email });
    if (!utilisateur) {
      return res.status(401).json({ erreur: 'Identifiants invalides.' });
    }

    const match = await bcrypt.compare(motdepasse, utilisateur.motdepasse);
    if (!match) {
      return res.status(401).json({ erreur: 'Identifiants invalides.' });
    }

    const token = jwt.sign(
      { id: utilisateur._id, role: utilisateur.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ token, role: utilisateur.role });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.get('/profil', verifierToken(), async (req, res) => {
  try {
    const utilisateur = await Utilisateur.findById(req.utilisateur.id).select('-motdepasse');
    if (!utilisateur) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    }
    res.json(utilisateur);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.get('/liste', verifierToken(['admin']), async (req, res) => {
  try {
    const utilisateurs = await Utilisateur.find().select('-motdepasse');
    res.json(utilisateurs);
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.put('/:id/role', verifierToken(['admin']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ erreur: 'ID utilisateur invalide.' });
    }

    if (!ROLES_AUTORISES.includes(req.body.role)) {
      return res.status(400).json({ erreur: 'Role invalide.' });
    }

    const utilisateurActuel = await Utilisateur.findById(req.params.id);
    if (!utilisateurActuel) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    }

    if (utilisateurActuel.role === 'admin' && req.body.role !== 'admin') {
      const adminsRestants = await Utilisateur.countDocuments({
        role: 'admin',
        _id: { $ne: utilisateurActuel._id }
      });

      if (adminsRestants === 0) {
        return res.status(409).json({ erreur: 'Impossible de retirer le role du dernier admin.' });
      }
    }

    const utilisateur = await Utilisateur.findByIdAndUpdate(
      req.params.id,
      { role: req.body.role },
      { new: true }
    ).select('-motdepasse');

    if (!utilisateur) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    }

    res.json({ message: 'Role mis a jour.', utilisateur });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

router.delete('/:id', verifierToken(['admin']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ erreur: 'ID utilisateur invalide.' });
    }

    if (req.utilisateur.id === req.params.id) {
      return res.status(409).json({ erreur: 'Impossible de supprimer votre propre compte.' });
    }

    const utilisateur = await Utilisateur.findById(req.params.id);
    if (!utilisateur) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    }

    if (utilisateur.role === 'admin') {
      const adminsRestants = await Utilisateur.countDocuments({
        role: 'admin',
        _id: { $ne: utilisateur._id }
      });

      if (adminsRestants === 0) {
        return res.status(409).json({ erreur: 'Impossible de supprimer le dernier admin.' });
      }
    }

    await utilisateur.deleteOne();
    res.json({ message: 'Utilisateur supprime.' });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

module.exports = router;
