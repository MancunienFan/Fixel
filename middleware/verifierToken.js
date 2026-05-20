const jwt = require('jsonwebtoken');
const Utilisateur = require('../models/utilisateur');

const verifierToken = (rolesAutorises = []) => {
  return async (req, res, next) => {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Configuration JWT manquante.' });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Token manquant.' });
    }

    try {
      const user = jwt.verify(token, process.env.JWT_SECRET);

      const utilisateur = await Utilisateur.findById(user.id).select('role actif status');
      if (!utilisateur || utilisateur.actif === false || (utilisateur.status && utilisateur.status !== 'active')) {
        return res.status(403).json({ message: 'Compte inactif ou introuvable.' });
      }

      if (rolesAutorises.length && !rolesAutorises.includes(utilisateur.role)) {
        return res.status(403).json({ message: 'Acces refuse. Role non autorise.' });
      }

      const utilisateurToken = {
        id: String(utilisateur._id),
        role: utilisateur.role
      };

      req.user = utilisateurToken;
      req.utilisateur = utilisateurToken;
      next();
    } catch (err) {
      return res.status(403).json({ message: 'Token invalide ou expire.' });
    }
  };
};

module.exports = verifierToken;
