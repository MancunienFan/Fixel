const mongoose = require('mongoose');

const produitSchema = new mongoose.Schema({
  nom: String,
  etat: String,
  prix: Number,
  categorie: String
});

module.exports = mongoose.model('Produit', produitSchema);
