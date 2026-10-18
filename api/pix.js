const { db, Erro, cors, quem, saldoRef, mp, falha } = require('./_lib');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'POST') throw new Erro('Método inválido.', 405);
    const u = await quem(req);
    if (u.isOwner) throw new Erro('O dono não compra créditos.');
    const [pkg, euDoc] = await Promise.all([
      db.doc('packages/' + String((req.body || {}).packageId || '_')).get(),
      db.doc('resellers/' + u.uid).get()
    ]);
    if (!pkg.exists || pkg.data().active === false) throw new Erro('Pacote indisponível.');
    const p = pkg.data();
    const eu = euDoc.data();
    if (p.sellerId !== eu.parentId) throw new Erro('Esse pacote não é do seu fornecedor.', 403);
    p.price = Math.round(Number(p.price) * 100) / 100;
    if (!Number.isInteger(p.credits) || p.credits < 1 || !(p.price >= 0.01)) throw new Erro('Pacote inválido. Avise seu fornecedor.');

    // evita encher o Mercado Pago de Pix abertos pelo mesmo comprador
    const meus = await db.collection('orders').where('buyerId', '==', u.uid).limit(30).get();
    if (meus.docs.filter(d => d.data().status === 'pending' && d.data().createdAt > Date.now() - 30 * 60e3).length >= 5)
      throw new Erro('Você já tem vários Pix aguardando pagamento. Pague um deles ou espere expirar.');

    const [tk, saldoDoc] = await Promise.all([db.doc('mpTokens/' + p.sellerId).get(), saldoRef(p.sellerId).get()]);
    if (!tk.exists) throw new Erro('Seu fornecedor ainda não ativou o Pix.');
    const saldo = saldoDoc.data();
    if (!saldo || Number(saldo.balance || 0) < p.credits) throw new Erro('Pacote indisponível no momento (fornecedor sem créditos).');

    const ordem = db.collection('orders').doc();
    const base = process.env.SITE_URL || ('https://' + req.headers.host);
    const r = await mp(tk.data().token, '/v1/payments', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': ordem.id },
      body: JSON.stringify({
        transaction_amount: p.price,
        description: `${p.name} - ${p.credits} créditos`,
        payment_method_id: 'pix',
        payer: { email: u.email },
        external_reference: ordem.id,
        notification_url: `${base}/api/webhook?s=${encodeURIComponent(p.sellerId)}`,
        date_of_expiration: new Date(Date.now() + 30 * 60e3).toISOString().replace('Z', '+00:00')
      })
    });
    const j = await r.json();
    const td = j.point_of_interaction && j.point_of_interaction.transaction_data;
    if (!r.ok || !td) {
      console.error('MP', r.status, JSON.stringify(j));
      const motivo = (j && ((j.cause && j.cause[0] && j.cause[0].description) || j.message)) || '';
      throw new Erro('Não foi possível gerar o Pix' + (motivo ? ': ' + motivo : '.') + ' Confira se a conta Mercado Pago do fornecedor tem chave Pix cadastrada e se o e-mail do comprador é diferente do e-mail dessa conta.', 502);
    }

    await ordem.set({
      buyerId: u.uid, buyerName: eu.name || '', sellerId: p.sellerId, packageId: pkg.id, packageName: p.name,
      credits: p.credits, amount: p.price, status: 'pending', paymentId: String(j.id), createdAt: Date.now()
    });
    res.json({ orderId: ordem.id, copiaCola: td.qr_code, qrBase64: td.qr_code_base64 });
  } catch (e) { falha(res, e); }
};
