const mongoose = require('mongoose');
const {
  nettoyerTexte,
  nettoyerTexteMinuscule,
  emailValide
} = require('../utils/validators');

const factureSchema = new mongoose.Schema({
  numeroFacture: {
    type: Number,
    unique: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true
  },
  produit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Produit',
    required: true,
    index: true
  },
  reparations: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reparation',
    required: true
  }],
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  dateEmission: {
    type: Date,
    default: Date.now
  },
  datePaiement: Date,
  statut: {
    type: String,
    enum: ['emise', 'envoyee', 'payee', 'annulee'],
    default: 'emise',
    index: true
  },
  inclureTaxes: {
    type: Boolean,
    default: false
  },
  envoyeeParEmail: {
    type: Boolean,
    default: false
  },
  dateEnvoiEmail: Date,
  emailDestinataire: {
    type: String,
    trim: true,
    lowercase: true,
    set: nettoyerTexteMinuscule,
    validate: {
      validator: emailValide,
      message: 'Email destinataire invalide.'
    }
  },
  modePaiement: {
    type: String,
    trim: true,
    maxlength: 80,
    set: nettoyerTexte
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  tps: {
    type: Number,
    min: 0,
    default: 0
  },
  tvq: {
    type: Number,
    min: 0,
    default: 0
  },
  totalHT: {
    type: Number,
    min: 0,
    default: 0
  },
  totalTTC: {
    type: Number,
    min: 0,
    default: 0
  },
  fichierPDF: {
    type: String,
    trim: true,
    set: nettoyerTexte
  }
});

factureSchema.index({ client: 1, date: -1 });
factureSchema.index({ produit: 1, date: -1 });
factureSchema.index({ statut: 1, date: -1 });
factureSchema.index({ reparations: 1 });

const Counter = require('./Counter');

factureSchema.pre('validate', function (next) {
  if (!this.reparations || this.reparations.length === 0) {
    this.invalidate('reparations', 'Au moins une reparation est requise.');
  }
  next();
});

factureSchema.pre('save', async function (next) {
  if (this.isNew) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'facture' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    this.numeroFacture = counter.seq;
  }
  next();
});

module.exports = mongoose.model('Facture', factureSchema);
