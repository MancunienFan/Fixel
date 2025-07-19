const jwt = require('jsonwebtoken');

const verifierToken = (rolesAutorises = []) => {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Token manquant.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ message: 'Token invalide ou expiré.' });
      }

      if (rolesAutorises.length && !rolesAutorises.includes(user.role)) {
        return res.status(403).json({ message: 'Accès refusé. Rôle non autorisé.' });
      }

      req.user = user; // optionnel mais utile
      next();
    });
  };
};

module.exports = verifierToken;
