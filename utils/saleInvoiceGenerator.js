require('dotenv').config();
const PDFDocument = require('pdfkit');

const FIXEL_EMAIL = process.env.FIXEL_EMAIL || process.env.EMAIL_FROM || 'serviceclient.fixel@gmail.com';

function createPDFBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function donneesFactureVentePDF(sale) {
  const vente = sale.toObject ? sale.toObject() : sale;
  const { client } = vente;
  const numeroFacture = vente.factureNumero || vente.numeroVente;
  return {
    factureNumero: numeroFacture,
    nomFichier: nomFichierFactureVente(numeroFacture || vente._id),
    numeroVente: vente.numeroVente,
    dateEmission: vente.factureDate,
    dateVenteAffichee: formatDate(vente.dateVente),
    client: client ? { nom: client.nom, prenom: client.prenom, email: client.email, telephone: client.telephone } : null,
    emailFacture: vente.emailFacture,
    items: (vente.items || []).map(({ description, quantite, prixUnitaire, totalLigne }) => ({ description, quantite, prixUnitaire, totalLigne })),
    sousTotal: vente.sousTotal,
    rabais: vente.rabais,
    sousTotalApresRabais: vente.sousTotalApresRabais,
    taxesActivees: vente.taxesActivees,
    montantTPS: vente.montantTPS,
    montantTVQ: vente.montantTVQ,
    total: vente.total,
    modePaiement: vente.modePaiement,
    statutPaiement: vente.statutPaiement,
    montantPaye: vente.montantPaye,
    solde: vente.solde,
    garantieActive: vente.garantieActive,
    garantieJours: vente.garantieJours,
    dateFinGarantieAffichee: formatDate(vente.dateFinGarantie),
    noteGarantie: vente.noteGarantie,
    notes: vente.notes,
    contact: FIXEL_EMAIL
  };
}

function genererFactureVentePDF(sale) {
  return genererPDFFactureVenteEmise(donneesFactureVentePDF(sale));
}

