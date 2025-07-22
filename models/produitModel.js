const mongoose = require('mongoose');

const produitSchema = new mongoose.Schema({
  nom: String,
  statut: {
    type: String,
    enum: ["neuf", "bon état", "mauvais état"],
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
    default: Date.now
  },
  datevente: {
    type: Date,
    default: Date.now
  },
  imei: String,
  disponibilite: {
    type: String,
    enum: ["disponible", "vendu", "Pour pièces"],
    default: "disponible"
  },
  datemodification: {
    type: Date,
  
  },
  notes: {
    type: String,
    default: ""
  },

  // 🔥 Nouveau champ pour lier un produit à un client
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client"
  },
  type: {
    type: String,
    enum: ["client", "stock"],
    required: true,
    default : "stock"
  }


});



// ➕ Ajout du champ virtuel pour afficher la date formatée
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
