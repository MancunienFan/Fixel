require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const verifierToken = require('./middleware/verifierToken');



const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Connexion MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connecté à MongoDB Atlas"))
  .catch((err) => console.error("❌ Erreur MongoDB :", err));

//utilisateur
const utilisateurRoutes = require('./routes/utilisateurRoutes');
app.use('/api/utilisateurs', utilisateurRoutes);

// Toutes les routes metier sous /api exigent un token valide.
app.use('/api', verifierToken());

const produitRoutes = require('./routes/produitRoutes');
app.use('/api', produitRoutes);

const reparationRoutes = require('./routes/reparationRoutes');
app.use('/api', reparationRoutes);

// Detection locale des appareils branches au PC
const deviceRoutes = require('./routes/deviceRoutes');
app.use('/api/device', deviceRoutes);

//clients
const clientRoutes = require('./routes/clientRoutes');
app.use('/api/clients', clientRoutes);

//FACTURE
const facturesRoutes = require('./routes/factures');
app.use('/api/factures', facturesRoutes);

//Tableau de bord
const dashboardRoutes = require('./routes/dashboardRoutes');
app.use('/api/dashboard', dashboardRoutes);

//Qualite des donnees
const dataQualityRoutes = require('./routes/dataQualityRoutes');
app.use('/api/data-quality', dataQualityRoutes);




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

