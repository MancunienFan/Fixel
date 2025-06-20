const express = require('express');
const router = express.Router();
const data = require('../data.json');

router.get('/', (req, res) => {
  res.render('services', { services: data.services });
});

module.exports = router;
