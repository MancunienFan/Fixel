const express = require('express');

const AuditLog = require('../models/AuditLog');
const { requireRole } = require('../middleware/permissions');

const router = express.Router();

router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 500);
    const filtre = {};
    if (req.query.entity) filtre.entity = req.query.entity;
    if (req.query.action) filtre.action = req.query.action;

    const logs = await AuditLog.find(filtre)
      .populate('utilisateur', 'nom email role')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(logs);
  } catch (err) {
    console.error('Erreur journal activite :', err);
    res.status(500).json({ erreur: 'Erreur serveur' });
  }
});

module.exports = router;
