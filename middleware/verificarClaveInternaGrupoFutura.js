const crypto = require('crypto');

// Clave compartida con la API de Grupo Futura: con ella Grupo Futura envía a
// FUTURA las ventas con operador CLARO. Cabecera X-Internal-Key.
function coincideSeguro(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = function verificarClaveInternaGrupoFutura(req, res, next) {
  const clave = req.headers['x-internal-key'];
  if (!clave || !process.env.INTERNAL_GRUPOFUTURA_KEY || !coincideSeguro(clave, process.env.INTERNAL_GRUPOFUTURA_KEY)) {
    return res.status(401).json({ ok: false, mensaje: 'Clave interna invalida o ausente' });
  }
  next();
};
