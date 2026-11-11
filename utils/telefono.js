/* ================================================
   UTILS/TELEFONO.JS
   ¿El teléfono de referencia parece un número real de Perú?
   Misma regla que futura-frontend/src/utils/telefono.js (mantener iguales).
   ================================================ */

// Códigos de provincia de los fijos (Lima es 01).
const CODIGOS_PROVINCIA = ['41','42','43','44','51','52','53','54','56','61','62','63','64','65','66','67','72','73','74','76','82','83','84'];

// Devuelve el mensaje de error, o null si está vacío (es opcional) o es válido.
function errorTelefonoReferencia(valor) {
  const t = String(valor ?? '').trim();
  if (!t) return null;
  if (!/^\d{9}$/.test(t)) return 'El teléfono de referencia debe tener 9 dígitos, solo números.';
  const esCelular = t[0] === '9';
  const esFijo = t.startsWith('01') || (t[0] === '0' && CODIGOS_PROVINCIA.includes(t.slice(1, 3)));
  if (!esCelular && !esFijo)
    return 'El teléfono de referencia no es un número real: un celular empieza con 9 y un fijo con su código (01, 044...).';
  const resto = t.slice(1);
  const difs = [...resto].slice(1).map((d, i) => Number(d) - Number(resto[i]));
  const esSecuencia = difs.every(d => d === 1) || difs.every(d => d === -1);
  if (/(\d)\1{5}/.test(t) || new Set(resto).size <= 2 || esSecuencia)
    return 'El teléfono de referencia no parece un número real (repetido o en secuencia). Déjalo vacío si no lo tienes.';
  return null;
}

module.exports = { errorTelefonoReferencia };
