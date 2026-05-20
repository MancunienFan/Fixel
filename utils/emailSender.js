require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const nodemailer = require('nodemailer');
const Mailjet = require('node-mailjet');

let gmailTransporter;
let mailjetClient;

function getEmailProvider() {
  return (process.env.EMAIL_PROVIDER || 'mailjet').toLowerCase().trim();
}

function getEmailConfig() {
  const provider = getEmailProvider();
  const fromName = process.env.EMAIL_NAME || process.env.GMAIL_FROM_NAME || 'Fixel';
  const fromAddress = process.env.EMAIL_FROM || process.env.GMAIL_USER || process.env.FIXEL_EMAIL;
  const replyTo = process.env.EMAIL_REPLY_TO
    || process.env.GMAIL_REPLY_TO
    || process.env.FIXEL_EMAIL
    || fromAddress;

  return {
    provider,
    fromName,
    fromAddress,
    replyTo,
    gmailUser: process.env.GMAIL_USER || process.env.EMAIL_FROM,
    gmailPassword: process.env.GMAIL_APP_PASSWORD,
    mailjetPublicKey: process.env.MJ_APIKEY_PUBLIC,
    mailjetPrivateKey: process.env.MJ_APIKEY_PRIVATE
  };
}

function validerPayloadEmail({ to, subject, text, html }) {
  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new Error('Destinataire email manquant.');
  }
  if (!subject) {
    throw new Error('Sujet email manquant.');
  }
  if (!text && !html) {
    throw new Error('Contenu email manquant.');
  }
}

async function sendEmail({ to, subject, text, html, attachments, replyTo } = {}) {
  validerPayloadEmail({ to, subject, text, html });

  const config = getEmailConfig();
  const destinataires = normaliserDestinataires(to);
  const replyToFinal = replyTo || config.replyTo;

  try {
    console.log(`Email ${config.provider}: envoi vers ${destinataires.join(', ')} - ${subject}`);

    if (config.provider === 'gmail') {
      return await envoyerAvecGmail({ to: destinataires, subject, text, html, attachments, replyTo: replyToFinal }, config);
    }

    if (config.provider === 'mailjet') {
      return await envoyerAvecMailjet({ to: destinataires, subject, text, html, attachments, replyTo: replyToFinal }, config);
    }

    throw new Error(`EMAIL_PROVIDER non supporte: ${config.provider}`);
  } catch (err) {
    const message = config.provider === 'mailjet'
      ? `Echec de l'envoi Mailjet: ${messageErreurEmail(err)}`
      : `Echec de l'envoi Gmail: ${messageErreurEmail(err)}`;
    console.error(message);
    const erreur = new Error(message);
    erreur.code = err.code || err.statusCode;
    throw erreur;
  }
}

async function envoyerAvecMailjet({ to, subject, text, html, attachments, replyTo }, config) {
  if (!config.mailjetPublicKey || !config.mailjetPrivateKey) {
    throw new Error('Variables MJ_APIKEY_PUBLIC ou MJ_APIKEY_PRIVATE manquantes.');
  }
  if (!config.fromAddress) {
    throw new Error('Variable EMAIL_FROM manquante.');
  }

  if (!mailjetClient) {
    mailjetClient = Mailjet.apiConnect(config.mailjetPublicKey, config.mailjetPrivateKey);
  }

  const request = await mailjetClient
    .post('send', { version: 'v3.1' })
    .request({
      Messages: [
        {
          From: {
            Email: config.fromAddress,
            Name: config.fromName
          },
          To: to.map(email => ({ Email: email })),
          ReplyTo: replyTo ? { Email: replyTo } : undefined,
          Subject: subject,
          TextPart: text || texteDepuisHtml(html),
          HTMLPart: html,
          Attachments: await convertirAttachmentsMailjet(attachments)
        }
      ]
    });

  console.log(`Email mailjet: succes vers ${to.join(', ')} - ${subject}`);
  return {
    success: true,
    provider: 'mailjet',
    messageId: lireMessageIdMailjet(request.body),
    accepted: to,
    rejected: []
  };
}

async function envoyerAvecGmail({ to, subject, text, html, attachments, replyTo }, config) {
  if (!config.gmailUser) {
    throw new Error('Variable GMAIL_USER ou EMAIL_FROM manquante.');
  }
  if (!config.gmailPassword) {
    throw new Error('Variable GMAIL_APP_PASSWORD manquante.');
  }
  if (!config.fromAddress) {
    throw new Error('Adresse expediteur manquante.');
  }

  if (!gmailTransporter) {
    gmailTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: config.gmailUser,
        pass: config.gmailPassword
      }
    });
  }

  const info = await gmailTransporter.sendMail({
    from: `${config.fromName} <${config.fromAddress}>`,
    to,
    subject,
    text,
    html,
    attachments: Array.isArray(attachments) ? attachments : undefined,
    replyTo
  });

  console.log(`Email gmail: succes vers ${to.join(', ')} - ${subject}`);
  return {
    success: true,
    provider: 'gmail',
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected
  };
}

async function convertirAttachmentsMailjet(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return undefined;

  const resultats = [];
  for (const attachment of attachments) {
    const filename = attachment.filename || (attachment.path ? path.basename(attachment.path) : 'piece-jointe');
    const contentType = attachment.contentType || 'application/octet-stream';
    let contenu;

    if (Buffer.isBuffer(attachment.content)) {
      contenu = attachment.content;
    } else if (typeof attachment.content === 'string') {
      contenu = Buffer.from(attachment.content);
    } else if (attachment.path) {
      contenu = await fs.readFile(attachment.path);
    } else {
      throw new Error(`Piece jointe invalide: ${filename}`);
    }

    resultats.push({
      ContentType: contentType,
      Filename: filename,
      Base64Content: contenu.toString('base64')
    });
  }

  return resultats;
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

function normaliserDestinataires(to) {
  return (Array.isArray(to) ? to : String(to).split(','))
    .map(email => String(email).trim())
    .filter(Boolean);
}

function lireMessageIdMailjet(body) {
  const message = body && Array.isArray(body.Messages) && body.Messages[0];
  return message && Array.isArray(message.To) && message.To[0] && message.To[0].MessageID
    ? String(message.To[0].MessageID)
    : undefined;
}

function texteDepuisHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function messageErreurEmail(err) {
  if (!err) return 'Erreur inconnue';
  if (err.response && err.response.body) {
    const body = err.response.body;
    const messages = body.Messages || body.ErrorMessage || body.message;
    return typeof messages === 'string' ? messages : JSON.stringify(messages);
  }
  return err.message || 'Erreur inconnue';
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
module.exports.getEmailProvider = getEmailProvider;
