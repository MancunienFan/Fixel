const mongoose = require('mongoose');

const produitSchema = new mongoose.Schema({
  nom: String,
 statut: {
    type: String,
    enum: ["neuf", "bon état", "mauvais état"],
    required: true,
    default: "neuf",
  },
  prix: Number,
  categorie: String,
  etatbatterie: Number, 
  model: String,
  prixachat: Number,
  prixvente: Number,
   dateachat: {
    type: Date,
    default: Date.now  // 👈 par défaut, date actuelle
  },
 datevente: {
  type: Date,
  default: null
}


});

module.exports = mongoose.model('Produit', produitSchema);
