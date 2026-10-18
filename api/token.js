const { db, Erro, cors, quem, mp, falha } = require('./_lib');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    if (req.method !== 'POST') throw new Erro('Método inválido.', 405);
    const u = await quem(req);
    const token = String((req.body || {}).token || '').trim();
    if (token.length < 20) throw new Erro('Token inválido.');
    const r = await mp(token, '/users/me');
    if (!r.ok) throw new Erro('O Mercado Pago recusou esse token. Use o Access Token de produção.');
    const me = await r.json();
    const nome = me.nickname || me.email || '';
    await db.doc('mpTokens/' + u.sellerId).set({ token, updatedAt: Date.now() });
    await db.doc('pagSellers/' + u.sellerId).set({ mpOk: true, mpNome: nome, updatedAt: Date.now() });
    res.json({ ok: true, nome });
  } catch (e) { falha(res, e); }
};
