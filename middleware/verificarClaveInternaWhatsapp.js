const crypto = require('crypto');

// Clave compartida con el servicio de WhatsApp (whatsapp-service), que la
// envia como KRONO_INTERNAL_KEY. Comparacion resistente a timing.
function coincideSeguro(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = function verificarClaveInternaWhatsapp(req, res, next) {
  const clave = req.headers['x-internal-key'];
  if (!clave || !process.env.INTERNAL_WHATSAPP_KEY || !coincideSeguro(clave, process.env.INTERNAL_WHATSAPP_KEY)) {
    return res.status(401).json({ ok: false, mensaje: 'Clave interna invalida o ausente' });
  }
  next();
};
