const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const { test } = require('node:test');
const { inflateSync } = require('node:zlib');
const { once } = require('node:events');
const express = require('express');
const mongoose = require('mongoose');

const Facture = require('../models/Facture');
const Sale = require('../models/Sale');
const Client = require('../models/clientModel');
const Produit = require('../models/produitModel');
const Reparation = require('../models/reparationModel');
const Counter = require('../models/Counter');
const AuditLog = require('../models/AuditLog');
const { RECONSTRUCTED_INVOICE_DIR, SALES_INVOICE_STORAGE_DIR } = require('../utils/invoiceStorage');
const { nomFichierFactureVente } = require('../utils/saleInvoiceGenerator');

const cheminEnvoi = require.resolve('../utils/emailSender');
let tentativesEnvoi = 0;
const envoiInterdit = () => {
  tentativesEnvoi++;
  assert.fail('Aucun envoi ne doit être tenté');
};
require.cache[cheminEnvoi] = { exports: Object.assign(envoiInterdit, { sendEmail: envoiInterdit }) };
const facturesRoutes = require('../routes/factures');
const ventesRoutes = require('../routes/salesRoutes');

function requeteSimulee(valeur) {
  return {
    select() { return this; },
    populate() { return this; },
    lean: async () => valeur,
    then: (resolve, reject) => Promise.resolve(valeur).then(resolve, reject)
  };
}

function textePDF(bytes) {
  const brut = Buffer.from(bytes);
  const texte = brut.toString('latin1');
  const pages = [];
  for (const flux of texte.matchAll(/\/Filter \/FlateDecode[^\n]*\n>>\nstream\n/g)) {
    const debut = flux.index + flux[0].length;
    const fin = texte.indexOf('\nendstream', debut);
    const contenu = inflateSync(brut.subarray(debut, fin)).toString();
    for (const ligne of contenu.matchAll(/\[([^[\]]+)\]\s*TJ/g)) {
      pages.push(Array.from(ligne[1].matchAll(/<([0-9a-f]+)>/gi), mot => Buffer.from(mot[1], 'hex').toString('latin1')).join(''));
    }
  }
  assert.ok(pages.length, 'Le PDF doit contenir du texte imprimé');
  return pages.join('\n');
}

