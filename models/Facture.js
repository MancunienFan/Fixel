const mongoose = require('mongoose');

const factureSchema = new mongoose.Schema({
   numeroFacture: {
    type: Number,
    unique: true,
  },
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  produit: { type: mongoose.Schema.Types.ObjectId, ref: 'Produit', required: true },
  reparations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Reparation', required: true }],
  date: { type: Date, default: Date.now },
  tps: Number,
  tvq: Number,
  totalHT: Number,
  totalTTC: Number,
  fichierPDF: String // chemin vers le fichier généré
});

const Counter = require('./Counter');

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
