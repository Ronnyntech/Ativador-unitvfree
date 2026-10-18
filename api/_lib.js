const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

class Erro extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

async function quem(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t) throw new Erro('Faça login novamente.', 401);
  let d;
  try { d = await admin.auth().verifyIdToken(t); } catch (e) { throw new Erro('Sessão inválida. Entre de novo.', 401); }
  const isOwner = d.uid === process.env.OWNER_UID;
  if (!isOwner) {
    const r = await db.doc('resellers/' + d.uid).get();
    if (!r.exists || r.data().active === false) throw new Erro('Conta sem acesso.', 403);
  }
  return { uid: d.uid, email: d.email, isOwner, sellerId: isOwner ? 'owner' : d.uid };
}

const saldoRef = (sellerId) => sellerId === 'owner' ? db.doc('config/credits') : db.doc('resellers/' + sellerId);

function mp(token, path, opts = {}) {
  return fetch('https://api.mercadopago.com' + path, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
}

function falha(res, e) {
  if (!(e instanceof Erro)) console.error(e);
  res.status(e.status || 500).json({ erro: e instanceof Erro ? e.message : 'Erro no servidor. Tente de novo.' });
}

module.exports = { admin, db, Erro, cors, quem, saldoRef, mp, falha };