async function genererPDFFactureVenteEmise(vente) {
  const doc = new PDFDocument({ margin: 48 });
  const client = vente.client;
  const nomClient = client
    ? [client.prenom, client.nom].filter(Boolean).join(' ')
    : 'Vente comptoir';
  const numeroFacture = vente.factureNumero;
  const nomFichier = vente.nomFichier;

  doc.fontSize(20).text('Facture - Fixel', { align: 'center' });
  doc.moveDown();

  doc.fontSize(10).text(`Facture: ${formatNumero(numeroFacture)}`, { align: 'right' });
  doc.text(`Vente: ${formatNumero(vente.numeroVente)}`, { align: 'right' });
  doc.text(`Date: ${vente.dateVenteAffichee}`, { align: 'right' });
  doc.moveDown();

  doc.fontSize(12).font('Helvetica-Bold').text('Client');
  doc.font('Helvetica')
    .text(nomClient || 'Vente comptoir')
    .text(`Courriel: ${client && client.email ? client.email : vente.emailFacture || 'N/A'}`)
    .text(`Telephone: ${client && client.telephone ? client.telephone : 'N/A'}`);
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Articles');
  doc.moveDown(0.4);

  const startX = doc.x;
  let y = doc.y;
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Description', startX, y, { width: 230 });
  doc.text('Qté', startX + 245, y, { width: 40, align: 'right' });
  doc.text('Prix', startX + 295, y, { width: 75, align: 'right' });
  doc.text('Total', startX + 380, y, { width: 90, align: 'right' });
  y += 18;
  doc.font('Helvetica');

  (vente.items || []).forEach(item => {
    if (y > 690) {
      doc.addPage();
      y = 48;
    }
    doc.text(item.description || '-', startX, y, { width: 230 });
    doc.text(String(item.quantite || 0), startX + 245, y, { width: 40, align: 'right' });
    doc.text(formatMontant(item.prixUnitaire), startX + 295, y, { width: 75, align: 'right' });
    doc.text(formatMontant(item.totalLigne), startX + 380, y, { width: 90, align: 'right' });
    y += 18;
  });

  y += 16;
  doc.font('Helvetica-Bold');
  ligneTotal(doc, y, 'Sous-total', vente.sousTotal); y += 16;
  if (Number(vente.rabais || 0) > 0) {
    ligneTotal(doc, y, 'Rabais', -Number(vente.rabais || 0)); y += 16;
  }
  ligneTotal(doc, y, 'Sous-total apres rabais', vente.sousTotalApresRabais); y += 16;

  if (vente.taxesActivees) {
    ligneTotal(doc, y, 'TPS 5%', vente.montantTPS); y += 16;
    ligneTotal(doc, y, 'TVQ 9.975%', vente.montantTVQ); y += 16;
  } else {
    ligneTotal(doc, y, 'Taxes', 0); y += 16;
  }

  ligneTotal(doc, y, 'Total', vente.total); y += 20;
  doc.font('Helvetica')
    .text(`Mode de paiement: ${libellePaiement(vente.modePaiement)}`, startX, y)
    .text(`Statut paiement: ${libelleStatutPaiement(vente.statutPaiement)}`, startX + 250, y);
  y += 16;
  doc.text(`Montant paye: ${formatMontant(vente.montantPaye)}`, startX, y)
    .text(`Solde: ${formatMontant(vente.solde)}`, startX + 250, y);
  y += 24;

  if (vente.garantieActive) {
    doc.font('Helvetica-Bold').text('Garantie', startX, y);
    y += 16;
    doc.font('Helvetica')
      .text(`Duree: ${vente.garantieJours || 0} jours`, startX, y)
      .text(`Fin: ${vente.dateFinGarantieAffichee}`, startX + 250, y);
    y += 16;
    if (vente.noteGarantie) {
      doc.text(vente.noteGarantie, startX, y, { width: 470 });
      y += 24;
    }
  }

  if (vente.notes) {
    doc.font('Helvetica-Bold').text('Notes', startX, y);
    y += 16;
    doc.font('Helvetica').text(vente.notes, startX, y, { width: 470 });
  }

  doc.moveDown(4);
  doc.fontSize(11).text('Merci pour votre confiance.', { align: 'center' });
  doc.fillColor('blue').text(vente.contact, { align: 'center', underline: true, link: `mailto:${vente.contact}` });

  const pdfBuffer = await createPDFBuffer(doc);
  return { pdfBuffer, nomFichier };
}

function ligneTotal(doc, y, label, valeur) {
  doc.text(`${label}:`, 280, y, { width: 110, align: 'right' });
  doc.text(formatMontant(valeur), 400, y, { width: 90, align: 'right' });
}

function formatNumero(numero) {
  return numero ? `#${String(numero).padStart(4, '0')}` : '-';
}

function nomFichierFactureVente(numero) {
  return `facture_vente_${String(numero).padStart(4, '0')}.pdf`;
}

function formatDate(valeur) {
  if (!valeur) return '-';
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('fr-CA');
}

function formatMontant(valeur) {
  const nombre = Number.parseFloat(valeur);
  return `${(Number.isFinite(nombre) ? nombre : 0).toFixed(2)} $`;
}

function libellePaiement(valeur) {
  const libelles = {
    comptant: 'Comptant',
    interac: 'Interac',
    virement: 'Virement',
    carte: 'Carte',
    autre: 'Autre'
  };
  return libelles[valeur] || valeur || '-';
}

function libelleStatutPaiement(valeur) {
  const libelles = {
    paye: 'Paye',
    'partiellement paye': 'Partiellement paye',
    'non paye': 'Non paye'
  };
  return libelles[valeur] || valeur || '-';
}

module.exports = {
  donneesFactureVentePDF,
  genererFactureVentePDF,
  genererPDFFactureVenteEmise,
  nomFichierFactureVente
};
