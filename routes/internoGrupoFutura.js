/* ================================================
   ROUTES/INTERNOGRUPOFUTURA.JS — /api/interno/gf/...
   Gestión desde Grupo Futura (VEXA) de las ventas CLARO que viven en FUTURA:
   el Supervisor de Grupo Futura ve, edita, reasigna y adjunta fotos como con
   sus ventas WIN. Grupo Futura valida los permisos del supervisor antes de
   llamar; aquí solo entra quien tiene la clave interna (X-Internal-Key).
   Cada cambio queda en venta_historial con el usuario de Grupo Futura.
   ================================================ */
const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const db      = require('../database');
const verificarClaveInternaGrupoFutura = require('../middleware/verificarClaveInternaGrupoFutura');

router.use(verificarClaveInternaGrupoFutura);

const fotosDir = path.join(__dirname, '..', 'uploads', 'fotos');
if (!fs.existsSync(fotosDir)) fs.mkdirSync(fotosDir, { recursive: true });
const subirFoto = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, fotosDir),
    filename: (req, file, cb) => cb(null, 'foto_' + req.params.id + '_' + Date.now() + path.extname(file.originalname).toLowerCase()),
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Solo imágenes o PDF'));
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

function idValido(v) { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; }

// Quién hizo el cambio en Grupo Futura (llega en la cabecera X-GF-Actor, JSON)
function actorDe(req) {
  let a = {};
  try { a = JSON.parse(Buffer.from(String(req.headers['x-gf-actor'] || ''), 'base64').toString('utf8') || '{}'); } catch { a = {}; }
  return {
    nombre: String(a.nombre || 'Grupo Futura').substring(0, 150),
    cargo: String(a.cargo || 'supervisor').substring(0, 50),
    sala: a.sala ? String(a.sala).substring(0, 50) : null,
  };
}

