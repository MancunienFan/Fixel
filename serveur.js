require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');



const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Connexion MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connecté à MongoDB Atlas"))
  .catch((err) => console.error("❌ Erreur MongoDB :", err));

// Routes
const produitRoutes = require('./routes/produitRoutes');
app.use('/api', produitRoutes);

const reparationRoutes = require('./routes/reparationRoutes');
app.use('/api', reparationRoutes);

//utilisateur
const utilisateurRoutes = require('./routes/utilisateurRoutes');
app.use('/api/utilisateurs', utilisateurRoutes);

//clients
const clientRoutes = require('./routes/clientRoutes');
app.use('/api/clients', clientRoutes);

//FACTURE
const facturesRoutes = require('./routes/factures');
app.use('/api/factures', facturesRoutes);

//Tableau de bord
const dashboardRoutes = require('./routes/dashboardRoutes');
app.use('/api/dashboard', dashboardRoutes);




/*
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});*/

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Lancer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});

