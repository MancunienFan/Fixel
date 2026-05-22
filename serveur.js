require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const verifierToken = require('./middleware/verifierToken');



const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const frontendOrigin = process.env.FRONTEND_ORIGIN;
const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (frontendOrigin && origin === frontendOrigin) return callback(null, true);
    if (!isProduction && localhostRegex.test(origin)) return callback(null, true);
    return callback(new Error('Origine CORS non autorisee.'));
  },
  credentials: true
}));
app.use(express.json());
app.use(mongoSanitize());
app.use(express.static(path.join(__dirname, 'public')));
// Connexion MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connecté à MongoDB Atlas"))
  .catch((err) => console.error("❌ Erreur MongoDB :", err));

//utilisateur
const utilisateurRoutes = require('./routes/utilisateurRoutes');
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: 'Trop de tentatives de connexion. Reessayez plus tard.' }
});
app.use('/api/utilisateurs/login', loginLimiter);
app.use('/api/utilisateurs', utilisateurRoutes);

// Toutes les routes metier sous /api exigent un token valide.
app.use('/api', verifierToken());

const produitRoutes = require('./routes/produitRoutes');
app.use('/api', produitRoutes);

const reparationRoutes = require('./routes/reparationRoutes');
app.use('/api', reparationRoutes);

// Detection locale des appareils branches au PC
const deviceRoutes = require('./routes/deviceRoutes');
if (!isProduction || process.env.ENABLE_DEVICE_DETECT === 'true') {
  app.use('/api/device', deviceRoutes);
} else {
  app.use('/api/device/detect', (req, res) => {
    res.status(404).json({ message: 'Route API introuvable.' });
  });
}

//clients
const clientRoutes = require('./routes/clientRoutes');
app.use('/api/clients', clientRoutes);

//FACTURE
const facturesRoutes = require('./routes/factures');
app.use('/api/factures', facturesRoutes);
app.use('/api/invoices', facturesRoutes);

//Ventes
const salesRoutes = require('./routes/salesRoutes');
app.use('/api/sales', salesRoutes);

//Retours clients / SAV
const savRoutes = require('./routes/savRoutes');
app.use('/api/sav', savRoutes);

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

app.get('/invitation/accept', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/invitation/accept.html'));
});

app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Route API introuvable.' });
});

app.get('*', (req, res) => {
  res.redirect('/login/login.html');
});

// Lancer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});

