/* ================================================
   ROUTES/PAQUETES.JS — MySQL
   Catálogo de paquetes por plan (1 PLAY, 2 PLAY…, 3 PLAY…) que usa el
   formulario de venta. Lo editan Jefatura y Usuarios desde la página
   Usuarios → Paquetes. Las ventas guardan el nombre del paquete como texto,
   así que editar el catálogo no altera ventas ya registradas.
   ================================================ */
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const auth    = require('../middleware/auth');

const ROLES_EDICION = ['jefatura', 'usuarios'];

// Lista inicial: la misma que estaba fija en el frontend (PAQUETES_POR_PLAN).
// Los planes son fijos; lo editable son los paquetes de cada plan.
const SEMILLA = {
  '1 PLAY': ['150 MBPS S/70.00','300 MBPS S/75.00','800 MBPS S/100.00','1500 MBPS S/200.00','PROM ENTRADA 200 X 12 M 400 MBPS X 6M 39.5','PROM GRANDE 1000 MBPS X 6M 59.9','PROM GRANDE 850 X 12M 1000 MBPS X 4M 55','PROM LIM/ARQ 400 X 12 M 1000 MBPS X 2 M 1 SOL','PROM MEDIANA 400 X 12M 1000 MBPS X 6M 55','REG PRO 1000 MBPS','REG PRO 500 MBPS'],
  '2 PLAY INTERNET + TELEFONO': ['150 MBPS S/70.00','1000 MBPS S/150.00','1500 MBPS S/205.00','300 MBPS S/80.00','300 MPBS 84.00','400 MBPS 94.00 S','400 MBPS S/90.00','800 MBPS S/105.00'],
  '2 PLAY INTERNET + CABLE ESTANDAR': ['1000 MBPS S/230.00','150 MBPS S/150.00','1500 MBPS S/285.00','300 MBPS S/160.00','400 MBPS S/170.00','800 MBPS S/185.00'],
  '2 PLAY INTERNET + CABLE SUPERIOR': ['1000 MBPS S/270.00','150 MBPS S/190.00','1500 MBPS S/325.00','300 MBPS S/200.00','400 MBPS S/210.00','800 MBPS S/225.00'],
  '3 PLAY ESTANDAR': ['1000 MBPS S/235.00','150 MBPS S/155.00','1500 MBPS S/290.00','300 MBPS S/165.00','400 MBPS S/175.00','800 MBPS S/190.00'],
  '3 PLAY SUPERIOR': ['1000 MBPS S/275.00','150 MBPS S/195.00','1500 MBPS S/330.00','300 MBPS S/205.00','400 MBPS S/215.00','800 MBPS S/230.00'],
};
const PLANES = Object.keys(SEMILLA);

