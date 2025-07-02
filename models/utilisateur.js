const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const utilisateurSchema = new mongoose.Schema({
  nom: String,
  email: { type: String, required: true, unique: true },
  motdepasse: { type: String, required: true },
  role: { type: String, enum: ['admin', 'mod', 'consultant'], default: 'consultant' }
});

// Hash du mot de passe avant sauvegarde
utilisateurSchema.pre('save', async function(next) {
  if (!this.isModified('motdepasse')) return next();
  this.motdepasse = await bcrypt.hash(this.motdepasse, 10);
  next();
});

module.exports = mongoose.model('utilisateur', utilisateurSchema);
