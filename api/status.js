const { db, Erro, cors, quem, saldoRef, mp, falha } = require('./_lib');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'POST') throw new Erro('Método inválido.', 405);
    const u = await quem(req);
    const oRef = db.doc('orders/' + String((req.body || {}).orderId || '_'));
    const o = await oRef.get();
    if (!o.exists || o.data().buyerId !== u.uid) throw new Erro('Pedido não encontrado.', 404);
    const d = o.data();
    if (d.status === 'paid') return res.json({ status: 'paid' });

    const tk = await db.doc('mpTokens/' + d.sellerId).get();
    if (!tk.exists) return res.json({ status: d.status });
    const r = await mp(tk.data().token, '/v1/payments/' + encodeURIComponent(d.paymentId));
    if (!r.ok) return res.json({ status: d.status });
    const pay = await r.json();

    if (pay.status === 'approved' && pay.external_reference === oRef.id && String(pay.id) === d.paymentId && Number(pay.transaction_amount) === Number(d.amount)) {
      await db.runTransaction(async tx => {
        const cur = await tx.get(oRef);
        const c = cur.data();
        if (c.status === 'paid') return;
        const sRef = saldoRef(c.sellerId), bRef = db.doc('resellers/' + c.buyerId);
        const [s, bu] = await Promise.all([tx.get(sRef), tx.get(bRef)]);
        const sSaldo = Number((s.data() || {}).balance || 0);
        if (!bu.exists || sSaldo < c.credits) { tx.update(oRef, { status: 'sem_saldo', paidAt: Date.now() }); return; }
        tx.update(sRef, { balance: sSaldo - c.credits });
        tx.update(bRef, { balance: Number(bu.data().balance || 0) + c.credits });
        tx.update(oRef, { status: 'paid', paidAt: Date.now() });
      });
    }
    res.json({ status: ((await oRef.get()).data() || {}).status });
  } catch (e) { falha(res, e); }
};
