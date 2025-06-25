require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Connexion MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connecté à MongoDB Atlas"))
  .catch((err) => console.error("❌ Erreur MongoDB :", err));

// Routes
const produitRoutes = require('./routes/produitRoutes');
app.use('/api/produits', produitRoutes);

const reparationRoutes = require('./routes/reparationRoutes');
app.use('/api/reparations', reparationRoutes);


// Lancer le serveur
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});