let promesaTabla;
function asegurarTabla() {
  if (!promesaTabla) {
    promesaTabla = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS paquetes_catalogo (
          id INT AUTO_INCREMENT PRIMARY KEY,
          plan VARCHAR(60) NOT NULL,
          nombre VARCHAR(150) NOT NULL,
          orden INT NOT NULL DEFAULT 0,
          activo TINYINT(1) NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_paquete_plan_nombre (plan, nombre),
          INDEX idx_paquetes_plan_orden (plan, orden)
        )
      `);
      const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM paquetes_catalogo');
      if (Number(total) === 0) {
        for (const plan of PLANES) {
          let orden = 0;
          for (const nombre of SEMILLA[plan]) {
            await db.query(
              'INSERT IGNORE INTO paquetes_catalogo (plan, nombre, orden) VALUES (?, ?, ?)',
              [plan, nombre, orden++]
            );
          }
        }
      }
    })().catch(error => { promesaTabla = null; throw error; });
  }
  return promesaTabla;
}

// Se prepara al arrancar la API (crea la tabla y la llena la primera vez)
asegurarTabla().catch(e => console.error('[paquetes] no se pudo preparar la tabla:', e.message || e));

function limpiarNombre(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ').substring(0, 150);
}

async function listar() {
  const [data] = await db.query(
    'SELECT id, plan, nombre, orden, activo FROM paquetes_catalogo ORDER BY plan, orden, id'
  );
  return data.map(p => ({ ...p, activo: Boolean(p.activo) }));
}

// GET /api/paquetes — cualquier usuario con sesión (lo usa el formulario de venta)
router.get('/', auth([]), async (req, res) => {
  try {
    await asegurarTabla();
    res.json({ ok: true, data: await listar() });
  } catch (e) {
    console.error('[GET /paquetes]', e.message || e);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener los paquetes' });
  }
});

// POST /api/paquetes — { plan, nombre }
router.post('/', auth(ROLES_EDICION), async (req, res) => {
  try {
    await asegurarTabla();
    const plan = String(req.body?.plan || '').trim().toUpperCase();
    const nombre = limpiarNombre(req.body?.nombre);
    if (!PLANES.includes(plan)) return res.status(400).json({ ok: false, mensaje: 'Plan inválido' });
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'Escribe el nombre del paquete' });
    const [[{ maximo }]] = await db.query(
      'SELECT COALESCE(MAX(orden), -1) AS maximo FROM paquetes_catalogo WHERE plan = ?', [plan]
    );
    await db.query(
      'INSERT INTO paquetes_catalogo (plan, nombre, orden) VALUES (?, ?, ?)',
      [plan, nombre, Number(maximo) + 1]
    );
    res.json({ ok: true, data: await listar() });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, mensaje: 'Ese paquete ya existe en ese plan' });
    console.error('[POST /paquetes]', e.message || e);
    res.status(500).json({ ok: false, mensaje: 'Error al crear el paquete' });
  }
});

// PATCH /api/paquetes/:id — { nombre?, activo? }
router.patch('/:id', auth(ROLES_EDICION), async (req, res) => {
  try {
    await asegurarTabla();
    const campos = [];
    const valores = [];
    if (req.body?.nombre !== undefined) {
      const nombre = limpiarNombre(req.body.nombre);
      if (!nombre) return res.status(400).json({ ok: false, mensaje: 'Escribe el nombre del paquete' });
      campos.push('nombre = ?'); valores.push(nombre);
    }
    if (req.body?.activo !== undefined) { campos.push('activo = ?'); valores.push(req.body.activo ? 1 : 0); }
    if (!campos.length) return res.status(400).json({ ok: false, mensaje: 'Nada que actualizar' });
    valores.push(req.params.id);
    const [r] = await db.query(`UPDATE paquetes_catalogo SET ${campos.join(', ')} WHERE id = ?`, valores);
    if (!r.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Paquete no encontrado' });
    res.json({ ok: true, data: await listar() });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, mensaje: 'Ese paquete ya existe en ese plan' });
    console.error('[PATCH /paquetes]', e.message || e);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar el paquete' });
  }
});

// POST /api/paquetes/:id/mover — { direccion: 'arriba' | 'abajo' } dentro de su plan
router.post('/:id/mover', auth(ROLES_EDICION), async (req, res) => {
  let conn;
  try {
    await asegurarTabla();
    const direccion = req.body?.direccion === 'arriba' ? 'arriba' : 'abajo';
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[actual]] = await conn.query('SELECT id, plan FROM paquetes_catalogo WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!actual) { await conn.rollback(); return res.status(404).json({ ok: false, mensaje: 'Paquete no encontrado' }); }
    const [lista] = await conn.query(
      'SELECT id FROM paquetes_catalogo WHERE plan = ? ORDER BY orden, id FOR UPDATE', [actual.plan]
    );
    const ids = lista.map(p => p.id);
    const i = ids.indexOf(actual.id);
    const j = direccion === 'arriba' ? i - 1 : i + 1;
    if (j >= 0 && j < ids.length) {
      [ids[i], ids[j]] = [ids[j], ids[i]];
      // Se renumera todo el plan para que el orden quede consecutivo
      for (let k = 0; k < ids.length; k++) {
        await conn.query('UPDATE paquetes_catalogo SET orden = ? WHERE id = ?', [k, ids[k]]);
      }
    }
    await conn.commit();
    res.json({ ok: true, data: await listar() });
  } catch (e) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('[POST /paquetes/mover]', e.message || e);
    res.status(500).json({ ok: false, mensaje: 'Error al reordenar' });
  } finally {
    conn?.release();
  }
});

// DELETE /api/paquetes/:id
router.delete('/:id', auth(ROLES_EDICION), async (req, res) => {
  try {
    await asegurarTabla();
    const [r] = await db.query('DELETE FROM paquetes_catalogo WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Paquete no encontrado' });
    res.json({ ok: true, data: await listar() });
  } catch (e) {
    console.error('[DELETE /paquetes]', e.message || e);
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar el paquete' });
  }
});

module.exports = router;
