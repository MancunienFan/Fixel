const mongoose = require('mongoose');
const { nettoyerTexte } = require('../utils/validators');
const {
  STATUTS_REPARATION,
  normaliserStatutReparation,
  champDatePourStatut
} = require('../utils/reparationWorkflow');

const ReparationSchema = new mongoose.Schema({
  produit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Produit',
    required: true,
    index: true
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    index: true
  },
  description: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 1000,
    set: nettoyerTexte
  },
  date: {
    type: Date,
    default: Date.now,
    index: true
  },
  prix: {
    type: Number,
    required: true,
    min: 0
  },
  statut: {
    type: String,
    enum: STATUTS_REPARATION,
    default: 'recu',
    index: true,
    set: normaliserStatutReparation
  },
  dateReception: Date,
  dateDiagnostic: Date,
  dateAttentePiece: Date,
  dateDebutReparation: Date,
  datePret: Date,
  dateLivraison: Date,
  dateAnnulation: Date,
  historiqueStatuts: [{
    de: {
      type: String,
      enum: STATUTS_REPARATION,
      set: normaliserStatutReparation
    },
    vers: {
      type: String,
      enum: STATUTS_REPARATION,
      required: true,
      set: normaliserStatutReparation
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
      default: ''
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
    }
  }],
  notes: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  }
});

ReparationSchema.index({ produit: 1, date: -1 });
ReparationSchema.index({ client: 1, date: -1 });

ReparationSchema.pre('validate', function (next) {
  const champDate = champDatePourStatut(this.statut);
  if (champDate && !this[champDate]) {
    this[champDate] = new Date();
  }
  next();
});

module.exports = mongoose.model('Reparation', ReparationSchema);
