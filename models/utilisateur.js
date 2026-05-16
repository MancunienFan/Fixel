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
    required: true,
    minlength: 8
  },
  role: {
    type: String,
    enum: ['admin', 'mod', 'consultant'],
    default: 'consultant',
    index: true
  }
});

utilisateurSchema.pre('save', async function (next) {
  if (!this.isModified('motdepasse')) return next();
  this.motdepasse = await bcrypt.hash(this.motdepasse, 10);
  next();
});

module.exports = mongoose.model('utilisateur', utilisateurSchema);
