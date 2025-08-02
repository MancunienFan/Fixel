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
async function genererPDF(client, produit, reparations, numeroFacture, appliquerTaxes = true) {
  const { doc, nomFichier, totalHT, tps, tvq, totalTTC } = await construirePDF(
    client,
    produit,
    reparations,
    numeroFacture,
    appliquerTaxes
  );
  const pdfBuffer = await createPDFBuffer(doc);
  return { nomFichier, totalHT, tps, tvq, totalTTC, pdfBuffer };
}

// ✅ Fonction pour téléchargement direct
async function genererPDFDepuisFacture(facture, appliquerTaxes = true) {
  const client = facture.client;
  const produit = facture.produit;
  const reparations = facture.reparations;
  const numeroFacture = facture.numeroFacture;

  const { doc } = await construirePDF(client, produit, reparations, numeroFacture, appliquerTaxes);
  return await createPDFBuffer(doc);
}


// ✅ Fonction réutilisable qui construit le PDF
async function construirePDF(client, produit, reparations, numeroFacture, appliquerTaxes = true) {
  const doc = new PDFDocument({ margin: 50 });
  const dateFacture = new Date().toISOString().split('T')[0];

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
  doc.text(`IMEI: ${produit.imei || 'N/A'}`);
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
  let totalHT = 0;

  reparations.forEach(r => {
    doc.text(r.description, startX, y);
    doc.text(r.prix.toFixed(2), startX + 300, y);
    y += 20;
    totalHT += r.prix;
  });

  let tps = 0;
  let tvq = 0;
  let totalTTC = totalHT;

  y += 20;
  doc.font('Helvetica-Bold');
  doc.text(`Total HT : ${totalHT.toFixed(2)} $ CAD`, startX + 300, y);
  y += 15;
  if (appliquerTaxes) {
    tps = totalHT * 0.05;
    tvq = totalHT * 0.09975;
    totalTTC = totalHT + tps + tvq;

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
    .text(FIXEL_EMAIL, {
      link: `mailto:${FIXEL_EMAIL}`,
      underline: true,
      align: 'center'
    });

  return {
    doc,
    nomFichier,
    totalHT,
    tps,
    tvq,
    totalTTC
  };
}

module.exports = {
  genererPDF,
  genererPDFDepuisFacture
};
