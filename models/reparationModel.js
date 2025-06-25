const mongoose = require('mongoose');

const ReparationSchema = new mongoose.Schema({
  produit: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Produit',
    required: true
  },
  description: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  prix: {
    type: Number,
    required: true
  },
  statut: {
    type: String,
    enum: ['en attente', 'en cours', 'terminée'],
    default: 'en attente'
  }
});

module.exports = mongoose.model('Reparation', ReparationSchema);
