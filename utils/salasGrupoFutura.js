const db = require('../database');

// Sala de las ventas CLARO de vendedores de Grupo Futura.
// Esos vendedores no tienen sala en FUTURA (sin usuario, o con un usuario que
// se generó desde Grupo Futura sin sala), así que sus ventas salían con
// Sala "—". Grupo Futura informa el equipo de campo de cada vendedor
// ("SUP. CAMPO RUBEN DARIO" o "CAMPO") en /api/interno/vendedores-claro, y
// aquí se guarda como sala_atribucion de sus ventas que aún no tienen sala.
// Nunca pisa una sala ya puesta.
const GF_API_URL = (process.env.GRUPOFUTURA_API_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const CADA_MS = 5 * 60 * 1000;

const normNombre = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().split(/\s+/).filter(Boolean).join(' ');

async function vendedoresGrupoFutura() {
  const clave = process.env.INTERNAL_GRUPOFUTURA_KEY;
  if (!clave) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${GF_API_URL}/api/interno/vendedores-claro`, {
      headers: { 'X-Internal-Key': clave }, signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.ok && Array.isArray(data.vendedores) ? data.vendedores : null;
  } finally {
    clearTimeout(t);
  }
}

let enCurso = false;
async function completarSalasGrupoFutura() {
  if (enCurso) return;
  enCurso = true;
  try {
    const vendedores = await vendedoresGrupoFutura();
    // Grupo Futura todavía sin el campo "equipo": no hay nada que completar
    if (!vendedores || !vendedores.some(x => x.equipo)) return;
    const porUsuario = new Map();
    const porNombre = new Map();
    for (const x of vendedores) {
      if (!x.equipo) continue;
      const equipo = String(x.equipo).trim().toUpperCase().substring(0, 50);
      if (x.usuario) porUsuario.set(String(x.usuario).trim().toLowerCase(), equipo);
      if (x.nombre) porNombre.set(normNombre(x.nombre), equipo);
    }
    const [ventas] = await db.query(`
      SELECT v.id, v.asesor_id, v.asesor_nombre, u.usuario
        FROM ventas v
        LEFT JOIN usuarios u ON u.id = v.asesor_id
       WHERE COALESCE(v.sala_atribucion, '') = ''
         AND COALESCE(u.sala, '') = ''
         AND (v.asesor_id IS NULL OR u.id IS NOT NULL)`);
    const grupos = new Map();
    for (const v of ventas) {
      const equipo = (v.usuario && porUsuario.get(String(v.usuario).toLowerCase()))
        || (!v.asesor_id && porNombre.get(normNombre(v.asesor_nombre)));
      if (!equipo) continue;
      if (!grupos.has(equipo)) grupos.set(equipo, []);
      grupos.get(equipo).push(v.id);
    }
    let total = 0;
    for (const [equipo, ids] of grupos) {
      const [r] = await db.query(
        `UPDATE ventas SET sala_atribucion = ? WHERE id IN (?) AND COALESCE(sala_atribucion, '') = ''`,
        [equipo, ids]
      );
      total += r.affectedRows || 0;
    }
    if (total) console.log(`[salasGrupoFutura] ${total} venta(s) con su equipo de campo de Grupo Futura`);
  } catch (e) {
    console.warn('[salasGrupoFutura] no se pudo completar:', e.message);
  } finally {
    enCurso = false;
  }
}

function iniciarSalasGrupoFutura() {
  setTimeout(completarSalasGrupoFutura, 15000);
  setInterval(completarSalasGrupoFutura, CADA_MS).unref?.();
}

module.exports = { completarSalasGrupoFutura, iniciarSalasGrupoFutura };
