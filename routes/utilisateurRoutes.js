const express = require('express');
const router = express.Router();
const Utilisateur = require('../models/utilisateur');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SECRET = "secret123"; // ⚠️ À remplacer par une vraie variable d'env

// Inscription
router.post('/register', async (req, res) => {
  try {
    const utilisateur = new Utilisateur(req.body);
    await utilisateur.save();
    res.status(201).json({ message: "Utilisateur enregistré." });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
});

// Connexion
router.post('/login', async (req, res) => {
  const { email, motdepasse } = req.body;
  const utilisateur = await Utilisateur.findOne({ email });
  if (!utilisateur) return res.status(401).json({ erreur: "Email invalide." });

  const match = await bcrypt.compare(motdepasse, utilisateur.motdepasse);
  if (!match) return res.status(401).json({ erreur: "Mot de passe invalide." });

  const token = jwt.sign({ id: utilisateur._id, role: utilisateur.role }, SECRET, { expiresIn: '1h' });
  res.json({ token, role: utilisateur.role });
});

// Middleware pour vérifier le token
const verifierToken = (rolesAutorises = []) => {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(403).json({ erreur: "Token manquant" });

    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, SECRET);
      req.utilisateur = decoded;
      if (rolesAutorises.length && !rolesAutorises.includes(decoded.role)) {
        return res.status(403).json({ erreur: "Accès interdit" });
      }
      next();
    } catch (err) {
      res.status(403).json({ erreur: "Token invalide" });
    }
  };
};

// Route test avec autorisation
router.get('/profil', verifierToken(), async (req, res) => {
  const utilisateur = await Utilisateur.findById(req.utilisateur.id).select('-motdepasse');
  res.json(utilisateur);
});


router.get('/liste', verifierToken(['admin']), async (req, res) => {
  const utilisateurs = await Utilisateur.find().select('-motdepasse');
  res.json(utilisateurs);
});


// Changer le rôle d'un utilisateur
router.put('/:id/role', verifierToken(['admin']), async (req, res) => {
  try {
    await Utilisateur.findByIdAndUpdate(req.params.id, { role: req.body.role });
    res.json({ message: "Rôle mis à jour." });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

// Supprimer un utilisateur
router.delete('/:id', verifierToken(['admin']), async (req, res) => {
  try {
    await Utilisateur.findByIdAndDelete(req.params.id);
    res.json({ message: "Utilisateur supprimé." });
  } catch (err) {
    res.status(500).json({ erreur: err.message });
  }
});

module.exports = router;

