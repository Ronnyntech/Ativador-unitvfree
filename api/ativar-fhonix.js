// api/ativar-fhonix.js
// Validacao de chave pro app FhonixStream (com.ativacao.app), reaproveitando a MESMA
// colecao "keys" do Firestore que o ISL Ativador/painel ja usam.
//
// O app chama via GET: /ativar-fhonix?codigo=XXX&device_id=YYY
// Espera SEMPRE HTTP 200, corpo = objeto JSON simples (nao array):
//   { "valid": true }  ou  { "valid": false }

const { db } = require('./_lib');

function normalizaChave(raw) {
  const limpo = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (limpo.length !== 14 || !limpo.startsWith('WP')) return null;
  return `WP-${limpo.slice(2, 6)}-${limpo.slice(6, 10)}-${limpo.slice(10, 14)}`;
}

function normalizaDispositivo(raw) {
  const d = String(raw || '').trim();
  return d.length >= 4 && d.length <= 200 ? d : null;
}

module.exports = async (req, res) => {
  const envia = (valid) => res.status(200).json({ valid });

  try {
    const chaveId = normalizaChave(req.query?.codigo);
    const deviceId = normalizaDispositivo(req.query?.device_id);
    if (!chaveId || !deviceId) return envia(false);

    const ref = db.doc('keys/' + chaveId);

    const valido = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;

      const c = snap.data();
      if (c.status === 'blocked') return false;

      if (c.used) {
        return !!(c.deviceId && c.deviceId === deviceId); // mesmo aparelho -> ok
      }

      tx.update(ref, { used: true, usedAt: Date.now(), deviceId });
      return true;
    });

    envia(valido);
  } catch (e) {
    console.error('ativar-fhonix.js:', e);
    envia(false);
  }
};
