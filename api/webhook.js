const { db, cors, saldoRef, mp } = require('./_lib');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    const q = req.query || {}, b = req.body || {};
    const sellerId = String(q.s || ''), id = String(q['data.id'] || (b.data && b.data.id) || '');
    const tipo = q.type || b.type || 'payment';
    if (!sellerId || !id || tipo !== 'payment') return res.status(200).end();

    const tk = await db.doc('mpTokens/' + sellerId).get();
    if (!tk.exists) return res.status(200).end();
    const r = await mp(tk.data().token, '/v1/payments/' + encodeURIComponent(id));
    if (!r.ok) return res.status(500).end();
    const pay = await r.json();
    if (pay.status !== 'approved' || !pay.external_reference) return res.status(200).end();

    const oRef = db.doc('orders/' + pay.external_reference);
    await db.runTransaction(async tx => {
      const o = await tx.get(oRef);
      if (!o.exists) return;
      const d = o.data();
      if (d.status === 'paid' || d.sellerId !== sellerId || String(pay.id) !== d.paymentId || Number(pay.transaction_amount) !== Number(d.amount)) return;
      const sRef = saldoRef(sellerId), bRef = db.doc('resellers/' + d.buyerId);
      const [s, bu] = await Promise.all([tx.get(sRef), tx.get(bRef)]);
      const sSaldo = Number((s.data() || {}).balance || 0);
      if (!bu.exists || sSaldo < d.credits) { tx.update(oRef, { status: 'sem_saldo', paidAt: Date.now() }); return; }
      tx.update(sRef, { balance: sSaldo - d.credits });
      tx.update(bRef, { balance: Number(bu.data().balance || 0) + d.credits });
      tx.update(oRef, { status: 'paid', paidAt: Date.now() });
    });
    res.status(200).end();
  } catch (e) { console.error(e); res.status(500).end(); }
};
