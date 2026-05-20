const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const crypto = require('crypto');
const Utilisateur = require('../models/utilisateur');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const verifierToken = require('../middleware/verifierToken');
const { ROLES_AUTORISES } = require('../middleware/permissions');
const { sendEmail } = require('../utils/emailSender');

const INVITATION_EXPIRATION_HEURES = 48;

router.post('/register', verifierToken(['admin']), creerUtilisateur);
router.post('/', verifierToken(['admin']), creerUtilisateur);
router.post('/invite', verifierToken(['admin']), inviterUtilisateur);
router.post('/resend-invitation/:id', verifierToken(['admin']), renvoyerInvitation);
router.get('/invite/:token', lireInvitation);
router.post('/accept-invitation', accepterInvitation);

async function creerUtilisateur(req, res) {
  try {
    const { nom, email, motdepasse, role, actif } = req.body;

    if (!nom || !email || !motdepasse) {
      return res.status(400).json({ erreur: 'Nom, email et mot de passe requis.' });
    }

    if (role && !ROLES_AUTORISES.includes(role)) {
      return res.status(400).json({ erreur: 'Role invalide.' });
    }

    const utilisateur = new Utilisateur({
      nom,
      email,
      motdepasse,
      role: role || 'consultant',
      actif: actif !== false && actif !== 'false',
      status: actif === false || actif === 'false' ? 'disabled' : 'active',
      activatedAt: new Date()
    });
    await utilisateur.save();

    const utilisateurSansMotDePasse = await Utilisateur.findById(utilisateur._id).select('-motdepasse');
    res.status(201).json({ message: 'Utilisateur enregistre.', utilisateur: utilisateurSansMotDePasse });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ erreur: 'Email deja utilise.' });
    }
    res.status(400).json({ erreur: err.message });
  }
}

async function inviterUtilisateur(req, res) {
  try {
    const { nom, email, role } = req.body;

    if (!nom || !email || !role) {
      return res.status(400).json({ erreur: 'Nom, email et role requis.' });
    }

    if (!ROLES_AUTORISES.includes(role)) {
      return res.status(400).json({ erreur: 'Role invalide.' });
    }

    const existant = await Utilisateur.findOne({ email });
    if (existant && existant.status === 'active') {
      return res.status(409).json({ erreur: 'Un compte actif existe deja avec cet email.' });
    }
    if (existant && existant.status === 'disabled') {
      return res.status(409).json({ erreur: 'Un compte desactive existe deja avec cet email.' });
    }

    const { token, tokenHash, expiresAt } = genererInvitation();
    const invitedAt = new Date();
    let utilisateur = existant;

    if (utilisateur) {
      utilisateur.set({
        nom,
        role,
        motdepasse: undefined,
        status: 'invited',
        actif: false,
        invitationTokenHash: tokenHash,
        invitationExpiresAt: expiresAt,
        invitedAt,
        invitedBy: req.utilisateur.id,
        activatedAt: undefined
      });
    } else {
      utilisateur = new Utilisateur({
        nom,
        email,
        role,
        status: 'invited',
        actif: false,
        invitationTokenHash: tokenHash,
        invitationExpiresAt: expiresAt,
        invitedAt,
        invitedBy: req.utilisateur.id
      });
    }

    await utilisateur.save();
    await envoyerInvitationUtilisateur(req, utilisateur, token);

    const utilisateurSansMotDePasse = await Utilisateur.findById(utilisateur._id).select('-motdepasse -invitationTokenHash');
    res.status(201).json({ message: 'Invitation envoyee.', utilisateur: utilisateurSansMotDePasse });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ erreur: 'Email deja utilise.' });
    }
    res.status(400).json({ erreur: err.message });
  }
}

async function renvoyerInvitation(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ erreur: 'ID utilisateur invalide.' });
    }

    const utilisateur = await Utilisateur.findById(req.params.id);
    if (!utilisateur) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    }
    if (utilisateur.status === 'active') {
      return res.status(409).json({ erreur: 'Cet utilisateur est deja actif.' });
    }

    const { token, tokenHash, expiresAt } = genererInvitation();
    utilisateur.set({
      status: 'invited',
      actif: false,
      invitationTokenHash: tokenHash,
      invitationExpiresAt: expiresAt,
      invitedAt: new Date(),
      invitedBy: req.utilisateur.id
    });

    await utilisateur.save();
    await envoyerInvitationUtilisateur(req, utilisateur, token);

    const utilisateurSansMotDePasse = await Utilisateur.findById(utilisateur._id).select('-motdepasse -invitationTokenHash');
    res.json({ message: 'Invitation renvoyee.', utilisateur: utilisateurSansMotDePasse });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
}

async function lireInvitation(req, res) {
  try {
    const utilisateur = await trouverUtilisateurParToken(req.params.token);
    if (!utilisateur.ok) {
      return res.status(utilisateur.statusCode).json({ erreur: utilisateur.message });
    }

    res.json({
      nom: utilisateur.user.nom,
      email: utilisateur.user.email,
      role: utilisateur.user.role,
      invitationExpiresAt: utilisateur.user.invitationExpiresAt
    });
  } catch (err) {
    res.status(400).json({ erreur: 'Invitation invalide.' });
  }
}

