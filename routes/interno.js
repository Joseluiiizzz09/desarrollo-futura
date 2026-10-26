const express = require('express');
const router  = express.Router();
const db      = require('../database');
const verificarClaveInternaPrizma = require('../middleware/verificarClaveInternaPrizma');
const verificarClaveInternaGrupoFutura = require('../middleware/verificarClaveInternaGrupoFutura');
const verificarClaveInternaWhatsapp = require('../middleware/verificarClaveInternaWhatsapp');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const { validar, errorTexto, errorEmail, errorDni, errorFecha, errorEnteroPositivo, errorEnum, TIPO_DOC_OK } = require('../middleware/validar');

function fechaPeruHoy() {
  const ahora = new Date();
  const peru  = new Date(ahora.getTime() + ahora.getTimezoneOffset()*60000 + (-5*60*60000));
  return peru.getFullYear()+'-'+String(peru.getMonth()+1).padStart(2,'0')+'-'+String(peru.getDate()).padStart(2,'0');
}
function horaPeruAhora() {
  const ahora = new Date();
  const peru  = new Date(ahora.getTime() + ahora.getTimezoneOffset()*60000 + (-5*60*60000));
  return String(peru.getHours()).padStart(2,'0')+':'+String(peru.getMinutes()).padStart(2,'0');
}
function normalizarN1(valor) {
  return String(valor || '').replace(/\D+/g, '');
}

// POST /api/interno/lead-prizma
// Crea un lead nuevo (sin tipificar, sin asignar) a partir de un numero
// sincronizado automaticamente desde Prizma. Protegido por X-Internal-Key.
// Body: { n1, campana }
router.post('/lead-prizma', verificarClaveInternaPrizma, async (req, res) => {
  try {
    const n1 = normalizarN1(req.body?.n1);
    if (!n1) return res.status(400).json({ ok: false, mensaje: 'Falta el numero (n1)' });

    const campana  = String(req.body?.campana || 'YOPI').trim() || 'YOPI';
    const fechaHoy = fechaPeruHoy();

    const [existentes] = await db.query(`
      SELECT id FROM leads
      WHERE n1_normalizado = ?
        AND fecha = ? AND campana = ?
      LIMIT 1
    `, [n1, fechaHoy, campana]);
    if (existentes.length) {
      return res.json({ ok: true, ya_existia: true, id: existentes[0].id });
    }

    const historial = JSON.stringify([{
      tipo: 'CARGA', cargadoPor: 'Sistema Prizma', hora: horaPeruAhora(),
      fecha: fechaHoy, motivo: 'Sincronizacion automatica desde Prizma (SIN COBERTURA)',
    }]);

    const [result] = await db.query(`
      INSERT INTO leads (campana, n1, fecha, sin_asignar, historial, rotaciones, creado_por_nombre, creado_por_usuario)
      VALUES (?, ?, ?, 1, ?, 0, 'Sistema Prizma', 'sistema-prizma')
    `, [campana, n1, fechaHoy, historial]);

    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    console.error('[interno/lead-prizma] Error:', e);
    res.status(500).json({ ok: false, mensaje: 'Error al crear el lead' });
  }
});

// POST /api/interno/lead-whatsapp
// Lo llama el servicio de WhatsApp (whatsapp-service) cuando un cliente escribe
// en vivo: lo registra en la Base (sin tipificar, sin asignar) por numero y/o
// @usuario, con la campana de la linea por la que escribio.
// Protegido por X-Internal-Key. Body: { n1?, usuario_whatsapp?, campana }
router.post('/lead-whatsapp', verificarClaveInternaWhatsapp, async (req, res) => {
  try {
    let n1 = normalizarN1(req.body?.n1);
    // La Base guarda el celular peruano de 9 digitos: se quita el 51 del codigo de pais
    if (n1.length === 11 && n1.startsWith('51')) n1 = n1.slice(2);
    n1 = n1.substring(0, 20);
    const usuario = String(req.body?.usuario_whatsapp || '').trim().replace(/^@+/, '').substring(0, 100);
    if (!n1 && !usuario) {
      return res.status(400).json({ ok: false, mensaje: 'Falta el numero (n1) o el usuario de WhatsApp' });
    }
    const campana = String(req.body?.campana || '').trim().substring(0, 100);
    if (!campana) return res.status(400).json({ ok: false, mensaje: 'Falta la campana' });

    const fechaHoy = fechaPeruHoy();

    // Mismo criterio de duplicado que la Base: mismo dia y misma campana
    const [existentes] = n1
      ? await db.query(`
          SELECT id FROM leads
          WHERE n1_normalizado = ? AND fecha = ? AND campana = ?
          LIMIT 1
        `, [n1, fechaHoy, campana])
      : await db.query(`
          SELECT id FROM leads
          WHERE usuario_whatsapp = ? AND fecha = ? AND campana = ?
          LIMIT 1
        `, [usuario, fechaHoy, campana]);
    if (existentes.length) {
      return res.json({ ok: true, ya_existia: true, id: existentes[0].id });
    }

    const historial = JSON.stringify([{
      tipo: 'CARGA', cargadoPor: 'WhatsApp', hora: horaPeruAhora(),
      fecha: fechaHoy, motivo: 'Ingreso automatico desde WhatsApp',
      origenCarga: 'WhatsApp', origenUsuario: 'sistema-whatsapp',
    }]);

    const [result] = await db.query(`
      INSERT INTO leads (campana, n1, usuario_whatsapp, fecha, sin_asignar, historial, rotaciones,
                         creado_por_nombre, creado_por_usuario)
      VALUES (?, ?, ?, ?, 1, ?, 0, 'WhatsApp', 'sistema-whatsapp')
    `, [campana, n1, usuario, fechaHoy, historial]);

    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    console.error('[interno/lead-whatsapp] Error:', e);
    res.status(500).json({ ok: false, mensaje: 'Error al crear el lead' });
  }
});

