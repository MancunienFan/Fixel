require('dotenv').config();
const nodemailer = require('nodemailer');

let transporter;

function getEmailConfig() {
  const user = process.env.GMAIL_USER || process.env.EMAIL_FROM;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const fromName = process.env.GMAIL_FROM_NAME || process.env.EMAIL_NAME || 'Fixel';
  const fromAddress = process.env.GMAIL_USER || process.env.EMAIL_FROM || process.env.FIXEL_EMAIL;
  const replyTo = process.env.GMAIL_REPLY_TO || fromAddress;

  return {
    user,
    pass,
    fromName,
    fromAddress,
    replyTo
  };
}

function getTransporter() {
  if (transporter) return transporter;

  const config = getEmailConfig();
  if (!config.user) {
    throw new Error('Variable GMAIL_USER ou EMAIL_FROM manquante.');
  }
  if (!config.pass) {
    throw new Error('Variable GMAIL_APP_PASSWORD manquante.');
  }

  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });

  return transporter;
}

function buildFromHeader() {
  const config = getEmailConfig();
  if (!config.fromAddress) {
    throw new Error('Adresse expediteur manquante.');
  }

  return `${config.fromName} <${config.fromAddress}>`;
}

async function sendEmail({ to, subject, text, html, attachments, replyTo } = {}) {
  if (!to) {
    throw new Error('Destinataire email manquant.');
  }
  if (!subject) {
    throw new Error('Sujet email manquant.');
  }
  if (!text && !html) {
    throw new Error('Contenu email manquant.');
  }

  try {
    const info = await getTransporter().sendMail({
      from: buildFromHeader(),
      to,
      subject,
      text,
      html,
      attachments: Array.isArray(attachments) ? attachments : undefined,
      replyTo: replyTo || getEmailConfig().replyTo
    });

    return {
      success: true,
      provider: 'gmail',
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected
    };
  } catch (err) {
    const erreur = new Error(`Erreur d'envoi email Gmail: ${err.message}`);
    erreur.code = err.code;
    throw erreur;
  }
}

async function envoyerFacture(destinataireEmail, nomClient, pdfBuffer, nomFichierPDF) {
  if (!destinataireEmail) {
    throw new Error('Email destinataire manquant.');
  }
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
    throw new Error("pdfBuffer est manquant ou n'est pas un Buffer valide.");
  }

  let filename = nomFichierPDF || 'facture.pdf';
  if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';

  return sendEmail({
    to: destinataireEmail,
    subject: 'Votre facture FixEl',
    text: 'Bonjour, veuillez trouver en piece jointe votre facture FixEl.',
    html: `
      <p>Bonjour ${echapperHtml(nomClient || 'Client')},</p>
      <p>Veuillez trouver en piece jointe votre facture FixEl.</p>
      <p>Merci.</p>
    `,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  });
}

function echapperHtml(valeur) {
  return String(valeur)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = envoyerFacture;
module.exports.sendEmail = sendEmail;
