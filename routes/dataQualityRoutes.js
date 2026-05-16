const express = require('express');
const router = express.Router();
const verifierToken = require('../middleware/verifierToken');
const { genererRapportQualiteDonnees } = require('../utils/dataQualityReport');

router.get('/', verifierToken(['admin']), async (req, res) => {
  try {
    const rapport = await genererRapportQualiteDonnees({ fix: false });
    res.json(rapport);
  } catch (err) {
    console.error('Erreur qualite des donnees :', err);
    res.status(500).json({ erreur: 'Erreur lors du diagnostic des donnees.' });
  }
});

module.exports = router;
