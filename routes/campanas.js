/* ================================================
   ROUTES/CAMPANAS.JS — MySQL
   Catálogo de campañas que usan Back Data (leads) y Back Data Reclutamiento.
   Lo editan Jefatura y Usuarios desde Usuarios → Campañas. Los registros
   guardan el nombre de la campaña como texto: editar el catálogo no cambia
   leads ya cargados (los filtros siguen mostrando las campañas antiguas).
   ================================================ */
const express = require('express');
const router  = express.Router();
const db      = require('../database');
const auth    = require('../middleware/auth');

const ROLES_EDICION = ['jefatura', 'usuarios'];
const TIPOS = ['backdata', 'reclutamiento'];

// Lista inicial: la misma que estaba fija en el frontend
const SEMILLA = {
  backdata: [
    { nombre: 'A - SCW' },
    { nombre: 'ADRI' },
    { nombre: 'KEV' },
    { nombre: 'EMER' },
    { nombre: 'E1' },
    { nombre: 'E2' },
    { nombre: 'E3' },
    { nombre: 'E4' },
    { nombre: 'E5' },
    { nombre: 'F2' },
    { nombre: 'F3' },
    { nombre: 'FABIAN' },
    { nombre: 'GOOGLE' },
    { nombre: 'GUSTAVO' },
    { nombre: 'H1' },
    { nombre: 'H4' },
    { nombre: 'H5' },
    { nombre: 'H7' },
    { nombre: 'K1' },
    { nombre: 'K2' },
    { nombre: 'K3' },
    { nombre: 'K6' },
    { nombre: 'K8' },
    { nombre: 'K9' },
    { nombre: 'LEAD CRM' },
    { nombre: 'M1' },
    { nombre: 'M2' },
    { nombre: 'M3' },
    { nombre: 'M4' },
    { nombre: 'MACETA' },
    { nombre: 'MATEO' },
    { nombre: 'MESSENGER' },
    { nombre: 'NICOLE' },
    { nombre: 'NX03' },
    { nombre: 'NX04' },
    { nombre: 'NX7' },
    { nombre: 'RAHI' },
    { nombre: 'REFERIDO' },
    { nombre: 'REFUERZO' },
    { nombre: 'YOPI' },
    { nombre: 'YURI' },
  ],
  reclutamiento: [
    { nombre: 'R1',       fondo: '#7c3aed', texto: '#ffffff' },
    { nombre: 'R2',       fondo: '#ea580c', texto: '#ffffff' },
    { nombre: 'R3',       fondo: '#ffffff', texto: '#374151', borde: '#d1d5db' },
    { nombre: 'R4',       fondo: '#92400e', texto: '#ffffff' },
    { nombre: 'R5',       fondo: '#e5e7eb', texto: '#374151' },
    { nombre: 'R6',       fondo: '#ddd6fe', texto: '#5b21b6' },
    { nombre: 'CHANCAY',  fondo: '#0f766e', texto: '#ffffff' },
    { nombre: 'COMPU T',  fondo: '#1d4ed8', texto: '#ffffff' },
    { nombre: 'REFERIDO', fondo: '#be123c', texto: '#ffffff' },
  ],
};

let promesaTabla;
function asegurarTabla() {
  if (!promesaTabla) {
    promesaTabla = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS campanas_catalogo (
          id INT AUTO_INCREMENT PRIMARY KEY,
          tipo VARCHAR(20) NOT NULL,
          nombre VARCHAR(100) NOT NULL,
          orden INT NOT NULL DEFAULT 0,
          activo TINYINT(1) NOT NULL DEFAULT 1,
          color_fondo VARCHAR(20) NULL,
          color_texto VARCHAR(20) NULL,
          color_borde VARCHAR(20) NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_campana_tipo_nombre (tipo, nombre),
          INDEX idx_campanas_tipo_orden (tipo, orden)
        )
      `);
      const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM campanas_catalogo');
      if (Number(total) === 0) {
        for (const tipo of TIPOS) {
          let orden = 0;
          for (const c of SEMILLA[tipo]) {
            await db.query(
              `INSERT IGNORE INTO campanas_catalogo (tipo, nombre, orden, color_fondo, color_texto, color_borde)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [tipo, c.nombre, orden++, c.fondo || null, c.texto || null, c.borde || null]
            );
          }
        }
      }
    })().catch(error => { promesaTabla = null; throw error; });
  }
  return promesaTabla;
}

// Se prepara al arrancar la API (crea la tabla y la llena la primera vez)
asegurarTabla().catch(e => console.error('[campanas] no se pudo preparar la tabla:', e.message || e));

