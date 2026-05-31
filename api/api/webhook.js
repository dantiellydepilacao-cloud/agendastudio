const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

let app;
function getApp() {
  if (!app) {
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
  }
  return app;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const { type, data } = req.body;

  if (type === 'payment' || type === 'preapproval') {
    try {
      const db = getDatabase(getApp());
      const paymentId = data?.id;
      if (!paymentId) return res.status(200).end();

      // Busca o pagamento no MP para pegar o studioId
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
      );
      const payment = await response.json();
      const studioId = payment.external_reference;

      if (studioId && payment.status === 'approved') {
        const agora = new Date();
        const vencimento = new Date(agora.getFullYear(), agora.getMonth() + 1, agora.getDate());
        await db.ref(`studios/${studioId}`).update({
          plano: 'ativo',
          planoVencimento: vencimento.toISOString(),
          ultimoPagamento: agora.toISOString()
        });
      }
    } catch(e) {
      console.error(e);
    }
  }

  return res.status(200).end();
};