async function accepterInvitation(req, res) {
  try {
    const { token, motdepasse } = req.body;

    if (!motdepasse || motdepasse.length < 12) {
      return res.status(400).json({ erreur: 'Le mot de passe doit contenir au moins 12 caracteres.' });
    }

    const resultat = await trouverUtilisateurParToken(token);
    if (!resultat.ok) {
      return res.status(resultat.statusCode).json({ erreur: resultat.message });
    }

    const utilisateur = resultat.user;
    utilisateur.motdepasse = motdepasse;
    utilisateur.status = 'active';
    utilisateur.actif = true;
    utilisateur.activatedAt = new Date();
    utilisateur.invitationTokenHash = undefined;
    utilisateur.invitationExpiresAt = undefined;
    await utilisateur.save();

    res.json({ message: 'Compte active.' });
  } catch (err) {
    res.status(400).json({ erreur: err.message });
  }
}

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

    if (utilisateur.actif === false || (utilisateur.status && utilisateur.status !== 'active')) {
      return res.status(403).json({ erreur: 'Compte non actif.' });
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

    utilisateur.derniereConnexion = new Date();
    await utilisateur.save();

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
    await expirerInvitationsDepassees();
    const utilisateurs = await Utilisateur.find().select('-motdepasse -invitationTokenHash').sort({ dateCreation: -1 });
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
        actif: { $ne: false },
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

router.put('/:id', verifierToken(['admin']), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ erreur: 'ID utilisateur invalide.' });
    }

    const { nom, email, role, actif, status } = req.body;
    const updateData = {};

    if (nom !== undefined) updateData.nom = nom;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) {
      if (!ROLES_AUTORISES.includes(role)) {
        return res.status(400).json({ erreur: 'Role invalide.' });
      }
      updateData.role = role;
    }
    if (actif !== undefined) {
      updateData.actif = actif === true || actif === 'true';
      updateData.status = updateData.actif ? 'active' : 'disabled';
    }
    if (status !== undefined) {
      if (!['active', 'disabled'].includes(status)) {
        return res.status(400).json({ erreur: 'Statut invalide.' });
      }
      updateData.status = status;
      updateData.actif = status === 'active';
    }

    const utilisateurActuel = await Utilisateur.findById(req.params.id);
    if (!utilisateurActuel) {
      return res.status(404).json({ erreur: 'Utilisateur introuvable.' });
    }

    const retireDernierAdmin = utilisateurActuel.role === 'admin'
      && updateData.role
      && updateData.role !== 'admin';
    const desactiveDernierAdmin = utilisateurActuel.role === 'admin'
      && updateData.actif === false;

    if (retireDernierAdmin || desactiveDernierAdmin) {
      const adminsRestants = await Utilisateur.countDocuments({
        role: 'admin',
        actif: { $ne: false },
        _id: { $ne: utilisateurActuel._id }
      });

      if (adminsRestants === 0) {
        return res.status(409).json({ erreur: 'Impossible de retirer ou desactiver le dernier admin.' });
      }
    }

    if (updateData.status === 'active' && !utilisateurActuel.motdepasse) {
      return res.status(409).json({ erreur: 'Cet utilisateur doit accepter son invitation avant activation.' });
    }

    const utilisateur = await Utilisateur.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-motdepasse');

    res.json({ message: 'Utilisateur mis a jour.', utilisateur });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ erreur: 'Email deja utilise.' });
    }
    res.status(400).json({ erreur: err.message });
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
        actif: { $ne: false },
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

function genererInvitation() {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    token,
    tokenHash: hashInvitationToken(token),
    expiresAt: new Date(Date.now() + INVITATION_EXPIRATION_HEURES * 60 * 60 * 1000)
  };
}

function hashInvitationToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function trouverUtilisateurParToken(token) {
  if (!token) {
    return { ok: false, statusCode: 400, message: 'Token invitation manquant.' };
  }

  const tokenHash = hashInvitationToken(token);
  const user = await Utilisateur.findOne({ invitationTokenHash: tokenHash });

  if (!user || user.status !== 'invited') {
    return { ok: false, statusCode: 404, message: 'Invitation invalide ou deja utilisee.' };
  }

  if (!user.invitationExpiresAt || user.invitationExpiresAt < new Date()) {
    user.status = 'expired';
    user.actif = false;
    user.invitationTokenHash = undefined;
    await user.save();
    return { ok: false, statusCode: 410, message: 'Invitation expiree.' };
  }

  return { ok: true, user };
}

async function envoyerInvitationUtilisateur(req, utilisateur, token) {
  const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const lien = `${baseUrl}/invitation/accept?token=${encodeURIComponent(token)}`;
  const nom = utilisateur.nom || 'Utilisateur';

  return sendEmail({
    to: utilisateur.email,
    subject: 'Invitation a rejoindre Fixel',
    text: [
      `Bonjour ${nom},`,
      '',
      'Vous avez ete invite a rejoindre Fixel.',
      'Cliquez sur le lien ci-dessous pour creer votre mot de passe et activer votre compte.',
      '',
      lien,
      '',
      `Ce lien expirera dans ${INVITATION_EXPIRATION_HEURES} heures.`,
      '',
      "Merci,",
      "L'equipe Fixel"
    ].join('\n'),
    html: `
      <p>Bonjour ${echapperHtml(nom)},</p>
      <p>Vous avez ete invite a rejoindre Fixel.</p>
      <p>Cliquez sur le lien ci-dessous pour creer votre mot de passe et activer votre compte.</p>
      <p><a href="${lien}" style="display:inline-block;padding:10px 14px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;">Creer mon compte</a></p>
      <p>Ce lien expirera dans ${INVITATION_EXPIRATION_HEURES} heures.</p>
      <p>Merci,<br>L'equipe Fixel</p>
    `
  });
}

async function expirerInvitationsDepassees() {
  await Utilisateur.updateMany(
    {
      status: 'invited',
      invitationExpiresAt: { $lt: new Date() }
    },
    {
      $set: { status: 'expired', actif: false },
      $unset: { invitationTokenHash: '' }
    }
  );
}

function echapperHtml(valeur) {
  return String(valeur || '').replace(/[&<>"']/g, caractere => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[caractere]));
}
