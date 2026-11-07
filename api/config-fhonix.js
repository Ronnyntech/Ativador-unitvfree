// api/config-fhonix.js
// Entrega o conteudo que vira o .config pro app FhonixStream (com.ativacao.app).
// Chamado via GET: /config-fhonix?codigo=XXX
// IMPORTANTE: a resposta tem que ser TEXTO PURO em base64 (nao JSON!) -- o app le
// o corpo direto com Base64InputStream.

const DEFAULT_CONFIG_BASE64 =
  process.env.DEFAULT_CONFIG_BASE64 ||
  'SVNMLUFUSVZBRE9SLURFRkFVTFQtQ09ORklHLTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAw';

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send(DEFAULT_CONFIG_BASE64);
};
