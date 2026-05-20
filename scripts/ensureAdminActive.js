require('dotenv').config();
const mongoose = require('mongoose');
const Utilisateur = require('../models/utilisateur');

async function main() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL;
  if (!email) {
    throw new Error('Email admin manquant. Utilisez: node scripts/ensureAdminActive.js admin@example.com');
  }

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI manquant.');
  }

  await mongoose.connect(process.env.MONGO_URI);

  const utilisateur = await Utilisateur.findOneAndUpdate(
    { email },
    {
      role: 'admin',
      status: 'active',
      actif: true,
      $unset: {
        invitationTokenHash: '',
        invitationExpiresAt: ''
      }
    },
    { new: true, runValidators: true }
  ).select('-motdepasse -invitationTokenHash');

  if (!utilisateur) {
    throw new Error('Utilisateur introuvable.');
  }

  console.log(`Compte admin actif: ${utilisateur.email}`);
}

main()
  .catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
