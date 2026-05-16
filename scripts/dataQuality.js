require('dotenv').config();

const mongoose = require('mongoose');
const { genererRapportQualiteDonnees } = require('../utils/dataQualityReport');

mongoose.set('autoIndex', false);

const modeFix = process.argv.includes('--fix');

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI manquant dans .env');
  }

  await mongoose.connect(process.env.MONGO_URI);
  const rapport = await genererRapportQualiteDonnees({ fix: modeFix });
  afficherRapport(rapport);
}

function afficherRapport(rapport) {
  console.log(`Mode: ${rapport.mode}${modeFix ? '' : ' dry-run'}`);
  console.log(`Erreurs: ${rapport.summary.issues}`);
  console.log(`Corrections ${modeFix ? 'appliquees' : 'disponibles'}: ${modeFix ? rapport.summary.correctionsAppliquees : rapport.summary.correctionsDisponibles}`);

  afficherSection(
    'ERREURS A TRAITER',
    rapport.issues.map(issue => `${issue.code} [${issue.entityId}]: ${issue.message}`)
  );

  afficherSection(
    modeFix ? 'CORRECTIONS APPLIQUEES' : 'CORRECTIONS DISPONIBLES',
    (modeFix ? rapport.correctionsAppliquees : rapport.correctionsDisponibles)
      .map(correction => `${correction.entity} ${correction.id}: ${JSON.stringify(correction.update)}`)
  );

  if (!modeFix && rapport.correctionsDisponibles.length) {
    console.log('\nRelancer avec npm run data:quality:fix pour appliquer les corrections mecaniques.');
  }
}

function afficherSection(titre, lignes) {
  if (!lignes.length) return;
  console.log(`\n${titre}`);
  lignes.forEach(ligne => console.log(`- ${ligne}`));
}

main()
  .catch(err => {
    console.error('Erreur data quality:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
