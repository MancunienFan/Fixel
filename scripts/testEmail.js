require('dotenv').config();
const { sendEmail } = require('../utils/emailSender');

async function main() {
  const to = process.argv[2] || process.env.EMAIL_TEST_TO;

  if (!to) {
    throw new Error('Destinataire manquant. Utilisez: npm run test:email -- adresse@example.com');
  }

  const result = await sendEmail({
    to,
    subject: 'Test Gmail Fixel',
    text: 'Ceci est un test Gmail Fixel.',
    html: '<p>Ceci est un <strong>test Gmail Fixel</strong>.</p>'
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
