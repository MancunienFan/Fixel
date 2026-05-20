const mongoose = require('mongoose');
const { nettoyerTexte } = require('../utils/validators');
const Counter = require('./Counter');

const STATUTS_SAV = [
  'nouveau retour',
  'en diagnostic',
  'en attente du client',
  'en attente de piece',
  'reparation sav en cours',
  'resolu',
  'refuse',
  'non couvert par garantie',
  'ferme'
];

const TYPES_RETOUR_SAV = ['reparation', 'vente'];
const STATUTS_GARANTIE_SAV = ['oui', 'non', 'a verifier'];
const DECISIONS_SAV = [
  'a definir',
  'couvert',
  'non couvert',
  'geste commercial',
  'echange',
  'remboursement partiel',
  'reparation payante'
];

function normaliserTexteEnum(valeur) {
  const texte = nettoyerTexte(valeur);
  if (!texte) return undefined;
  return texte
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function normaliserStatutSav(valeur) {
  const texte = normaliserTexteEnum(valeur);
  if (!texte) return undefined;
  const synonymes = {
    nouveau: 'nouveau retour',
    'nouveau retour': 'nouveau retour',
    diagnostic: 'en diagnostic',
    'en diagnostic': 'en diagnostic',
    'attente client': 'en attente du client',
    'en attente client': 'en attente du client',
    'en attente du client': 'en attente du client',
    'attente piece': 'en attente de piece',
    'en attente piece': 'en attente de piece',
    'en attente de piece': 'en attente de piece',
    'sav en cours': 'reparation sav en cours',
    'reparation sav': 'reparation sav en cours',
    'reparation sav en cours': 'reparation sav en cours',
    resolu: 'resolu',
    resolue: 'resolu',
    refuse: 'refuse',
    refusee: 'refuse',
    'non couvert': 'non couvert par garantie',
    'non couvert garantie': 'non couvert par garantie',
    'non couvert par garantie': 'non couvert par garantie',
    ferme: 'ferme',
    fermee: 'ferme'
  };

  return synonymes[texte] || texte;
}

function normaliserTypeRetour(valeur) {
  const texte = normaliserTexteEnum(valeur);
  if (!texte) return undefined;
  if (['apres reparation', 'réparation', 'reparation'].includes(texte)) return 'reparation';
  if (['apres vente', 'vente'].includes(texte)) return 'vente';
  return texte;
}

function normaliserGarantie(valeur) {
  const texte = normaliserTexteEnum(valeur);
  if (!texte) return undefined;
  if (['a verifier', 'verifier', 'à vérifier'].includes(texte)) return 'a verifier';
  if (['oui', 'yes', 'true'].includes(texte)) return 'oui';
  if (['non', 'no', 'false'].includes(texte)) return 'non';
  return texte;
}

function normaliserDecision(valeur) {
  const texte = normaliserTexteEnum(valeur);
  if (!texte) return undefined;
  const synonymes = {
    couvert: 'couvert',
    'non couvert': 'non couvert',
    'geste commercial': 'geste commercial',
    echange: 'echange',
    échange: 'echange',
    'remboursement partiel': 'remboursement partiel',
    'reparation payante': 'reparation payante',
    'réparation payante': 'reparation payante',
    'a definir': 'a definir',
    'à définir': 'a definir'
  };
  return synonymes[texte] || texte;
}

const historiqueStatutSchema = new mongoose.Schema({
  de: {
    type: String,
    enum: STATUTS_SAV,
    set: normaliserStatutSav
  },
  vers: {
    type: String,
    enum: STATUTS_SAV,
    required: true,
    set: normaliserStatutSav
  },
  date: {
    type: Date,
    default: Date.now
  },
  utilisateur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur'
  },
  role: {
    type: String,
    trim: true,
    default: '',
    set: nettoyerTexte
  },
  note: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
    set: nettoyerTexte
  }
}, { _id: false });

const savReturnSchema = new mongoose.Schema({
  savNumber: {
    type: Number,
    unique: true,
    index: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
    index: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Produit',
    required: true,
    index: true
  },
  repairId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reparation',
    index: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Facture',
    index: true
  },
  warrantyId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  returnDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  returnType: {
    type: String,
    enum: TYPES_RETOUR_SAV,
    required: true,
    default: 'reparation',
    set: normaliserTypeRetour
  },
  customerIssue: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 1000,
    set: nettoyerTexte
  },
  detailedDescription: {
    type: String,
    trim: true,
    maxlength: 3000,
    default: '',
    set: nettoyerTexte
  },
  photosNotes: {
    type: String,
    trim: true,
    maxlength: 3000,
    default: '',
    set: nettoyerTexte
  },
  warrantyStatus: {
    type: String,
    enum: STATUTS_GARANTIE_SAV,
    default: 'a verifier',
    set: normaliserGarantie,
    index: true
  },
  warrantyStartDate: Date,
  warrantyEndDate: Date,
  internalDiagnosis: {
    type: String,
    trim: true,
    maxlength: 3000,
    default: '',
    set: nettoyerTexte
  },
  decision: {
    type: String,
    enum: DECISIONS_SAV,
    default: 'a definir',
    set: normaliserDecision
  },
  estimatedCost: {
    type: Number,
    min: 0,
    default: 0
  },
  realCost: {
    type: Number,
    min: 0,
    default: 0
  },
  status: {
    type: String,
    enum: STATUTS_SAV,
    default: 'nouveau retour',
    set: normaliserStatutSav,
    index: true
  },
  internalNotes: {
    type: String,
    trim: true,
    maxlength: 3000,
    default: '',
    set: nettoyerTexte
  },
  resolutionDate: Date,
  closedAt: Date,
  historiqueStatuts: [historiqueStatutSchema]
}, {
  timestamps: true
});

savReturnSchema.index({ clientId: 1, returnDate: -1 });
savReturnSchema.index({ productId: 1, returnDate: -1 });
savReturnSchema.index({ status: 1, returnDate: -1 });
savReturnSchema.index({ warrantyStatus: 1, returnDate: -1 });

savReturnSchema.pre('validate', function (next) {
  if (['resolu', 'refuse', 'non couvert par garantie', 'ferme'].includes(this.status) && !this.resolutionDate) {
    this.resolutionDate = new Date();
  }

  if (this.status === 'ferme' && !this.closedAt) {
    this.closedAt = new Date();
  }

  next();
});

savReturnSchema.pre('save', async function (next) {
  if (this.isNew) {
    const counter = await Counter.findByIdAndUpdate(
      { _id: 'savReturn' },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    );
    this.savNumber = counter.seq;

    if (!this.historiqueStatuts || this.historiqueStatuts.length === 0) {
      this.historiqueStatuts = [{
        vers: this.status || 'nouveau retour',
        date: new Date(),
        note: 'Creation'
      }];
    }
  }

  next();
});

module.exports = {
  SavReturn: mongoose.model('SavReturn', savReturnSchema),
  STATUTS_SAV,
  TYPES_RETOUR_SAV,
  STATUTS_GARANTIE_SAV,
  DECISIONS_SAV,
  normaliserStatutSav
};
