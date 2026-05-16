const mongoose = require('mongoose');
const {
  nettoyerTexte,
  nettoyerTexteMinuscule,
  emailValide,
  telephoneValide
} = require('../utils/validators');

const clientSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 80,
    set: nettoyerTexte
  },
  prenom: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 80,
    set: nettoyerTexte
  },
  telephone: {
    type: String,
    required: true,
    trim: true,
    maxlength: 30,
    set: nettoyerTexte,
    validate: {
      validator: telephoneValide,
      message: 'Telephone invalide.'
    }
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 120,
    set: nettoyerTexteMinuscule,
    validate: {
      validator: emailValide,
      message: 'Email invalide.'
    }
  },
  photo: {
    type: String,
    trim: true,
    set: nettoyerTexte
  },
  dateCreation: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  dateModification: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  }
});

clientSchema.index({ email: 1 }, {
  unique: true,
  sparse: true,
  partialFilterExpression: { email: { $type: 'string' } }
});
clientSchema.index({ telephone: 1 });
clientSchema.index({ nom: 1, prenom: 1 });

clientSchema.virtual('datecreationFormatte').get(function () {
  return this.dateCreation ? this.dateCreation.toLocaleDateString('fr-FR') : '';
});

clientSchema.pre('findOneAndUpdate', function (next) {
  this.set({ dateModification: new Date() });
  next();
});

clientSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Client', clientSchema);
