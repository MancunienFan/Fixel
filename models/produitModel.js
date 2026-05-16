const mongoose = require('mongoose');
const {
  nettoyerTexte,
  nettoyerImei,
  imeiValide
} = require('../utils/validators');

function corrigerMojibake(valeur) {
  const texte = nettoyerTexte(valeur);
  if (!texte) return undefined;
  return texte
    .replace(/\u00c3\u00a9/g, '\u00e9')
    .replace(/\u00c3\u00a8/g, '\u00e8')
    .replace(/\u00c3\u0089/g, '\u00c9');
}

function normaliserStatut(valeur) {
  const texte = corrigerMojibake(valeur);
  if (!texte) return undefined;
  const minuscule = texte.toLowerCase();
  if (minuscule === 'bon \u00e9tat') return 'bon \u00e9tat';
  if (minuscule === 'mauvais \u00e9tat') return 'mauvais \u00e9tat';
  if (minuscule === 'neuf') return 'neuf';
  return texte;
}

function normaliserDisponibilite(valeur) {
  const texte = corrigerMojibake(valeur);
  if (!texte) return undefined;
  const minuscule = texte.toLowerCase();
  if (minuscule === 'disponible') return 'disponible';
  if (minuscule === 'vendu') return 'vendu';
  if (minuscule === 'pour pi\u00e8ces') return 'Pour pi\u00e8ces';
  return texte;
}

const produitSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 120,
    set: nettoyerTexte
  },
  statut: {
    type: String,
    enum: ['neuf', 'bon \u00e9tat', 'mauvais \u00e9tat'],
    default: 'neuf',
    set: normaliserStatut
  },
  prix: {
    type: Number,
    min: 0
  },
  categorie: {
    type: String,
    trim: true,
    maxlength: 80,
    set: nettoyerTexte
  },
  etatbatterie: {
    type: Number,
    min: 0,
    max: 100
  },
  model: {
    type: String,
    trim: true,
    maxlength: 120,
    set: nettoyerTexte
  },
  prixachat: {
    type: Number,
    min: 0
  },
  prixvente: {
    type: Number,
    min: 0
  },
  dateachat: {
    type: Date,
    default: Date.now
  },
  datevente: {
    type: Date
  },
  imei: {
    type: String,
    trim: true,
    set: nettoyerImei,
    validate: {
      validator: imeiValide,
      message: 'IMEI invalide.'
    }
  },
  disponibilite: {
    type: String,
    enum: ['disponible', 'vendu', 'Pour pi\u00e8ces'],
    default: 'disponible',
    set: normaliserDisponibilite
  },
  datemodification: {
    type: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    index: true
  },
  type: {
    type: String,
    enum: ['client', 'stock'],
    required: true,
    default: 'stock'
  }
});

produitSchema.index({ imei: 1 }, {
  unique: true,
  sparse: true,
  partialFilterExpression: { imei: { $type: 'string' } }
});
produitSchema.index({ type: 1, dateachat: -1 });
produitSchema.index({ disponibilite: 1 });
produitSchema.index({ datemodification: -1 });

produitSchema.pre('validate', function (next) {
  if (this.type === 'client' && !this.clientId) {
    this.invalidate('clientId', 'Un produit client doit etre lie a un client.');
  }

  if (this.disponibilite === 'vendu' && !this.datevente) {
    this.datevente = new Date();
  }

  next();
});

produitSchema.pre('findOneAndUpdate', function (next) {
  this.set({ datemodification: new Date() });
  next();
});

produitSchema.virtual('dateachatFormatee').get(function () {
  return this.dateachat ? this.dateachat.toLocaleDateString('fr-FR') : '';
});

produitSchema.virtual('dateventeFormatee').get(function () {
  return this.datevente ? this.datevente.toLocaleDateString('fr-FR') : '';
});

produitSchema.virtual('datemodificationFormatee').get(function () {
  return this.datemodification ? this.datemodification.toLocaleDateString('fr-FR') : '';
});

produitSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Produit', produitSchema);
