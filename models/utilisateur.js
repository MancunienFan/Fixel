const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const {
  nettoyerTexte,
  nettoyerTexteMinuscule,
  emailValide
} = require('../utils/validators');

const utilisateurSchema = new mongoose.Schema({
  nom: {
    type: String,
    trim: true,
    maxlength: 80,
    set: nettoyerTexte
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    set: nettoyerTexteMinuscule,
    validate: {
      validator: emailValide,
      message: 'Email invalide.'
    }
  },
  motdepasse: {
    type: String,
    required: function () {
      return this.status === 'active';
    },
    minlength: 8
  },
  role: {
    type: String,
    enum: ['admin', 'mod', 'consultant'],
    default: 'consultant',
    index: true
  },
  actif: {
    type: Boolean,
    default: true,
    index: true
  },
  status: {
    type: String,
    enum: ['invited', 'active', 'disabled', 'expired'],
    default: 'active',
    index: true
  },
  invitationTokenHash: {
    type: String,
    index: true
  },
  invitationExpiresAt: {
    type: Date
  },
  invitedAt: {
    type: Date
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'utilisateur'
  },
  activatedAt: {
    type: Date
  },
  derniereConnexion: {
    type: Date
  }
}, {
  timestamps: {
    createdAt: 'dateCreation',
    updatedAt: 'dateModification'
  }
});

utilisateurSchema.pre('save', async function (next) {
  if (!this.isModified('motdepasse') || !this.motdepasse) return next();
  this.motdepasse = await bcrypt.hash(this.motdepasse, 10);
  next();
});

utilisateurSchema.pre('validate', function (next) {
  if (!this.status) {
    this.status = this.actif === false ? 'disabled' : 'active';
  }

  if (this.status === 'disabled') {
    this.actif = false;
  } else if (this.status === 'active') {
    this.actif = true;
  } else if (['invited', 'expired'].includes(this.status)) {
    this.actif = false;
  }

  next();
});

module.exports = mongoose.model('utilisateur', utilisateurSchema);
