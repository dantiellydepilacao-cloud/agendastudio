const { MercadoPagoConfig, PreApproval, Payment } = require('mercadopago');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

// Inicializa Firebase Admin
let app;
function getApp() {
  if (!getApps().length) {
    app = initializeApp({
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

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, studioId, tipo } = req.body;

  if (!email || !studioId || !tipo) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  try {
    // Verifica se o estúdio existe e está em trial/ativo no Firebase
    const db = getDatabase(getApp());
    const studioSnap = await db.ref(`studios/${studioId}`).get();

    if (!studioSnap.exists()) {
      return res.status(404).json({ error: 'Estúdio não encontrado' });
    }

    const studio = studioSnap.val();

    // Verifica se o e-mail bate com o cadastro
    if (studio.email !== email) {
      return res.status(403).json({ error: 'Não autorizado' });
    }

    // Valor fixo no servidor — nunca confia no frontend
    const VALOR_PLANO = 59.99;

    if (tipo === 'cartao') {
      const preApproval = new PreApproval(client);
      const resultado = await preApproval.create({
        body: {
          reason: 'AgendaStudio — Plano Mensal',
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: VALOR_PLANO,
            currency_id: 'BRL'
          },
          payer_email: email,
          back_url: `https://agendastudio.vercel.app/painel.html`,
          external_reference: studioId,
          status: 'pending'
        }
      });
      return res.status(200).json({ url: resultado.init_point, id: resultado.id });
    }

    if (tipo === 'pix') {
      const payment = new Payment(client);
      const resultado = await payment.create({
        body: {
          transaction_amount: VALOR_PLANO,
          description: `AgendaStudio — Plano Mensal (${studio.nomeStudio})`,
          payment_method_id: 'pix',
          payer: { 
            email,
            first_name: studio.nomeResponsavel || studio.nomeStudio
          },
          external_reference: studioId,
          notification_url: 'https://agendastudio.vercel.app/api/webhook'
        }
      });
      return res.status(200).json({
        qr_code: resultado.point_of_interaction.transaction_data.qr_code,
        qr_code_base64: resultado.point_of_interaction.transaction_data.qr_code_base64,
        id: resultado.id
      });
    }

    return res.status(400).json({ error: 'Tipo inválido' });

  } catch(e) {
    console.error('Erro assinar:', e);
    return res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
};