test('Émission, perte du fichier et téléchargements en lecture seule', async t => {
  const ventes = new Map();
  const factures = new Map();
  const compteurInitial = randomInt(100_000_000, 999_000_000);
  let compteur = compteurInitial;
  let ecritures = 0;
  const identifiant = () => new mongoose.Types.ObjectId();
  const date = new Date('2024-06-15T12:00:00Z');
  const chemins = new Set();
  t.after(async () => {
    for (const fichier of chemins) await fs.unlink(fichier).catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
    assert.equal(tentativesEnvoi, 0);
  });

  const client = { _id: identifiant(), nom: 'Original', prenom: 'Camille', email: 'original@example.test', telephone: '5145550199' };
  const produit = { _id: identifiant(), clientId: client._id, nom: 'Telephone initial', model: 'Modele initial', prixvente: 100 };
  const reparation = { _id: identifiant(), produit: produit._id, description: 'Ecran initial', prix: 80 };

  t.mock.method(Client, 'findById', async () => client);
  t.mock.method(Produit, 'findById', async () => produit);
  t.mock.method(Reparation, 'find', async () => [reparation]);
  t.mock.method(Facture, 'exists', async () => null);
  t.mock.method(AuditLog, 'create', async () => { ecritures++; });
  t.mock.method(Counter, 'findByIdAndUpdate', async () => {
    ecritures++;
    return { seq: ++compteur };
  });
  t.mock.method(Counter, 'updateOne', async () => { ecritures++; });
  t.mock.method(Sale.prototype, 'save', async function () {
    ecritures++;
    if (!this.numeroVente) this.numeroVente = ++compteur;
    ventes.set(String(this._id), this);
    return this;
  });
  t.mock.method(Facture.prototype, 'save', async function () {
    ecritures++;
    await this.validate();
    const binaire = mongoose.mongo.BSON.serialize(this.toObject());
    factures.set(String(this._id), mongoose.mongo.BSON.deserialize(binaire));
    return this;
  });
  t.mock.method(Sale, 'findById', id => requeteSimulee(ventes.get(String(id))));
  t.mock.method(Sale, 'findOne', filtre => requeteSimulee(
    Array.from(ventes.values()).find(vente => String(vente.factureId) === String(filtre.factureId))
  ));
  function retrouverFacture(filtre) {
    return Array.from(factures.values()).find(facture => Object.entries(filtre).every(([champ, valeur]) =>
      valeur !== undefined && String(facture[champ]) === String(valeur)));
  }
  t.mock.method(Facture, 'findById', id => requeteSimulee(factures.get(String(id))));
  t.mock.method(Facture, 'findOne', filtre => requeteSimulee(
    filtre.$or ? filtre.$or.map(retrouverFacture).find(Boolean) : retrouverFacture(filtre)
  ));
  t.mock.method(Facture, 'findOneAndUpdate', async (filtre, update) => {
    ecritures++;
    const existe = retrouverFacture(filtre);
    const facture = { ...existe, ...update.$set };
    if (!existe) Object.assign(facture, update.$setOnInsert, { _id: identifiant() });
    const binaire = mongoose.mongo.BSON.serialize(facture);
    factures.set(String(facture._id), mongoose.mongo.BSON.deserialize(binaire));
    return facture;
  });

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.utilisateur = { role: 'admin', id: String(identifiant()) }; next(); });
  app.use('/api/factures', facturesRoutes);
  app.use('/api/sales', ventesRoutes);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;

  async function ecrire(url, donnees, method = 'POST', statut = 200) {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(donnees)
    });
    const corps = await res.json();
    assert.equal(res.status, statut, JSON.stringify(corps));
    return corps;
  }

  async function telecharger(url, source) {
    const avant = ecritures;
    const res = await fetch(base + url);
    assert.equal(res.status, 200, url);
    assert.equal(res.headers.get('X-Fixel-PDF'), source);
    assert.match(res.headers.get('Content-Type'), /^application\/pdf/);
    assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(ecritures, avant, 'Le téléchargement ne doit pas écrire en base');
    return Buffer.from(await res.arrayBuffer());
  }

  let originalReparation;
  for (const taxes of [true, false]) {
    client.nom = 'Original';
    produit.nom = 'Telephone initial';
    reparation.description = 'Ecran initial';
    reparation.prix = 80;
    const corps = await ecrire('/api/factures', {
      clientId: client._id, produitId: produit._id, reparationIds: [reparation._id], inclureTaxes: taxes
    });
    const url = '/api/factures/' + corps._id + '/pdf';
    const stockee = factures.get(corps._id);
    assert.equal(stockee.donneesPDF.client.nom, 'Original');
    assert.equal(stockee.donneesPDF.reparations[0].prix, 80);
    originalReparation = await telecharger(url, 'emission');
    const avant = textePDF(originalReparation);
    const fichier = path.join(SALES_INVOICE_STORAGE_DIR, 'test-reparation-' + corps._id + '.pdf');
    await fs.mkdir(SALES_INVOICE_STORAGE_DIR, { recursive: true });
    chemins.add(fichier);
    await fs.writeFile(fichier, originalReparation, { flag: 'wx' });
    stockee.pdfPath = fichier;
    await fs.unlink(fichier);
    client.nom = 'Nom modifie';
    produit.nom = 'Produit modifie';
    reparation.prix = 999;
    reparation.description = 'Description modifiee';
    const apres = textePDF(await telecharger(url + '?inclureTaxes=' + !taxes, 'emission'));
    assert.equal(apres, avant);
    assert.match(apres, /Camille|Original/);
    assert.match(apres, /80\.00/);
    assert.equal(apres.includes('TPS (5%)'), taxes);
  }

  let originalVente;
  for (const taxes of [true, false]) {
    const vente = new Sale({
      _id: identifiant(), numeroVente: ++compteur, dateVente: date,
      client: client._id, items: [{ type: 'produit', description: 'Produit initial', quantite: 1, prixUnitaire: 100, totalLigne: 100 }],
      sousTotal: 100, rabais: 10, sousTotalApresRabais: 90, taxesActivees: taxes,
      montantTPS: taxes ? 4.50 : 0, montantTVQ: taxes ? 8.98 : 0, total: taxes ? 103.48 : 90
    });
    client.nom = 'Original';
    vente.populated('client', client._id);
    vente.client = Client.hydrate(client);
    ventes.set(String(vente._id), vente);
    const urlVente = '/api/sales/' + vente._id + '/invoice';
    const emission = await ecrire('/api/sales/' + vente._id + '/generate-invoice', {});
    assert.equal(emission.vente.donneesPDF, undefined);
    const stockee = retrouverFacture({ sale: vente._id });
    const fichier = vente.facturePdfPath;
    chemins.add(fichier);
    assert.equal(stockee.donneesPDF.client.nom, 'Original');
    assert.equal(stockee.donneesPDF.items[0].prixUnitaire, 100);
    originalVente = await fs.readFile(fichier);
    const avant = textePDF(originalVente);
    await fs.unlink(fichier);
    vente.client.nom = 'Nom modifie';
    vente.items[0].prixUnitaire = 999;
    vente.rabais = 20;
    vente.montantTPS = 10;
    vente.total = 1000;
    produit.prixvente = 2000;
    const urlFacture = '/api/factures/' + stockee._id + '/pdf';
    assert.equal(textePDF(await telecharger(urlVente, 'emission')), avant);
    vente.facturePdfPath = '';
    stockee.pdfPath = '';
    stockee.fichierPDF = '';
    assert.equal(textePDF(await telecharger(urlFacture, 'emission')), avant);
    assert.equal(textePDF(await telecharger(urlVente, 'emission')), avant);
    await ecrire('/api/sales/' + vente._id + '/generate-invoice', {});
    assert.equal(textePDF(await fs.readFile(vente.facturePdfPath)), avant);
    assert.equal(textePDF(await telecharger(urlFacture, 'emission')), avant);
    assert.match(avant, /Camille Original/);
    assert.match(avant, /100\.00/);
    assert.match(avant, /10\.00/);
    assert.equal(avant.includes('TPS 5%'), taxes);
  }

  const payloadVente = {
    dateVente: date,
    items: [{ type: 'accessoire', description: 'Housse', quantite: 1, prixUnitaire: 20 }],
    factureGeneree: true
  };
  const creeeAvecFacture = await ecrire('/api/sales', payloadVente, 'POST', 201);
  const emisePlusTard = await ecrire('/api/sales', { ...payloadVente, factureGeneree: false }, 'POST', 201);
  const urlVente = '/api/sales/' + emisePlusTard.vente._id;
  const avant = ecritures;
  assert.equal((await fetch(base + urlVente + '/invoice')).status, 404);
  assert.equal(ecritures, avant);
  await ecrire(urlVente, { factureGeneree: true }, 'PUT');
  for (const id of [creeeAvecFacture.vente._id, emisePlusTard.vente._id]) {
    chemins.add(ventes.get(id).facturePdfPath);
    assert.ok(retrouverFacture({ sale: id }).donneesPDF);
    assert.match(textePDF(await telecharger('/api/sales/' + id + '/invoice', 'emission')), /Housse/);
  }

  const vente = new Sale({ _id: identifiant(), factureGeneree: true, factureNumero: ++compteur });
  ventes.set(String(vente._id), vente);
  const ancienne = {
    _id: identifiant(), type: 'vente', sale: vente._id, numeroFacture: vente.factureNumero,
    dateEmission: date, client: client._id, totalHT: 100, tps: 5, tvq: 9.98, totalTTC: 114.98
  };
  factures.set(String(ancienne._id), ancienne);
  const url = '/api/factures/' + ancienne._id + '/pdf';
  const original = originalVente;
  const fichier = path.join(SALES_INVOICE_STORAGE_DIR, 'test-original-' + ancienne._id + '.pdf');
  chemins.add(fichier);
  await fs.writeFile(fichier, original, { flag: 'wx' });
  ancienne.fichierPDF = fichier;
  assert.deepEqual(await telecharger(url, 'original'), original);
  await fs.unlink(fichier);
  ancienne.fichierPDF = '';
  const cheminParNumero = path.join(SALES_INVOICE_STORAGE_DIR, nomFichierFactureVente(ancienne.numeroFacture));
  await fs.writeFile(cheminParNumero, original, { flag: 'wx' });
  chemins.add(cheminParNumero);
  assert.deepEqual(await telecharger(url, 'original'), original);
  await fs.unlink(cheminParNumero);
  const texte = textePDF(await telecharger(url, 'reconstitution'));
  assert.match(texte, /Copie fidèle non garantie/);
  assert.match(texte, /2024-06-15/);
  assert.match(texte, /114\.98/);
  assert.doesNotMatch(texte, /Camille|Nom modifie/);

  await fs.mkdir(RECONSTRUCTED_INVOICE_DIR, { recursive: true });
  const cache = path.join(RECONSTRUCTED_INVOICE_DIR, 'test-cache-' + ancienne._id + '.pdf');
  chemins.add(cache);
  await fs.writeFile(cache, original, { flag: 'wx' });
  vente.facturePdfPath = cache;
  assert.match(textePDF(await telecharger('/api/sales/' + vente._id + '/invoice', 'reconstitution')), /Copie fidèle non garantie/);

  const reparationAncienne = { _id: identifiant(), type: 'reparation', numeroFacture: ++compteur, totalHT: 70, totalTTC: 70 };
  factures.set(String(reparationAncienne._id), reparationAncienne);
  const urlReparation = '/api/factures/' + reparationAncienne._id + '/pdf';
  const cheminReparation = path.join(SALES_INVOICE_STORAGE_DIR, 'test-original-' + reparationAncienne._id + '.pdf');
  chemins.add(cheminReparation);
  await fs.writeFile(cheminReparation, originalReparation, { flag: 'wx' });
  reparationAncienne.pdfPath = cheminReparation;
  assert.deepEqual(await telecharger(urlReparation, 'original'), originalReparation);
  await fs.unlink(cheminReparation);
  const texteReparation = textePDF(await telecharger(urlReparation, 'reconstitution'));
  assert.match(texteReparation, /70\.00/);
  assert.match(texteReparation, /Date d.emission|Date d.émission/);
  assert.doesNotMatch(texteReparation, /Ecran initial|Camille/);
});
