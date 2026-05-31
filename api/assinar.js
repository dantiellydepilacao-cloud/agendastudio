const { MercadoPagoConfig, PreApproval } = require('mercadopago');

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN 
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, nome, studioId, tipo } = req.body;

  try {
    if (tipo === 'cartao') {
      const preApproval = new PreApproval(client);
      const resultado = await preApproval.create({
        body: {
          reason: 'AgendaStudio — Plano Mensal',
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: 59.99,
            currency_id: 'BRL'
          },
          payer_email: email,
          back_url: `https://agendastudio.vercel.app/painel.html`,
          status: 'pending'
        }
      });
      return res.status(200).json({ url: resultado.init_point, id: resultado.id });
    }

    if (tipo === 'pix') {
      const { MercadoPagoConfig: MPC, Payment } = require('mercadopago');
      const payment = new Payment(client);
      const resultado = await payment.create({
        body: {
          transaction_amount: 59.99,
          description: 'AgendaStudio — Plano Mensal',
          payment_method_id: 'pix',
          payer: { email },
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
    console.error(e);
    return res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
};
