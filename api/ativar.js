// api/ativar.js
// Endpoint publico (sem login) chamado pelo app ISL Ativador para validar/ativar chaves.
// Valida e vincula o dispositivo no Firestore (colecao "keys", a mesma do painel).
// O conteudo (content_base64) continua vindo de onde sempre veio: a RPC antiga do
// Supabase (claim_activation_code_v2) — so que agora quem chama ela e este backend
// (uma unica vez, no primeiro sucesso), nunca mais o app do cliente. O resultado fica
// em cache no proprio doc da chave no Firestore, entao a RPC do Supabase so e chamada
// 1 vez por chave, mesmo se o app reabrir depois.
//
// O app (apos a edicao no APK) exige SEMPRE HTTP 200, corpo = ARRAY com 1 objeto:
//   sucesso -> [{ "ok": true,  "content_base64": "..." }]
//   falha   -> [{ "ok": false, "reason": "already_consumed" | "invalid_code" | ... }]

const crypto = require('crypto');
const { db, Erro, cors } = require('./_lib');

const SUPABASE_URL = 'https://mutyoiawpbjequhwczkh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XBp4pukrs433TVozc7ey-g_Qdd42M64'; // mesma que ja estava publica no APK (versao 3.0.30, atualizada)

// Chave nova (gerada so no painel, nunca existiu no Supabase) nao tem content_base64
// pra buscar. Em vez de travar a ativacao, usa esse valor padrao (>=200 bytes
// decodificados, exigencia do proprio app). Troque via env var DEFAULT_CONFIG_BASE64
// quando/se decidir o que realmente deve ir aqui -- sem isso, so libera com um
// conteudo generico mesmo.
const DEFAULT_CONFIG_BASE64 =
  process.env.DEFAULT_CONFIG_BASE64 ||
  'SVNMLUFUSVZBRE9SLURFRkFVTFQtQ09ORklHLTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw';

function sha256hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

// A RPC antiga esperava o hash da chave como o usuario digitou (com ou sem traco,
// nao sabemos ao certo) -- tenta as duas variantes.
async function buscaConteudoViaSupabaseRpc(chaveComTraco, chaveSemTraco, bodyApp) {
  for (const candidato of [chaveSemTraco, chaveComTraco]) {
    const body = {
      ...bodyApp,
      p_code_hash: sha256hex(candidato),
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_activation_code_v2`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    let linhas = [];
    try { linhas = await r.json(); } catch { linhas = []; }
    const item = Array.isArray(linhas) ? linhas[0] : null;
    if (item?.ok && item?.content_base64) return item.content_base64;
  }
  return null;
}

// As chaves sao geradas como WP-XXXX-XXXX-XXXX (ver painel), exibidas sem traco ao cliente.
function normalizaChave(raw) {
  const limpo = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpo.length !== 14 || !limpo.startsWith('WP')) return null;
  return `WP-${limpo.slice(2, 6)}-${limpo.slice(6, 10)}-${limpo.slice(10, 14)}`;
}

function normalizaDispositivo(raw) {
  const d = String(raw || '').trim();
  return d.length >= 8 && d.length <= 128 ? d : null;
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  const envia = (corpo) => res.status(200).json([corpo]);

  try {
    if (req.method !== 'POST') throw new Erro('Metodo nao permitido.', 405);

    const chaveId = normalizaChave(req.body?.p_code_hash);
    const deviceId = normalizaDispositivo(req.body?.p_android_id_hash);
    if (!chaveId) return envia({ ok: false, reason: 'invalid_code' });
    if (!deviceId) return envia({ ok: false, reason: 'invalid_device' });

    const ref = db.doc('keys/' + chaveId);

    const decisao = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { status: 'invalid_code' };

      const c = snap.data();
      if (c.status === 'blocked') return { status: 'blocked' };

      if (c.used) {
        if (c.deviceId && c.deviceId === deviceId) {
          return { status: 'ok', cache: c.contentBase64 || null };
        }
        return { status: 'already_consumed' };
      }

      tx.update(ref, { used: true, usedAt: Date.now(), deviceId });
      return { status: 'ok', cache: null };
    });

    if (decisao.status !== 'ok') return envia({ ok: false, reason: decisao.status });

    if (decisao.cache) return envia({ ok: true, content_base64: decisao.cache });

    const chaveSemTraco = chaveId.replace(/-/g, '');
    const conteudo = await buscaConteudoViaSupabaseRpc(chaveId, chaveSemTraco, {
      p_device_fingerprint: req.body?.p_device_fingerprint || '',
      p_device_model: req.body?.p_device_model || '',
      p_android_id_hash: deviceId,
      p_app_version: req.body?.p_app_version || '',
    });

    const conteudoFinal = conteudo || DEFAULT_CONFIG_BASE64; // chave nova -> placeholder padrao

    await ref.update({ contentBase64: conteudoFinal }); // cache: evita chamar o Supabase de novo
    envia({ ok: true, content_base64: conteudoFinal });
  } catch (e) {
    console.error('ativar.js:', e);
    envia({ ok: false, reason: 'server_error' });
  }
};
