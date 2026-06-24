const express = require('express');

const Client = require('../models/clientModel');
const Produit = require('../models/produitModel');
const Reparation = require('../models/reparationModel');
const Facture = require('../models/Facture');
const Sale = require('../models/Sale');
const { requireRole } = require('../middleware/permissions');
const { envoyerCsv, formatDate, montant } = require('../utils/csvExport');

const router = express.Router();

router.get('/:entity.csv', requireRole('admin'), async (req, res) => {
  try {
    const entity = String(req.params.entity || '').toLowerCase();
    if (entity === 'clients') return exporterClients(res);
    if (entity === 'produits') return exporterProduits(res);
    if (entity === 'reparations') return exporterReparations(res);
    if (entity === 'factures') return exporterFactures(res);
    if (entity === 'ventes') return exporterVentes(res);

    return res.status(404).json({ erreur: 'Export inconnu.' });
  } catch (err) {
    console.error('Erreur export CSV :', err);
    res.status(500).json({ erreur: 'Erreur export CSV.' });
  }
});

async function exporterClients(res) {
  const rows = await Client.find().sort({ nom: 1, prenom: 1 }).lean();
  envoyerCsv(res, 'clients.csv', rows, [
    { label: 'ID', key: '_id' },
    { label: 'Nom', key: 'nom' },
    { label: 'Prenom', key: 'prenom' },
    { label: 'Telephone', key: 'telephone' },
    { label: 'Email', key: 'email' },
    { label: 'Notes', key: 'notes' },
    { label: 'Date creation', key: row => formatDate(row.dateCreation) }
  ]);
}

async function exporterProduits(res) {
  const rows = await Produit.find().populate('clientId', 'nom prenom').sort({ dateachat: -1 }).lean();
  envoyerCsv(res, 'produits.csv', rows, [
    { label: 'ID', key: '_id' },
    { label: 'Nom', key: 'nom' },
    { label: 'Modele', key: 'model' },
    { label: 'IMEI', key: 'imei' },
    { label: 'Categorie', key: 'categorie' },
    { label: 'Type', key: 'type' },
    { label: 'Disponibilite', key: 'disponibilite' },
    { label: 'Prix achat', key: row => montant(row.prixachat) },
    { label: 'Prix vente', key: row => montant(row.prixvente) },
    { label: 'Client', key: row => nomClient(row.clientId) },
    { label: 'Date achat', key: row => formatDate(row.dateachat) },
    { label: 'Date vente', key: row => formatDate(row.datevente) }
  ]);
}

async function exporterReparations(res) {
  const rows = await Reparation.find()
    .populate('client', 'nom prenom')
    .populate('produit', 'nom model imei')
    .sort({ date: -1 })
    .lean();
  envoyerCsv(res, 'reparations.csv', rows, [
    { label: 'ID', key: '_id' },
    { label: 'Date', key: row => formatDate(row.date) },
    { label: 'Client', key: row => nomClient(row.client) },
    { label: 'Produit', key: row => formatProduit(row.produit) },
    { label: 'Description', key: 'description' },
    { label: 'Statut', key: 'statut' },
    { label: 'Prix', key: row => montant(row.prix) },
    { label: 'Cout piece', key: row => montant(row.coutPiece) },
    { label: 'Notes', key: 'notes' }
  ]);
}

async function exporterFactures(res) {
  const rows = await Facture.find()
    .populate('client', 'nom prenom email telephone')
    .sort({ date: -1, numeroFacture: -1 })
    .lean();
  envoyerCsv(res, 'factures.csv', rows, [
    { label: 'ID', key: '_id' },
    { label: 'Numero', key: 'numeroFacture' },
    { label: 'Date', key: row => formatDate(row.date || row.dateEmission) },
    { label: 'Type', key: 'type' },
    { label: 'Client', key: row => nomClient(row.client) || row.clientNomAffiche },
    { label: 'Sous-total', key: row => montant(row.totalHT) },
    { label: 'TPS', key: row => montant(row.tps || row.montantTPS) },
    { label: 'TVQ', key: row => montant(row.tvq || row.montantTVQ) },
    { label: 'Total', key: row => montant(row.totalTTC) },
    { label: 'Statut', key: 'statut' },
    { label: 'Paiement', key: 'statutPaiement' },
    { label: 'Mode paiement', key: 'modePaiement' },
    { label: 'Email envoye', key: row => row.emailEnvoye || row.envoyeeParEmail ? 'oui' : 'non' }
  ]);
}

async function exporterVentes(res) {
  const rows = await Sale.find()
    .populate('client', 'nom prenom email telephone')
    .sort({ dateVente: -1, numeroVente: -1 })
    .lean();
  envoyerCsv(res, 'ventes.csv', rows, [
    { label: 'ID', key: '_id' },
    { label: 'Numero', key: 'numeroVente' },
    { label: 'Date', key: row => formatDate(row.dateVente) },
    { label: 'Client', key: row => nomClient(row.client) || 'Vente comptoir' },
    { label: 'Sous-total', key: row => montant(row.sousTotalApresRabais || row.sousTotal) },
    { label: 'TPS', key: row => montant(row.montantTPS) },
    { label: 'TVQ', key: row => montant(row.montantTVQ) },
    { label: 'Total', key: row => montant(row.total) },
    { label: 'Profit', key: row => montant(row.profitTotal) },
    { label: 'Paiement', key: 'statutPaiement' },
    { label: 'Mode paiement', key: 'modePaiement' },
    { label: 'Facture generee', key: row => row.factureGeneree ? 'oui' : 'non' }
  ]);
}

function nomClient(client) {
  if (!client) return '';
  return [client.nom, client.prenom].filter(Boolean).join(' ');
}

function formatProduit(produit) {
  if (!produit) return '';
  return [produit.nom, produit.model, produit.imei].filter(Boolean).join(' - ');
}

module.exports = router;
