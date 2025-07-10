const express = require('express');
const router = express.Router();
const Client = require('../models/clientModel');

// 🔹 GET tous les clients
router.get('/', async (req, res) => {
  const clients = await Client.find();
  res.json(clients);
});

// 🔹 GET un client par ID
router.get('/:id', async (req, res) => {
  const client = await Client.findById(req.params.id);
  res.json(client);
});

// 🔹 POST nouveau client
router.post('/', async (req, res) => {
  const newClient = new Client(req.body);
  await newClient.save();
  res.json(newClient);
});

// 🔹 PUT mise à jour
router.put('/:id', async (req, res) => {
  const updated = await Client.findByIdAndUpdate(req.params.id, { ...req.body, dateModification: new Date() }, { new: true });
  res.json(updated);
});

// 🔹 DELETE
router.delete('/:id', async (req, res) => {
  await Client.findByIdAndDelete(req.params.id);
  res.json({ message: 'Client supprimé' });
});

module.exports = router;
