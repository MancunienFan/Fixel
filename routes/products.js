const express = require('express');
const router = express.Router();
const data = require('../data.json');

router.get('/', (req, res) => {
  res.render('products', { products: data.proserducts });
});

module.exports = router;
