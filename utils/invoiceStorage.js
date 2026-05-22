const path = require('path');

const INVOICE_STORAGE_DIR = path.join(__dirname, '..', 'storage', 'invoices');
const SALES_INVOICE_STORAGE_DIR = path.join(INVOICE_STORAGE_DIR, 'sales');

function cheminDansStockageFactures(chemin) {
  if (!chemin) return false;
  const racine = path.resolve(INVOICE_STORAGE_DIR);
  const cible = path.resolve(chemin);
  return cible === racine || cible.startsWith(`${racine}${path.sep}`);
}

function masquerCheminsFacture(objet) {
  if (!objet || typeof objet !== 'object') return objet;

  if (Array.isArray(objet)) return objet.map(masquerCheminsFacture);

  const source = typeof objet.toObject === 'function' ? objet.toObject() : objet;
  const copie = { ...source };
  const pdfDisponible = Boolean(copie.pdfPath || copie.fichierPDF || copie.facturePdfPath);

  delete copie.pdfPath;
  delete copie.fichierPDF;
  delete copie.facturePdfPath;

  if (pdfDisponible) copie.pdfDisponible = true;

  if (Array.isArray(copie.sale)) copie.sale = copie.sale.map(masquerCheminsFacture);
  else if (copie.sale && typeof copie.sale === 'object') copie.sale = masquerCheminsFacture(copie.sale);

  if (Array.isArray(copie.items)) copie.items = copie.items.map(masquerCheminsFacture);

  return copie;
}

module.exports = {
  INVOICE_STORAGE_DIR,
  SALES_INVOICE_STORAGE_DIR,
  cheminDansStockageFactures,
  masquerCheminsFacture
};
