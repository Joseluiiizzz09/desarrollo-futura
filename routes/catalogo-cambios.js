/* ================================================
   Historial de cambios de los catálogos (Paquetes y Campañas):
   quién agregó, editó, activó/desactivó, movió o eliminó cada elemento.
   No es un router: lo usan routes/paquetes.js y routes/campanas.js.
   ================================================ */
const db = require('../database');

let promesaTabla;
function asegurarTablaCambios() {
  if (!promesaTabla) {
    promesaTabla = db.query(`
      CREATE TABLE IF NOT EXISTS catalogo_cambios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        catalogo VARCHAR(20) NOT NULL,
        accion VARCHAR(20) NOT NULL,
        grupo VARCHAR(60) NULL,
        detalle VARCHAR(500) NOT NULL,
        usuario_id INT NULL,
        usuario_nombre VARCHAR(150) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_catalogo_cambios (catalogo, id)
      )
    `).catch(e => { promesaTabla = null; throw e; });
  }
  return promesaTabla;
}
asegurarTablaCambios().catch(e => console.error('[catalogo_cambios] no se pudo preparar la tabla:', e.message || e));

// En Acceso Directo de Jefatura, el autor real es el jefe (req.actor)
async function registrarCambio(req, catalogo, accion, grupo, detalle) {
  try {
    await asegurarTablaCambios();
    const autor = req.actor || req.user || {};
    let nombre = autor.nombre || null;
    if (!nombre && autor.id) {
      const [u] = await db.query('SELECT nombre FROM usuarios WHERE id = ? LIMIT 1', [autor.id]);
      nombre = u[0]?.nombre || autor.usuario || null;
    }
    await db.query(
      'INSERT INTO catalogo_cambios (catalogo, accion, grupo, detalle, usuario_id, usuario_nombre) VALUES (?, ?, ?, ?, ?, ?)',
      [catalogo, accion, grupo || null, String(detalle).substring(0, 500), autor.id || null, nombre]
    );
  } catch (e) {
    // El historial nunca debe impedir el cambio en sí
    console.error('[catalogo_cambios] no se pudo registrar:', e.message || e);
  }
}

async function listarCambios(catalogo, limite = 300) {
  await asegurarTablaCambios();
  const [data] = await db.query(
    `SELECT id, accion, grupo, detalle, usuario_nombre, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS fecha
       FROM catalogo_cambios WHERE catalogo = ? ORDER BY id DESC LIMIT ?`,
    [catalogo, limite]
  );
  return data;
}

module.exports = { registrarCambio, listarCambios };
