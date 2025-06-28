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
},

imei:String,
disponibilite: {
  type: String,
  enum: ["disponible", "vendu", "Pour pièces"],
  required: true,
  default: "disponible"
},

 notes: {
    type: String,
    default: ""  // Par défaut vide
  },



});

// ➕ Ajout du champ virtuel pour afficher la date formatée
produitSchema.virtual('dateachatFormatee').get(function () {
  return this.dateachat ? this.dateachat.toLocaleDateString('fr-FR') : '';
});

// Pour que le champ apparaisse dans les réponses JSON
produitSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Produit', produitSchema);