async function historial(conn, ventaId, actor, ev) {
  const v = x => (x === undefined || x === null ? null : String(x).substring(0, 1000));
  await conn.query(`
    INSERT INTO venta_historial (venta_id, tipo, modulo, campo, etiqueta, valor_anterior, valor_nuevo, descripcion,
                                 usuario_id, usuario_nombre, usuario_cargo, usuario_sala)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [ventaId, ev.tipo || 'ACTUALIZACION', 'Grupo Futura · Supervisor', ev.campo || null, ev.etiqueta || null,
     v(ev.valorAnterior), v(ev.valorNuevo), ev.descripcion || null, null, actor.nombre, actor.cargo, actor.sala]);
}

async function existeVenta(id) {
  const [r] = await db.query('SELECT * FROM ventas WHERE id = ? LIMIT 1', [id]);
  return r[0] || null;
}

// ── Fotos ───────────────────────────────────────────
router.get('/venta/:id/fotos', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ ok: false, mensaje: 'Venta no válida' });
  try {
    const [fotos] = await db.query('SELECT id, nombre, mimetype, created_at FROM venta_fotos WHERE venta_id = ? ORDER BY created_at ASC', [id]);
    res.json({ ok: true, data: fotos });
  } catch (e) {
    console.error('[interno/gf fotos]', e.message);
    res.status(500).json({ ok: false, mensaje: 'Error al obtener fotos' });
  }
});

router.get('/venta/:id/fotos/:fotoId/archivo', async (req, res) => {
  const id = idValido(req.params.id), fotoId = idValido(req.params.fotoId);
  if (!id || !fotoId) return res.status(400).json({ ok: false, mensaje: 'Foto no válida' });
  try {
    const [r] = await db.query('SELECT ruta, mimetype FROM venta_fotos WHERE id = ? AND venta_id = ? LIMIT 1', [fotoId, id]);
    if (!r.length) return res.status(404).json({ ok: false, mensaje: 'Foto no encontrada' });
    const raiz = path.resolve(path.join(__dirname, '..'));
    const archivo = path.resolve(path.join(raiz, r[0].ruta));
    if (!archivo.startsWith(path.join(raiz, 'uploads') + path.sep) || !fs.existsSync(archivo))
      return res.status(404).json({ ok: false, mensaje: 'El archivo no existe en el servidor' });
    if (r[0].mimetype) res.type(r[0].mimetype);
    res.sendFile(archivo);
  } catch (e) {
    console.error('[interno/gf archivo]', e.message);
    res.status(500).json({ ok: false, mensaje: 'Error al leer el archivo' });
  }
});

router.post('/venta/:id/fotos', (req, res, next) => {
  if (!idValido(req.params.id)) return res.status(400).json({ ok: false, mensaje: 'Venta no válida' });
  subirFoto.single('foto')(req, res, err => err ? res.status(400).json({ ok: false, mensaje: err.message }) : next());
}, async (req, res) => {
  const id = idValido(req.params.id);
  try {
    if (!req.file) return res.status(400).json({ ok: false, mensaje: 'No se recibió archivo' });
    if (!(await existeVenta(id))) { fs.unlinkSync(req.file.path); return res.status(404).json({ ok: false, mensaje: 'Venta no encontrada' }); }
    const ruta = 'uploads/fotos/' + req.file.filename;
    const nombre = path.basename(req.file.originalname);
    await db.query('INSERT INTO venta_fotos (venta_id, nombre, ruta, mimetype) VALUES (?,?,?,?)', [id, nombre, ruta, req.file.mimetype]);
    await historial(db, id, actorDe(req), { tipo: 'ARCHIVO', campo: 'foto', etiqueta: 'Foto o documento', valorNuevo: nombre, descripcion: 'Se agregó un archivo desde Grupo Futura.' });
    res.json({ ok: true, nombre });
  } catch (e) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    console.error('[interno/gf subir foto]', e.message);
    res.status(500).json({ ok: false, mensaje: 'Error al guardar la foto' });
  }
});

router.delete('/venta/:id/fotos/:fotoId', async (req, res) => {
  const id = idValido(req.params.id), fotoId = idValido(req.params.fotoId);
  if (!id || !fotoId) return res.status(400).json({ ok: false, mensaje: 'Foto no válida' });
  try {
    const [r] = await db.query('SELECT * FROM venta_fotos WHERE id = ? AND venta_id = ? LIMIT 1', [fotoId, id]);
    if (!r.length) return res.status(404).json({ ok: false, mensaje: 'Foto no encontrada' });
    try { const f = path.join(__dirname, '..', r[0].ruta); if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    await db.query('DELETE FROM venta_fotos WHERE id = ?', [fotoId]);
    await historial(db, id, actorDe(req), { tipo: 'ARCHIVO', campo: 'foto', etiqueta: 'Foto o documento', valorAnterior: r[0].nombre, valorNuevo: 'Eliminado', descripcion: 'Se eliminó un archivo desde Grupo Futura.' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[interno/gf eliminar foto]', e.message);
    res.status(500).json({ ok: false, mensaje: 'Error al eliminar la foto' });
  }
});

// ── Editar datos ────────────────────────────────────
// Body: { campos: { columna: valor } } con columnas de la tabla ventas de FUTURA
const EDITABLES = {
  nombre: ['Nombre', 150], tipo_doc: ['Tipo de documento', 20], dni: ['Documento', 20], email: ['Correo', 150],
  telefono1: ['Teléfono 1', 20], telefono2: ['Teléfono 2', 20], departamento: ['Departamento', 100],
  provincia: ['Provincia', 100], distrito: ['Distrito', 100], direccion: ['Dirección', 1000],
  coordenadas: ['Coordenadas', 255], paquete: ['Paquete', 255], cuota_inst: ['Cuota de instalación', 100],
  claro_hogar: ['Región', 150], predio: ['Predio', 20], tecnologia: ['Tecnología', 100], full_claro: ['Full Claro', 20],
  plano: ['Plano', 255], fecha_nac: ['Fecha de nacimiento', 10], lugar_nac: ['Lugar de nacimiento', 150],
  padre: ['Padre', 150], madre: ['Madre', 150], cant_decos: ['Decos', 3], cant_mesh: ['Mesh', 3],
  observacion: ['Observación', 1000],
};
router.patch('/venta/:id/datos', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ ok: false, mensaje: 'Venta no válida' });
  const campos = req.body?.campos || {};
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('SELECT * FROM ventas WHERE id = ? FOR UPDATE', [id]);
    if (!r.length) { await conn.rollback(); return res.status(404).json({ ok: false, mensaje: 'Venta no encontrada' }); }
    const venta = r[0];
    const sets = [], vals = [], cambios = [];
    for (const [col, valor] of Object.entries(campos)) {
      const def = EDITABLES[col];
      if (!def || valor === undefined) continue;
      let nuevo = valor === '' || valor === null ? null : String(valor).trim();
      if (nuevo && nuevo.length > def[1]) { await conn.rollback(); return res.status(400).json({ ok: false, mensaje: `${def[0]}: máximo ${def[1]} caracteres` }); }
      if (col === 'cant_decos' || col === 'cant_mesh') nuevo = parseInt(nuevo, 10) || 0;
      if (col === 'predio' && nuevo && !['HORIZONTAL', 'VERTICAL'].includes(nuevo.toUpperCase())) continue;
      const anterior = venta[col] == null ? null : String(venta[col]);
      if ((anterior ?? '') === (nuevo == null ? '' : String(nuevo))) continue;
      sets.push(`${col} = ?`); vals.push(nuevo);
      cambios.push({ campo: col, etiqueta: def[0], valorAnterior: anterior, valorNuevo: nuevo });
    }
    if (!sets.length) { await conn.rollback(); return res.json({ ok: true, mensaje: 'Sin cambios', cambios: 0 }); }
    await conn.query(`UPDATE ventas SET ${sets.join(', ')} WHERE id = ?`, [...vals, id]);
    const actor = actorDe(req);
    for (const c of cambios) await historial(conn, id, actor, c);
    await conn.commit();
    res.json({ ok: true, mensaje: 'Datos de la venta actualizados en FUTURA', cambios: cambios.length });
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error('[interno/gf datos]', e.message);
    res.status(500).json({ ok: false, mensaje: 'Error al actualizar la venta' });
  } finally {
    conn.release();
  }
});

// ── Reasignar ───────────────────────────────────────
// Body: { usuario, nombre, equipo } del vendedor de Grupo Futura. Si en FUTURA
// existe un usuario con el mismo `usuario`, queda como asesor_id; si no, la
// venta queda a su nombre (igual que al registrarla desde Grupo Futura).
router.patch('/venta/:id/asesor', async (req, res) => {
  const id = idValido(req.params.id);
  const usuario = String(req.body?.usuario || '').trim().toLowerCase().substring(0, 100);
  const nombre = String(req.body?.nombre || '').trim().replace(/\s+/g, ' ').substring(0, 150);
  const equipo = String(req.body?.equipo || '').trim().toUpperCase().substring(0, 50) || null;
  if (!id || !nombre) return res.status(400).json({ ok: false, mensaje: 'Venta o vendedor no válido' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('SELECT id, asesor_id, asesor_nombre, sala_atribucion FROM ventas WHERE id = ? FOR UPDATE', [id]);
    if (!r.length) { await conn.rollback(); return res.status(404).json({ ok: false, mensaje: 'Venta no encontrada' }); }
    const [us] = usuario ? await conn.query('SELECT id, nombre, sala FROM usuarios WHERE usuario = ? LIMIT 1', [usuario]) : [[]];
    const dueno = us[0] || null;
    const nuevoNombre = dueno?.nombre || nombre;
    await conn.query('UPDATE ventas SET asesor_id = ?, asesor_nombre = ?, sala_atribucion = ? WHERE id = ?',
      [dueno?.id || null, nuevoNombre, dueno?.sala || equipo, id]);
    await historial(conn, id, actorDe(req), {
      tipo: 'REASIGNACION', campo: 'asesor_nombre', etiqueta: 'Vendedor',
      valorAnterior: r[0].asesor_nombre, valorNuevo: nuevoNombre, descripcion: 'Reasignada desde Grupo Futura.',
    });
    await conn.commit();
    res.json({ ok: true, mensaje: `Venta reasignada de ${r[0].asesor_nombre || 'Sin asignar'} a ${nuevoNombre}.` });
  } catch (e) {
    await conn.rollback().catch(() => {});
    console.error('[interno/gf asesor]', e.message);
    res.status(500).json({ ok: false, mensaje: 'Error al reasignar la venta' });
  } finally {
    conn.release();
  }
});

module.exports = router;