// ==================== VENTAS CLARO DESDE GRUPO FUTURA ====================
// Grupo Futura (WIN) registra ventas con operador CLARO y las envía aquí: entran
// en estado VENTA (bandeja de Validación). Se asignan al usuario de FUTURA con
// el mismo `usuario` que quien la cargó; si no existe, se crea. Cada venta
// guarda origen_grupo_futura_id para no duplicarse si Grupo Futura reintenta.
let promesaColumnaOrigen;
function asegurarColumnaOrigen() {
  if (!promesaColumnaOrigen) {
    promesaColumnaOrigen = (async () => {
      await db.query(`ALTER TABLE ventas ADD COLUMN origen_grupo_futura_id INT NULL`)
        .catch(err => { if (err.code !== 'ER_DUP_FIELDNAME') throw err; });
      await db.query(`ALTER TABLE ventas ADD UNIQUE INDEX uq_ventas_origen_grupo_futura (origen_grupo_futura_id)`)
        .catch(err => { if (err.code !== 'ER_DUP_KEYNAME') throw err; });
    })().catch(error => { promesaColumnaOrigen = null; throw error; });
  }
  return promesaColumnaOrigen;
}
asegurarColumnaOrigen().catch(e => console.error('[interno/venta-grupo-futura] columna origen:', e.message || e));

function normalizarNombrePersonal(nombre) {
  return String(nombre || '').trim().replace(/\s+/g, ' ').toUpperCase();
}

