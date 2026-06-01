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
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { studioId, nome, whatsapp, servico, data, hora } = req.body;

  if (!studioId || !nome || !whatsapp || !servico || !data || !hora) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  try {
    const db = getDatabase(getApp());

    // Verifica se horário ainda está disponível
    const [agSnap, blSnap] = await Promise.all([
      db.ref(`studios/${studioId}/agendamentos`).get(),
      db.ref(`studios/${studioId}/bloqueios`).get()
    ]);

    const agendamentos = agSnap.val() || {};
    const bloqueios = blSnap.val() || {};

    const ocupado = Object.values(agendamentos).some(a => 
      a.data === data && a.hora === hora && a.status !== 'cancelado'
    ) || Object.values(bloqueios).some(b => b.data === data && b.hora === hora);

    if (ocupado) {
      return res.status(409).json({ error: 'Horário já ocupado' });
    }

    // Salva agendamento
    const novoRef = db.ref(`studios/${studioId}/agendamentos`).push();
    await novoRef.set({
      nome,
      whatsapp,
      servico,
      data,
      hora,
      status: 'pendente',
      criadoEm: new Date().toISOString()
    });

    return res.status(200).json({ id: novoRef.key, sucesso: true });

  } catch(e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro ao agendar' });
  }
};
