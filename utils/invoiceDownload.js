const fs = require('fs/promises');
const path = require('path');
const PDFDocument = require('pdfkit');
const { genererPDFReparationEmise } = require('./pdfGenerator');
const { genererPDFFactureVenteEmise, nomFichierFactureVente } = require('./saleInvoiceGenerator');
const { INVOICE_STORAGE_DIR, SALES_INVOICE_STORAGE_DIR, RECONSTRUCTED_INVOICE_DIR, cheminDansStockageFactures } = require('./invoiceStorage');

async function lirePDFOriginal(chemin) {
  if (!cheminDansStockageFactures(chemin)) return null;
  try {
    const [racine, fichier] = await Promise.all([fs.realpath(INVOICE_STORAGE_DIR), fs.realpath(chemin)]);
    const relatif = path.relative(racine, fichier);
    const cacheReconstitue = path.relative(INVOICE_STORAGE_DIR, RECONSTRUCTED_INVOICE_DIR);
    if (path.isAbsolute(relatif) || relatif.startsWith('..' + path.sep) ||
        relatif.startsWith(cacheReconstitue + path.sep) || path.extname(fichier).toLowerCase() !== '.pdf') {
      return null;
    }
    if (!(await fs.stat(fichier)).isFile()) return null;
    const pdfBuffer = await fs.readFile(fichier);
    if (pdfBuffer.subarray(0, 5).toString() !== '%PDF-') return null;
    return { nomFichier: path.basename(fichier), pdfBuffer, source: 'original' };
  } catch (err) {
    if (['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(err.code)) return null;
    throw err;
  }
}

async function obtenirPDFTelechargeable(facture, vente = null) {
  const estVente = Boolean(vente) || facture?.type === 'vente';
  if (facture?.donneesPDF) {
    const generer = estVente ? genererPDFFactureVenteEmise : genererPDFReparationEmise;
    return { ...await generer(facture.donneesPDF), source: 'emission' };
  }

  const chemins = new Set([facture?.pdfPath, facture?.fichierPDF, vente?.facturePdfPath]);
  if (estVente && Number.isSafeInteger(facture?.numeroFacture)) {
    chemins.add(path.join(SALES_INVOICE_STORAGE_DIR, nomFichierFactureVente(facture.numeroFacture)));
  }
  for (const chemin of chemins) {
    const original = await lirePDFOriginal(chemin);
    if (original) return original;
  }
  return genererReconstitution(facture, vente);
}

function genererReconstitution(facture, vente) {
  const numero = facture?.numeroFacture ?? vente?.factureNumero;
  const date = facture?.dateEmission ?? facture?.date ?? vente?.factureDate;
  const doc = new PDFDocument({ margin: 50, info: { Title: 'Facture Fixel - reconstitution historique' } });
  const resultat = new Promise((resolve, reject) => {
    const blocs = [];
    doc.on('data', bloc => blocs.push(bloc));
    doc.on('error', reject);
    doc.on('end', () => resolve({
      nomFichier: `facture_${Number.isSafeInteger(numero) ? numero : 'historique'}_reconstituee.pdf`,
      pdfBuffer: Buffer.concat(blocs),
      source: 'reconstitution'
    }));
  });

  doc.fontSize(18).text('Facture Fixel - reconstitution historique').moveDown();
  doc.fontSize(12).text('Copie fidèle non garantie. Le PDF original et les données complètes à l’émission ne sont pas disponibles.');
  doc.text('Les renseignements historiques manquants ne sont pas remplacés par les fiches actuelles.').moveDown();
  doc.text(`Facture : ${numero ?? 'Numéro historique non disponible'}`);
  doc.text(`Date d’émission : ${formaterDate(date)}`);
  doc.text(`Client : ${facture?.clientNomAffiche || 'Renseignements historiques non disponibles'}`);
  doc.text('Détail des lignes : non vérifiable à partir des données d’émission conservées.').moveDown();
  doc.text(facture ? 'Montants enregistrés sur la facture' : 'Montants enregistrés sur la vente, non vérifiés à l’émission');
  afficherMontant(doc, 'Sous-total après rabais', facture ? facture.totalHT : vente?.sousTotalApresRabais);
  afficherMontant(doc, 'Rabais', facture ? facture.rabais : vente?.rabais);
  afficherMontant(doc, 'TPS', facture ? facture.tps ?? facture.montantTPS : vente?.montantTPS);
  afficherMontant(doc, 'TVQ', facture ? facture.tvq ?? facture.montantTVQ : vente?.montantTVQ);
  afficherMontant(doc, 'Total', facture ? facture.totalTTC : vente?.total);
  doc.end();
  return resultat;
}

function formaterDate(valeur) {
  const date = valeur && new Date(valeur);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : 'Non disponible';
}

function afficherMontant(doc, libelle, montant) {
  const valeur = Number.isFinite(montant) ? `${montant.toFixed(2)} $ CAD` : 'Non disponible';
  doc.text(`${libelle} : ${valeur}`);
}

function envoyerPDFTelechargeable(res, pdf) {
  res.set('X-Fixel-PDF', pdf.source);
  res.set('Cache-Control', 'private, no-store');
  res.attachment(pdf.nomFichier);
  return res.send(pdf.pdfBuffer);
}

module.exports = { lirePDFOriginal, obtenirPDFTelechargeable, envoyerPDFTelechargeable };
