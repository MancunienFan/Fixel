require('dotenv').config();
const mailjet = require('node-mailjet')
  .apiConnect(process.env.MJ_APIKEY_PUBLIC, process.env.MJ_APIKEY_PRIVATE);

const envoyerFacture = async (destinataireEmail, nomClient, pdfBuffer, nomFichierPDF) => {
  if (!process.env.EMAIL_FROM || !process.env.EMAIL_NAME) {
    console.error("Variables d'environnement EMAIL_FROM ou EMAIL_NAME manquantes.");
    return;
  }
  if (!destinataireEmail) {
    console.error("Email destinataire manquant.");
    return;
  }
  if (!pdfBuffer || !Buffer.isBuffer(pdfBuffer)) {
    console.error("pdfBuffer est manquant ou n'est pas un Buffer valide.");
    return;
  }

  // Optionnel : s'assurer que nomFichierPDF finit par .pdf
  if (!nomFichierPDF) nomFichierPDF = "facture.pdf";
  else if (!nomFichierPDF.toLowerCase().endsWith('.pdf')) nomFichierPDF += '.pdf';

  console.log(`Envoi du PDF de taille : ${pdfBuffer.length} octets à ${destinataireEmail}`);

  try {
    const request = await mailjet
      .post("send", { version: "v3.1" })
      .request({
        Messages: [
          {
            From: {
              Email: process.env.EMAIL_FROM,
              Name: process.env.EMAIL_NAME,
            },
            To: [
              {
                Email: destinataireEmail,
                Name: nomClient || "Client",
              },
            ],
            Subject: "Votre facture FixEl",
            TextPart: "Bonjour, veuillez trouver en pièce jointe votre facture FixEl.",
            Attachments: [
              {
                ContentType: "application/pdf",
                Filename: nomFichierPDF,
                Base64Content: pdfBuffer.toString("base64"),
              },
            ],
          },
        ],
      });

    console.log("Email envoyé avec succès !");
    return request.body;
  } catch (err) {
    if (err.response && err.response.body) {
      console.error("Erreur d'envoi de l'email :", JSON.stringify(err.response.body, null, 2));
    } else {
      console.error("Erreur d'envoi de l'email :", err);
    }
  }
};

module.exports = envoyerFacture;