// Las campañas se guardan en MAYÚSCULAS, igual que las existentes
function limpiarNombre(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ').toUpperCase().substring(0, 100);
}
function limpiarColor(valor) {
  const c = String(valor || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : null;
}

async function listar() {
  const [data] = await db.query(
    `SELECT id, tipo, nombre, orden, activo, color_fondo, color_texto, color_borde
       FROM campanas_catalogo ORDER BY tipo, orden, id`
  );
  return data.map(c => ({ ...c, activo: Boolean(c.activo) }));
}

// GET /api/campanas — cualquier usuario con sesión (lo usan Back Data y Reclutamiento)
router.get('/', auth([]), async (req, res) => {
  try {
    await asegurarTabla();
    res.json({ ok: true, data: await listar() });
  } catch (e) {
    console.error('[GET /campanas]', e.message || e);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener las campañas' });
  }
});

// POST /api/campanas — { tipo, nombre, color_fondo?, color_texto? }
router.post('/', auth(ROLES_EDICION), async (req, res) => {
  try {
    await asegurarTabla();
    const tipo = String(req.body?.tipo || '').trim().toLowerCase();
    const nombre = limpiarNombre(req.body?.nombre);
    if (!TIPOS.includes(tipo)) return res.status(400).json({ ok: false, mensaje: 'Tipo de campaña inválido' });
    if (!nombre) return res.status(400).json({ ok: false, mensaje: 'Escribe el nombre de la campaña' });
    const [[{ maximo }]] = await db.query(
      'SELECT COALESCE(MAX(orden), -1) AS maximo FROM campanas_catalogo WHERE tipo = ?', [tipo]
    );
    await db.query(
      'INSERT INTO campanas_catalogo (tipo, nombre, orden, color_fondo, color_texto) VALUES (?, ?, ?, ?, ?)',
      [tipo, nombre, Number(maximo) + 1, limpiarColor(req.body?.color_fondo), limpiarColor(req.body?.color_texto)]
    );
    res.json({ ok: true, data: await listar() });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, mensaje: 'Esa campaña ya existe' });
    console.error('[POST /campanas]', e.message || e);
    res.status(500).json({ ok: false, mensaje: 'Error al crear la campaña' });
  }
});

// PATCH /api/campanas/:id — { nombre?, activo?, color_fondo?, color_texto? }
router.patch('/:id', auth(ROLES_EDICION), async (req, res) => {
  try {
    await asegurarTabla();
    const campos = [];
    const valores = [];
    if (req.body?.nombre !== undefined) {
      const nombre = limpiarNombre(req.body.nombre);
      if (!nombre) return res.status(400).json({ ok: false, mensaje: 'Escribe el nombre de la campaña' });
      campos.push('nombre = ?'); valores.push(nombre);
    }
    if (req.body?.activo !== undefined) { campos.push('activo = ?'); valores.push(req.body.activo ? 1 : 0); }
    if (req.body?.color_fondo !== undefined) {
      campos.push('color_fondo = ?', 'color_borde = NULL'); valores.push(limpiarColor(req.body.color_fondo));
    }
    if (req.body?.color_texto !== undefined) { campos.push('color_texto = ?'); valores.push(limpiarColor(req.body.color_texto)); }
    if (!campos.length) return res.status(400).json({ ok: false, mensaje: 'Nada que actualizar' });
    valores.push(req.params.id);
    const [r] = await db.query(`UPDATE campanas_catalogo SET ${campos.join(', ')} WHERE id = ?`, valores);
    if (!r.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Campaña no encontrada' });
    res.json({ ok: true, data: await listar() });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, mensaje: 'Esa campaña ya existe' });
    console.error('[PATCH /campanas]', e.message || e);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar la campaña' });
  }
});

// POST /api/campanas/:id/mover — { direccion: 'arriba' | 'abajo' } dentro de su tipo
router.post('/:id/mover', auth(ROLES_EDICION), async (req, res) => {
  let conn;
  try {
    await asegurarTabla();
    const direccion = req.body?.direccion === 'arriba' ? 'arriba' : 'abajo';
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[actual]] = await conn.query('SELECT id, tipo FROM campanas_catalogo WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!actual) { await conn.rollback(); return res.status(404).json({ ok: false, mensaje: 'Campaña no encontrada' }); }
    const [lista] = await conn.query(
      'SELECT id FROM campanas_catalogo WHERE tipo = ? ORDER BY orden, id FOR UPDATE', [actual.tipo]
    );
    const ids = lista.map(c => c.id);
    const i = ids.indexOf(actual.id);
    const j = direccion === 'arriba' ? i - 1 : i + 1;
    if (j >= 0 && j < ids.length) {
      [ids[i], ids[j]] = [ids[j], ids[i]];
      for (let k = 0; k < ids.length; k++) {
        await conn.query('UPDATE campanas_catalogo SET orden = ? WHERE id = ?', [k, ids[k]]);
      }
    }
    await conn.commit();
    res.json({ ok: true, data: await listar() });
  } catch (e) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('[POST /campanas/mover]', e.message || e);
    res.status(500).json({ ok: false, mensaje: 'Error al reordenar' });
  } finally {
    conn?.release();
  }
});

// DELETE /api/campanas/:id
router.delete('/:id', auth(ROLES_EDICION), async (req, res) => {
  try {
    await asegurarTabla();
    const [r] = await db.query('DELETE FROM campanas_catalogo WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ ok: false, mensaje: 'Campaña no encontrada' });
    res.json({ ok: true, data: await listar() });
  } catch (e) {
    console.error('[DELETE /campanas]', e.message || e);
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar la campaña' });
  }
});

module.exports = router;
