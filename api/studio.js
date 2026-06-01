const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

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
  res.setHeader('Access-Control-Allow-Origin', 'https://agendastudio.vercel.app');

  if (req.method !== 'GET') return res.status(405).end();

  const { studioId } = req.query;
  if (!studioId) return res.status(400).json({ error: 'studioId obrigatório' });

  try {
    const db = getDatabase(getApp());
    const snap = await db.ref(`studios/${studioId}`).get();

    if (!snap.exists()) return res.status(404).json({ error: 'Estúdio não encontrado' });

    const dados = snap.val();

    // Retorna APENAS dados públicos necessários para agendamento
    return res.status(200).json({
      nomeStudio: dados.nomeStudio || '',
      tipoServico: dados.tipoServico || '',
      cidade: dados.cidade || '',
      whatsapp: dados.whatsapp || '',
      servicos: dados.servicos || [],
      diasAtendimento: dados.config?.dias || [0,1,2,3,4,5]
    });

  } catch(e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
