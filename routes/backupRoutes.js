const express = require('express');

const Client = require('../models/clientModel');
const Produit = require('../models/produitModel');
const Reparation = require('../models/reparationModel');
const Facture = require('../models/Facture');
const Sale = require('../models/Sale');
const { SavReturn } = require('../models/savReturnModel');
const Utilisateur = require('../models/utilisateur');
const AuditLog = require('../models/AuditLog');
const { requireRole } = require('../middleware/permissions');

const router = express.Router();

router.get('/download', requireRole('admin'), async (req, res) => {
  try {
    const generatedAt = new Date();
    const [
      clients,
      produits,
      reparations,
      factures,
      ventes,
      savReturns,
      utilisateurs,
      auditLogs
    ] = await Promise.all([
      Client.find().lean(),
      Produit.find().lean(),
      Reparation.find().lean(),
      Facture.find().lean(),
      Sale.find().lean(),
      SavReturn.find().lean(),
      Utilisateur.find().select('-motdepasse -invitationTokenHash').lean(),
      AuditLog.find().sort({ createdAt: -1 }).limit(5000).lean()
    ]);

    const backup = {
      app: 'Fixel',
      version: 1,
      generatedAt: generatedAt.toISOString(),
      collections: {
        clients,
        produits,
        reparations,
        factures,
        ventes,
        savReturns,
        utilisateurs,
        auditLogs
      }
    };

    res.set({
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="fixel-backup-${generatedAt.toISOString().slice(0, 10)}.json"`
    });
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    console.error('Erreur sauvegarde :', err);
    res.status(500).json({ erreur: 'Erreur sauvegarde.' });
  }
});

module.exports = router;
