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
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  if (req.method !== 'GET') return res.status(405).end();

  const { studioId, data } = req.query;
  if (!studioId || !data) return res.status(400).json({ error: 'Parâmetros inválidos' });

  try {
    const db = getDatabase(getApp());

    // Busca config, agendamentos e bloqueios com chave admin
    const [configSnap, agSnap, blSnap] = await Promise.all([
      db.ref(`studios/${studioId}/config`).get(),
      db.ref(`studios/${studioId}/agendamentos`).get(),
      db.ref(`studios/${studioId}/bloqueios`).get()
    ]);

    const config = configSnap.val() || {};
    const agendamentos = agSnap.val() || {};
    const bloqueios = blSnap.val() || {};

    // Horários configurados
    const horarios = config.horarios || ['08:00','09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00'];

    // Horários ocupados no dia
    const ocupados = new Set();
    Object.values(agendamentos).forEach(a => {
      if (a.data === data && a.status !== 'cancelado') ocupados.add(a.hora);
    });
    Object.values(bloqueios).forEach(b => {
      if (b.data === data) ocupados.add(b.hora);
    });

    // Retorna só disponibilidade — sem dados de clientes
    const resultado = horarios.map(h => ({
      hora: h,
      disponivel: !ocupados.has(h)
    }));

    return res.status(200).json({ horarios: resultado });

  } catch(e) {
    console.error(e);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