// POST /api/interno/venta-grupo-futura
// Body: { origenId, asesor:{ usuario, nombre, cargo, genero }, venta:{ ...campos del formulario Claro } }
router.post('/venta-grupo-futura', verificarClaveInternaGrupoFutura, async (req, res) => {
  let conn;
  try {
    await asegurarColumnaOrigen();
    const origenId = Number(req.body?.origenId);
    const asesor = req.body?.asesor || {};
    const v = req.body?.venta || {};
    if (!Number.isInteger(origenId) || origenId <= 0) return res.status(400).json({ ok: false, mensaje: 'origenId inválido' });
    const usuario = String(asesor.usuario || '').trim().toLowerCase().substring(0, 100);
    const nombreAsesor = normalizarNombrePersonal(asesor.nombre).substring(0, 150);
    if (!usuario || !nombreAsesor) return res.status(400).json({ ok: false, mensaje: 'Falta el usuario o nombre de quien cargó la venta' });

    // Mismos campos obligatorios que el formulario de venta de FUTURA
    const errores = validar([
      errorTexto(v.nombre, 'nombre', { requerido: true, max: 150 }),
      errorTexto(v.dni, 'dni', { requerido: true }),
      errorDni(v.dni, v.tipoDoc || 'DNI'),
      errorTexto(v.email, 'email', { requerido: true, max: 150 }),
      errorEmail(v.email),
      errorEnum(v.tipoDoc, 'tipoDoc', TIPO_DOC_OK),
      errorTexto(v.telefono1, 'telefono1', { requerido: true, max: 20 }),
      errorTexto(v.telefono2, 'telefono2', { max: 20 }),
      errorTexto(v.departamento, 'departamento', { requerido: true, max: 100 }),
      errorTexto(v.provincia, 'provincia', { requerido: true, max: 100 }),
      errorTexto(v.distrito, 'distrito', { requerido: true, max: 100 }),
      errorTexto(v.direccion, 'direccion', { requerido: true, max: 1000 }),
      errorTexto(v.coordenadas, 'coordenadas', { requerido: true, max: 255 }),
      errorTexto(v.fechaNac, 'fechaNac', { max: 10 }),
      errorFecha(v.fechaNac, 'fechaNac'),
      errorTexto(v.lugarNac, 'lugarNac', { max: 150 }),
      errorTexto(v.padre, 'padre', { requerido: true, max: 150 }),
      errorTexto(v.madre, 'madre', { requerido: true, max: 150 }),
      errorTexto(v.cuotaInstalacion, 'cuotaInstalacion', { requerido: true, max: 100 }),
      errorTexto(v.hogar, 'hogar', { requerido: true, max: 150 }),
      errorEnum(v.predio, 'predio', ['HORIZONTAL', 'VERTICAL']),
      errorTexto(v.tec, 'tecnologia', { requerido: true, max: 100 }),
      errorTexto(v.paquete, 'paquete', { requerido: true, max: 255 }),
      errorTexto(v.full, 'fullClaro', { requerido: true, max: 20 }),
      errorTexto(v.plano, 'plano', { requerido: true, max: 100 }),
      errorTexto(v.obs, 'observacion', { max: 1000 }),
      errorEnteroPositivo(v.cantDecos, 'cantDecos', { max: 10 }),
      errorEnteroPositivo(v.cantMesh, 'cantMesh', { max: 10 }),
    ]);
    if (errores) return res.status(400).json({ ok: false, mensaje: errores[0], errores });

    conn = await db.getConnection();
    await conn.beginTransaction();

    // Ya se recibió antes (reintento de Grupo Futura): se devuelve la misma
    const [previas] = await conn.query('SELECT id, asesor_id FROM ventas WHERE origen_grupo_futura_id = ? LIMIT 1', [origenId]);
    if (previas.length) {
      await conn.commit();
      return res.json({ ok: true, id: previas[0].id, asesor_id: previas[0].asesor_id, ya_existia: true });
    }

    // Usuario de FUTURA con el mismo `usuario` (sin importar su cargo); si no existe, se crea
    const [usuarios] = await conn.query('SELECT id, nombre, sala FROM usuarios WHERE usuario = ? LIMIT 1 FOR UPDATE', [usuario]);
    let dueno = usuarios[0] || null;
    let usuarioCreado = false;
    if (!dueno) {
      const cargo = String(asesor.cargo || '').toLowerCase() === 'campo' ? 'campo' : 'asesor';
      const genero = String(asesor.genero || '').toUpperCase() === 'F' ? 'F' : 'M';
      // Contraseña aleatoria: Jefatura/Usuarios de FUTURA la cambian para darle acceso
      const hash = bcrypt.hashSync(crypto.randomBytes(18).toString('base64url'), 10);
      const [ins] = await conn.query(
        `INSERT INTO usuarios (nombre, usuario, password, cargo, sala, genero, activo, permisos) VALUES (?, ?, ?, ?, NULL, ?, 1, '[]')`,
        [nombreAsesor, usuario, hash, cargo, genero]
      );
      dueno = { id: ins.insertId, nombre: nombreAsesor, sala: null };
      usuarioCreado = true;
    }

    const [result] = await conn.query(`
      INSERT INTO ventas (
        asesor_id, asesor_nombre, tipo_doc, dni, nombre, email,
        telefono1, telefono2, departamento, provincia, distrito,
        direccion, coordenadas, fecha_nac, lugar_nac, padre, madre,
        cuota_inst, claro_hogar, predio, tecnologia, paquete,
        full_claro, cant_decos, cant_mesh, plano, estado, observacion,
        sala_atribucion, origen_grupo_futura_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      dueno.id, dueno.nombre || nombreAsesor, v.tipoDoc || 'DNI', v.dni || null, v.nombre || null, v.email || null,
      v.telefono1 || null, v.telefono2 || null, v.departamento || null,
      v.provincia || null, v.distrito || null, v.direccion || null,
      v.coordenadas || null, v.fechaNac || null, v.lugarNac || null,
      v.padre || null, v.madre || null,
      v.cuotaInstalacion || null, v.hogar || null, v.predio || null, v.tec || null,
      v.paquete || null, v.full || null,
      parseInt(v.cantDecos) || 0, parseInt(v.cantMesh) || 0,
      v.plano || null, 'VENTA', `[Grupo Futura] ${String(v.obs || '').trim()}`.substring(0, 1000),
      dueno.sala || null, origenId,
    ]);

    await conn.commit();
    console.log(`[interno/venta-grupo-futura] venta ${result.insertId} (GF ${origenId}) -> ${usuario}${usuarioCreado ? ' (usuario creado)' : ''}`);
    res.json({ ok: true, id: result.insertId, asesor_id: dueno.id, usuario_creado: usuarioCreado });
  } catch (e) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('[interno/venta-grupo-futura] Error:', e);
    res.status(500).json({ ok: false, mensaje: 'Error al registrar la venta' });
  } finally {
    conn?.release();
  }
});

module.exports = router;
