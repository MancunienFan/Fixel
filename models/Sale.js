const mongoose = require('mongoose');
const Counter = require('./Counter');

const saleItemSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['produit', 'accessoire', 'manuel'],
    required: true,
    default: 'manuel'
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Produit'
  },
  accessoryId: {
    type: mongoose.Schema.Types.ObjectId
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  quantite: {
    type: Number,
    min: 0,
    default: 1
  },
  prixUnitaire: {
    type: Number,
    min: 0,
    default: 0
  },
  coutUnitaire: {
    type: Number,
    min: 0,
    default: 0
  },
  totalLigne: {
    type: Number,
    min: 0,
    default: 0
  },
  coutLigne: {
    type: Number,
    min: 0,
    default: 0
  },
  profitLigne: {
    type: Number,
    default: 0
  }
}, { _id: true });

const saleSchema = new mongoose.Schema({
  numeroVente: {
    type: Number,
    unique: true,
    index: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    default: null,
    index: true
  },
  dateVente: {
    type: Date,
    default: Date.now,
    index: true
  },
  items: [saleItemSchema],
  sousTotal: { type: Number, min: 0, default: 0 },
  rabais: { type: Number, min: 0, default: 0 },
  sousTotalApresRabais: { type: Number, min: 0, default: 0 },
  taxesActivees: { type: Boolean, default: false },
  tauxTPS: { type: Number, min: 0, default: 0.05 },
  tauxTVQ: { type: Number, min: 0, default: 0.09975 },
  montantTPS: { type: Number, min: 0, default: 0 },
  montantTVQ: { type: Number, min: 0, default: 0 },
  totalTaxes: { type: Number, min: 0, default: 0 },
  total: { type: Number, min: 0, default: 0 },
  coutTotal: { type: Number, min: 0, default: 0 },
  profitTotal: { type: Number, default: 0 },
  modePaiement: {
    type: String,
    enum: ['comptant', 'interac', 'virement', 'carte', 'autre'],
    default: 'comptant',
    index: true
  },
  statutPaiement: {
    type: String,
    enum: ['paye', 'partiellement paye', 'non paye'],
    default: 'non paye',
    index: true
  },
  montantPaye: { type: Number, min: 0, default: 0 },
  solde: { type: Number, min: 0, default: 0 },
  datePaiement: Date,
  factureGeneree: { type: Boolean, default: false, index: true },
  factureId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Facture',
    default: null,
    index: true
  },
  facturePdfPath: { type: String, trim: true, default: '' },
  factureNumero: { type: Number, index: true },
  factureDate: Date,
  factureEnvoyee: { type: Boolean, default: false, index: true },
  factureEnvoyeeLe: Date,
  envoyerFactureEmail: { type: Boolean, default: false },
  emailFacture: { type: String, trim: true, lowercase: true, default: '' },
  erreurEnvoiFacture: { type: String, trim: true, default: '' },
  garantieActive: { type: Boolean, default: false },
  garantieJours: { type: Number, min: 0, default: 30 },
  noteGarantie: { type: String, trim: true, maxlength: 1000, default: '' },
  dateDebutGarantie: Date,
  dateFinGarantie: Date,
  notes: { type: String, trim: true, maxlength: 2000, default: '' },
  statut: {
    type: String,
    enum: ['active', 'annulee'],
    default: 'active',
    index: true
  },
  statutVente: {
    type: String,
    enum: ['active', 'annulee'],
    default: 'active',
    index: true
  },
  annuleeLe: Date,
  annuleePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur'
  },
  deletedAt: Date,
  raisonAnnulation: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
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

saleSchema.index({ dateVente: -1, numeroVente: -1 });
saleSchema.index({ 'items.productId': 1 });

saleSchema.pre('validate', async function (next) {
  if (this.isNew && !this.numeroVente) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'sale' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    this.numeroVente = counter.seq;
  }

  if (this.factureGeneree && !this.factureNumero) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'saleInvoice' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    this.factureNumero = counter.seq;
    this.factureDate = this.factureDate || new Date();
  }

  next();
});

module.exports = mongoose.model('Sale', saleSchema);
