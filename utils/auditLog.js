const AuditLog = require('../models/AuditLog');

async function journaliser(req, entree) {
  try {
    const utilisateur = req && req.utilisateur;
    await AuditLog.create({
      action: entree.action,
      entity: entree.entity,
      entityId: entree.entityId,
      entityLabel: entree.entityLabel || '',
      utilisateur: utilisateur && utilisateur.id,
      role: utilisateur && utilisateur.role || '',
      details: entree.details || {}
    });
  } catch (err) {
    console.error('Erreur journal activite :', err.message);
  }
}

module.exports = {
  journaliser
};
