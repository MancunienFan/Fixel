const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  nom: String,
  prenom: String,
  telephone: String,
  email: String,
  photo: String, // URL ou base64 si besoin

  notes: {
    type: String,
    default: ""
  },

  dateCreation: {
    type: Date,
    default: Date.now
  },

  dateModification: {
    type: Date,
    default: Date.now
  },
   notes: {
    type: String,
    default: ""  // Par défaut vide
  },

});

clientSchema.virtual('datecreationFormatte').get(function () {
  return this.dateCreation ? this.dateCreation.toLocaleDateString('fr-FR') : '';
});

// 🛠️ Middleware pour mettre à jour `dateModification` à chaque modification
clientSchema.pre('findOneAndUpdate', function (next) {
  this.set({ dateModification: new Date() });
  next();
});

clientSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Client', clientSchema);
