const rateLimit = require('express-rate-limit');

function loginKey(usuario) {
  return `usuario:${String(usuario || '').trim().toLowerCase()}`;
}

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  // La empresa comparte una misma IP publica. El bloqueo pertenece a la
  // cuenta que acumula fallos, no a toda la oficina.
  keyGenerator: req => loginKey(req.body?.usuario),
  skipSuccessfulRequests: true,
  message: { ok: false, mensaje: 'Usuario bloqueado temporalmente por varios intentos fallidos. Intenta nuevamente en 5 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Ingreso del formulario público de ventas (vexa.net.pe): su propio conteo
// de intentos fallidos por usuario (de FUTURA o de Grupo Futura).
const formularioKey = usuario => `venta:${String(usuario || '').trim().toLowerCase()}`;
const formularioLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, max: 5, keyGenerator: req => formularioKey(req.body?.usuario),
  skipSuccessfulRequests: true, validate: false,
  message: { ok: false, mensaje: 'Usuario bloqueado por varios intentos fallidos. Intenta de nuevo en 5 minutos.' },
  standardHeaders: true, legacyHeaders: false,
});

// Desbloquea al usuario en el login del sistema y en el formulario de ventas
const desbloquearFormulario = usuario => formularioLimiter.resetKey(formularioKey(usuario));
function desbloquearLogin(usuario) {
  loginLimiter.resetKey(loginKey(usuario));
  desbloquearFormulario(usuario);
}

module.exports = { loginLimiter, formularioLimiter, desbloquearLogin, desbloquearFormulario };
