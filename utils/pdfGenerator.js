require('dotenv').config();
const FIXEL_EMAIL = process.env.FIXEL_EMAIL || "serviceclient.fixel@gmail.com";

const PDFDocument = require('pdfkit');

// Fonction pour créer un buffer depuis un PDFDoc
function createPDFBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// ✅ Fonction principale (envoi mail)
async function genererPDF(client, produit, reparations, numeroFacture, appliquerTaxes = true, date = new Date()) {
  const lignes = reparations.map(({ description, prix }) => ({ description, prix }));
  const totalHT = lignes.reduce((total, ligne) => total + ligne.prix, 0);
  const tps = appliquerTaxes ? totalHT * 0.05 : 0;
  const tvq = appliquerTaxes ? totalHT * 0.09975 : 0;
  const donneesPDF = {
    dateFacture: date.toISOString().slice(0, 10),
    numeroFacture,
    client: { nom: client.nom, prenom: client.prenom, email: client.email, telephone: client.telephone },
    produit: { nom: produit.nom, model: produit.model, imei: produit.imei },
    reparations: lignes,
    appliquerTaxes,
    totalHT,
    tps,
    tvq,
    totalTTC: totalHT + tps + tvq,
    contact: FIXEL_EMAIL
  };
  const pdf = await genererPDFReparationEmise(donneesPDF);
  return { ...pdf, totalHT, tps, tvq, totalTTC: donneesPDF.totalTTC, donneesPDF };
}

// ✅ Fonction pour téléchargement direct
async function genererPDFDepuisFacture(facture, appliquerTaxes = true) {
  const { pdfBuffer } = await genererPDF(facture.client, facture.produit, facture.reparations, facture.numeroFacture, appliquerTaxes);
  return pdfBuffer;
}


// ✅ Fonction réutilisable qui construit le PDF
async function genererPDFReparationEmise(donnees) {
  const { client, produit, reparations, numeroFacture, dateFacture, appliquerTaxes, totalHT, tps, tvq, totalTTC, contact } = donnees;
  const doc = new PDFDocument({ margin: 50 });

  const nomClientFichier = `${client.nom}_${client.prenom}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/gi, '');

  const nomFichier = `facture_${nomClientFichier}-${dateFacture}.pdf`;

  doc.fontSize(18).text('Facture - FixEl', { align: 'center' }).moveDown();

  doc.fontSize(12)
    .text(`Client: ${client.nom} ${client.prenom}`)
    .text(`Courriel: ${client.email || 'N/A'}`)
    .text(`Téléphone: ${client.telephone || 'N/A'}`);

  doc.text(`\nDate: ${dateFacture}`, { align: 'right' }).moveDown();
  doc.fontSize(14).text(`Facture No : ${numeroFacture}`, { align: 'right' });

  doc.text(`Produit: ${produit.nom}`);
  doc.text(`Modèle: ${produit.model}`);
  doc.text(`Numero de serie: ${produit.imei || 'N/A'}`);
  doc.moveDown();

  doc.fontSize(14).text('Détails des réparations :', { underline: true });
  doc.moveDown(0.5);

  const startX = doc.x;
  const startY = doc.y;

  doc.fontSize(12).font('Helvetica-Bold');
  doc.text('Description', startX, startY);
  doc.text('Coût ($ CAD)', startX + 300, startY);

  doc.moveDown(0.3).font('Helvetica');
  let y = startY + 20;

  reparations.forEach(r => {
    doc.text(r.description, startX, y);
    doc.text(r.prix.toFixed(2), startX + 300, y);
    y += 20;
  });


  y += 20;
  doc.font('Helvetica-Bold');
  doc.text(`Total HT : ${totalHT.toFixed(2)} $ CAD`, startX + 300, y);
  y += 15;
  if (appliquerTaxes) {
    doc.text(`TPS (5%) : ${tps.toFixed(2)} $ CAD`, startX + 300, y);
    y += 15;
    doc.text(`TVQ (9.975%) : ${tvq.toFixed(2)} $ CAD`, startX + 300, y);
    y += 15;
    doc.text(`Total TTC : ${totalTTC.toFixed(2)} $ CAD`, startX + 300, y);
  } else {
    doc.text(`Taxes non appliquées`, startX + 300, y);
  }

  doc.moveDown(4);
  doc.font('Helvetica').fontSize(12);
  doc.text('Merci pour votre confiance !', { align: 'center' });
  doc.moveDown(0.5);
  doc.fillColor('black').text('Contact :', { align: 'center' });
  doc.moveDown(0.3);
  doc.fillColor('blue')
    .text(contact, {
      link: `mailto:${contact}`,
      underline: true,
      align: 'center'
    });

  return { nomFichier, pdfBuffer: await createPDFBuffer(doc) };
}

module.exports = {
  genererPDF,
  genererPDFDepuisFacture,
  genererPDFReparationEmise
};
