const express = require('express');
const path = require('path');
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Routes
app.use('/', require('./routes/products'));
app.use('/services', require('./routes/services'));
app.use('/transactions', require('./routes/transactions'));

const PORT = 3000;
app.listen(PORT, () => console.log(`FixEl site running on http://localhost:${PORT}`));
