require('dotenv').config();
const { sendEmail } = require('../utils/emailSender');
const { getEmailProvider } = require('../utils/emailSender');

async function main() {
  const to = process.argv[2] || process.env.EMAIL_TEST_TO;

  if (!to) {
    throw new Error('Destinataire manquant. Utilisez: npm run test:email -- adresse@example.com');
  }

  const result = await sendEmail({
    to,
    subject: getEmailProvider() === 'gmail' ? 'Test Gmail Fixel' : 'Test Mailjet Fixel',
    text: 'Ceci est un test email Fixel.',
    html: '<p>Ceci est un <strong>test email Fixel</strong>.</p>'
  });

  console.log(JSON.stringify({
    success: result.success,
    provider: result.provider,
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected
  }, null, 2));
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
