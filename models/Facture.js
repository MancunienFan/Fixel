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
  type: {
    type: String,
    enum: ['reparation', 'vente', 'sav', 'autre'],
    default: 'reparation',
    index: true
  },
  sourceId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  sourceModel: {
    type: String,
    enum: ['Sale', 'Reparation', 'SAV', 'Other', 'Produit'],
    default: 'Produit',
    index: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    default: null,
    index: true
  },
  clientNomAffiche: {
    type: String,
    trim: true,
    default: '',
    set: nettoyerTexte
  },
  produit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Produit',
    default: null,
    index: true
  },
  sale: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
    default: null,
    index: true
  },
  reparations: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reparation'
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
  taxesActivees: {
    type: Boolean,
    default: false
  },
  rabais: {
    type: Number,
    min: 0,
    default: 0
  },
  montantTPS: {
    type: Number,
    min: 0,
    default: 0
  },
  montantTVQ: {
    type: Number,
    min: 0,
    default: 0
  },
  totalTaxes: {
    type: Number,
    min: 0,
    default: 0
  },
  statutPaiement: {
    type: String,
    trim: true,
    default: '',
    set: nettoyerTexte
  },
  envoyeeParEmail: {
    type: Boolean,
    default: false
  },
  emailEnvoye: {
    type: Boolean,
    default: false
  },
  dateEnvoiEmail: Date,
  emailEnvoyeLe: Date,
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
  },
  pdfPath: {
    type: String,
    trim: true,
    default: '',
    set: nettoyerTexte
  },
  statutFacture: {
    type: String,
    enum: ['active', 'annulee'],
    default: 'active',
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur'
  }
}, { timestamps: true });

factureSchema.index({ client: 1, date: -1 });
factureSchema.index({ produit: 1, date: -1 });
factureSchema.index({ statut: 1, date: -1 });
factureSchema.index({ reparations: 1 });
factureSchema.index({ type: 1, date: -1 });
factureSchema.index({ sourceModel: 1, sourceId: 1 });
factureSchema.index(
  { sale: 1 },
  { unique: true, partialFilterExpression: { sale: { $type: 'objectId' } } }
);

const Counter = require('./Counter');

factureSchema.pre('validate', function (next) {
  if (!this.type) this.type = 'reparation';
  if (!this.sourceModel) this.sourceModel = this.type === 'vente' ? 'Sale' : 'Produit';
  if (this.type === 'vente' && this.sale && !this.sourceId) this.sourceId = this.sale;
  if (this.type === 'reparation' && (!this.reparations || this.reparations.length === 0)) {
    this.invalidate('reparations', 'Au moins une reparation est requise.');
  }
  this.taxesActivees = Boolean(this.taxesActivees || this.inclureTaxes);
  this.emailEnvoye = Boolean(this.emailEnvoye || this.envoyeeParEmail);
  if (this.emailEnvoyeLe && !this.dateEnvoiEmail) this.dateEnvoiEmail = this.emailEnvoyeLe;
  if (this.dateEnvoiEmail && !this.emailEnvoyeLe) this.emailEnvoyeLe = this.dateEnvoiEmail;
  if (this.pdfPath && !this.fichierPDF) this.fichierPDF = this.pdfPath;
  if (this.fichierPDF && !this.pdfPath) this.pdfPath = this.fichierPDF;
  next();
});

factureSchema.pre('save', async function (next) {
  if (this.isNew && !this.numeroFacture) {
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
