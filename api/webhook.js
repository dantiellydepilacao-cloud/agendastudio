const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const crypto = require('crypto');

function getApp() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
  }
  return getApps()[0];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.MP_WEBHOOK_SECRET;
  if (secret) {
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    const dataId = req.query?.['data.id'] || req.body?.data?.id;

    if (!xSignature) return res.status(401).end();

    const parts = xSignature.split(',');
    let ts = '', v1 = '';
    parts.forEach(part => {
      const [key, val] = part.trim().split('=');
      if (key === 'ts') ts = val;
      if (key === 'v1') v1 = val;
    });

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    if (hmac !== v1) return res.status(401).end();
  }

  const { type, data } = req.body;

  if (type === 'payment' || type === 'preapproval') {
    try {
      const db = getDatabase(getApp());
      const paymentId = data?.id;
      if (!paymentId) return res.status(200).end();

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
