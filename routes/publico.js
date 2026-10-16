/* ================================================
   ROUTES/PUBLICO.JS
   Formulario público de ventas (futura.net.pe/claro), sin iniciar sesión: el
   vendedor elige su nombre, el operador y carga la venta.
     WIN   → Grupo Futura (si el vendedor es de FUTURA y no tiene usuario allá, se crea).
     CLARO → Vendedor de FUTURA: entra aquí en estado VENTA (Validación).
             Vendedor de Grupo Futura: se registra en Grupo Futura (sus Ventas
             Subidas) y Grupo Futura la envía aquí a Validación, asignada al
             usuario con el mismo `usuario` (si no existe se crea).
   Grupo Futura se llama por la red interna con la misma clave compartida
   (INTERNAL_GRUPOFUTURA_KEY). GRUPOFUTURA_API_URL es opcional.
   ================================================ */
const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');
const db        = require('../database');
const { validar, errorTexto, errorEmail, errorDni, errorFecha, errorEnteroPositivo, errorEnum, TIPO_DOC_OK } = require('../middleware/validar');

const CARGOS_VENDEDOR_FUTURA = ['asesor', 'campo'];
const GF_API_URL = (process.env.GRUPOFUTURA_API_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');

// La oficina comparte una IP pública: límites holgados, solo contra abuso
const ipCliente = req => String(req.headers['x-real-ip'] || req.ip || '');
const limiteLista = rateLimit({
  windowMs: 60 * 1000, max: 120, keyGenerator: ipCliente, validate: false,
  message: { ok: false, mensaje: 'Demasiadas solicitudes. Espera un momento.' },
  standardHeaders: true, legacyHeaders: false,
});
const limiteEnvio = rateLimit({
  windowMs: 10 * 60 * 1000, max: 60, keyGenerator: ipCliente, validate: false,
  message: { ok: false, mensaje: 'Se enviaron demasiadas ventas seguidas. Espera unos minutos e intenta de nuevo.' },
  standardHeaders: true, legacyHeaders: false,
});

async function llamarGrupoFutura(ruta, opciones = {}) {
  const clave = process.env.INTERNAL_GRUPOFUTURA_KEY;
  if (!clave) throw new Error('Falta INTERNAL_GRUPOFUTURA_KEY');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${GF_API_URL}/api/interno/${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': clave },
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  } finally {
    clearTimeout(t);
  }
}

// Mismos campos obligatorios que el formulario de venta CLARO de FUTURA
function erroresVentaClaro(v) {
  return validar([
    errorTexto(v.nombre, 'Nombres y apellidos', { requerido: true, max: 150 }),
    errorEnum(v.tipoDoc, 'Tipo de documento', TIPO_DOC_OK),
    errorTexto(v.dni, 'Número de documento', { requerido: true }),
    errorDni(v.dni, v.tipoDoc || 'DNI'),
    errorTexto(v.fechaNac, 'Fecha de nacimiento', { requerido: true, max: 10 }),
    errorFecha(v.fechaNac, 'Fecha de nacimiento'),
    errorTexto(v.lugarNac, 'Lugar de nacimiento', { requerido: true, max: 150 }),
    errorTexto(v.padre, 'Nombre del padre', { requerido: true, max: 150 }),
    errorTexto(v.madre, 'Nombre de la madre', { requerido: true, max: 150 }),
    errorTexto(v.telefono1, 'Teléfono de contacto', { requerido: true, max: 20 }),
    errorTexto(v.telefono2, 'Teléfono de referencia', { max: 20 }),
    errorTexto(v.email, 'Correo electrónico', { requerido: true, max: 150 }),
    errorEmail(v.email),
    errorTexto(v.departamento, 'Departamento', { requerido: true, max: 100 }),
    errorTexto(v.provincia, 'Provincia', { requerido: true, max: 100 }),
    errorTexto(v.distrito, 'Distrito', { requerido: true, max: 100 }),
    errorTexto(v.direccion, 'Dirección', { requerido: true, max: 1000 }),
    errorTexto(v.coordenadas, 'Coordenadas', { requerido: true, max: 255 }),
    errorTexto(v.cuotaInstalacion, 'Cuota de instalación', { requerido: true, max: 100 }),
    errorTexto(v.hogar, 'Claro Hogar', { requerido: true, max: 150 }),
    errorTexto(v.predio, 'Tipo de vivienda', { requerido: true, max: 20 }),
    errorEnum(v.predio, 'Tipo de vivienda', ['HORIZONTAL', 'VERTICAL']),
    errorTexto(v.tec, 'Tecnología', { requerido: true, max: 100 }),
    errorTexto(v.paquete, 'Paquete', { requerido: true, max: 255 }),
    errorTexto(v.full, 'Full Claro', { requerido: true, max: 20 }),
    errorTexto(v.plano, 'Plano', { requerido: true, max: 100 }),
    errorTexto(v.obs, 'Observación', { max: 1000 }),
    errorEnteroPositivo(v.cantDecos, 'Cantidad de decos', { max: 10 }),
    errorEnteroPositivo(v.cantMesh, 'Cantidad de mesh', { max: 10 }),
  ]);
}

// Formulario WIN (va a Grupo Futura): mismos obligatorios que su formulario
// `sinVivienda`: Perú Fibra no pide tipo de vivienda
function erroresVentaWin(v, sinVivienda = false) {
  return validar([
    errorTexto(v.nombre, 'Nombres y apellidos', { requerido: true, max: 150 }),
    errorEnum(v.tipoDoc, 'Tipo de documento', TIPO_DOC_OK),
    errorTexto(v.dni, 'Número de documento', { requerido: true }),
    errorDni(v.dni, v.tipoDoc || 'DNI'),
    errorTexto(v.telefono1, 'Teléfono de contacto', { requerido: true, max: 20 }),
    errorTexto(v.telefono2, 'Teléfono de referencia', { max: 20 }),
    errorTexto(v.email, 'Correo electrónico', { requerido: true, max: 150 }),
    errorEmail(v.email),
    errorTexto(v.departamento, 'Departamento', { requerido: true, max: 100 }),
    errorTexto(v.provincia, 'Provincia', { requerido: true, max: 100 }),
    errorTexto(v.distrito, 'Distrito', { requerido: true, max: 100 }),
    errorTexto(v.direccion, 'Dirección', { requerido: true, max: 1000 }),
    errorTexto(v.coordenadas, 'Coordenadas', { requerido: true, max: 255 }),
    sinVivienda ? null : errorTexto(v.predio, 'Tipo de vivienda', { requerido: true, max: 20 }),
    sinVivienda ? null : errorEnum(v.predio, 'Tipo de vivienda', ['HORIZONTAL', 'VERTICAL']),
    errorTexto(v.paquete, 'Paquete', { requerido: true, max: 255 }),
    (/^RUC\s*20/i.test(v.paquete) && !v.cuotaInstalacion) ? 'El costo de instalación es obligatorio para paquetes RUC20' : null,
    errorTexto(v.cuotaInstalacion, 'Costo de instalación', { max: 100 }),
    errorTexto(v.cantMesh, 'Cantidad de mesh', { requerido: true, max: 2 }),
    errorEnteroPositivo(v.cantDecos, 'Cantidad de Winbox', { max: 10 }),
    errorEnteroPositivo(v.cantMesh, 'Cantidad de mesh', { max: 10 }),
    errorTexto(v.obs, 'Observación', { max: 1000 }),
  ]);
}

// Solo los campos del formulario, sin espacios sobrantes
const CAMPOS = ['nombre','tipoDoc','dni','fechaNac','lugarNac','padre','madre','telefono1','telefono2','email',
  'departamento','provincia','distrito','direccion','coordenadas','cuotaInstalacion','hogar','predio','tec',
  'paquete','full','plano','obs','cantDecos','cantMesh'];
function limpiarVenta(v) {
  const out = {};
  for (const c of CAMPOS) out[c] = v?.[c] === undefined || v?.[c] === null ? '' : String(v[c]).trim();
  out.tipoDoc = (out.tipoDoc || 'DNI').toUpperCase();
  out.predio = out.predio.toUpperCase();
  out.email = out.email.toLowerCase();
  out.adicionales = Array.isArray(v?.adicionales) ? v.adicionales.map(a => String(a).substring(0, 60)).slice(0, 20) : [];
  return out;
}

// Teléfonos: solo números y el de referencia distinto al principal
function errorTelefonos(v) {
  if (!/^\d+$/.test(v.telefono1)) return 'El teléfono de contacto solo lleva números';
  if (v.telefono2 && !/^\d+$/.test(v.telefono2)) return 'El teléfono de referencia solo lleva números';
  if (v.telefono2 && v.telefono2 === v.telefono1) return 'El teléfono de referencia debe ser distinto al de contacto';
  return null;
}

// GET /api/publico/paquetes-win → catálogo WIN de Grupo Futura (paquetes y adicionales por región)
router.get('/paquetes-win', limiteLista, async (req, res) => {
  try {
    const { res: r, data } = await llamarGrupoFutura('paquetes-win');
    if (!r.ok || !data.ok) return res.status(502).json({ ok: false, mensaje: 'No se pudo cargar los paquetes WIN' });
    res.json({ ok: true, paquetes: data.paquetes, adicionales: data.adicionales });
  } catch (e) {
    console.warn('[publico/paquetes-win] sin conexión con Grupo Futura:', e.message);
    res.status(502).json({ ok: false, mensaje: 'No se pudo cargar los paquetes WIN' });
  }
});

// ── Ingreso con usuario y contraseña ──
// Sirve el usuario de Grupo Futura o el de FUTURA (se prueba primero Grupo
// Futura: su venta CLARO llega a los dos sistemas). Devuelve una sesión
// firmada solo para este formulario (no sirve para entrar al sistema).
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const HASH_SEÑUELO = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Xo8ph8oT2CpV6UEwbBAM0LqNjSGXG';
function claveSesion() {
  if (!process.env.JWT_SECRET) throw new Error('Falta JWT_SECRET');
  return require('crypto').createHash('sha256').update('venta-publica:' + process.env.JWT_SECRET).digest('hex');
}
function leerSesion(token) {
  try {
    const d = jwt.verify(String(token || ''), claveSesion());
    return d?.tipo === 'venta-publica' && /^(fu|gf):\d{1,10}$/.test(d.clave) ? d : null;
  } catch { return null; }
}
const loginKey = req => `venta:${String(req.body?.usuario || '').trim().toLowerCase()}`;
const limiteIngreso = rateLimit({
  windowMs: 5 * 60 * 1000, max: 5, keyGenerator: loginKey, skipSuccessfulRequests: true, validate: false,
  message: { ok: false, mensaje: 'Usuario bloqueado por varios intentos fallidos. Intenta de nuevo en 5 minutos.' },
  standardHeaders: true, legacyHeaders: false,
});
const limiteIngresoIp = rateLimit({
  windowMs: 10 * 60 * 1000, max: 100, keyGenerator: ipCliente, validate: false,
  message: { ok: false, mensaje: 'Demasiados intentos. Espera unos minutos.' },
  standardHeaders: true, legacyHeaders: false,
});

// POST /api/publico/ingresar  Body: { usuario, password } → { ok, sesion, nombre }
router.post('/ingresar', limiteIngresoIp, limiteIngreso, async (req, res) => {
  try {
    const usuario = String(req.body?.usuario || '').trim().toLowerCase().substring(0, 100);
    const password = String(req.body?.password || '');
    if (!usuario || !password) return res.status(400).json({ ok: false, mensaje: 'Escribe tu usuario y tu contraseña' });

    let elegido = null;
    let sinPermiso = false;
    let desactivado = false;
    // 1) Grupo Futura
    try {
      const { res: r, data } = await llamarGrupoFutura('verificar-vendedor', { method: 'POST', body: JSON.stringify({ usuario, password }) });
      if (r.ok && data.ok && data.valido) {
        if (!data.activo) desactivado = true;
        else if (!data.vendedor) sinPermiso = true;
        else elegido = { clave: `gf:${data.id}`, nombre: data.nombre };
      }
    } catch (e) {
      console.warn('[publico/ingresar] sin conexión con Grupo Futura:', e.message);
    }
    // 2) FUTURA
    if (!elegido) {
      const [rows] = await db.query('SELECT id, nombre, password, cargo, activo FROM usuarios WHERE usuario = ? LIMIT 1', [usuario]);
      const u = rows[0];
      if (bcrypt.compareSync(password, u?.password || HASH_SEÑUELO) && u) {
        if (!u.activo) desactivado = true;
        else if (!CARGOS_VENDEDOR_FUTURA.includes(String(u.cargo || '').toLowerCase())) sinPermiso = true;
        else elegido = { clave: `fu:${u.id}`, nombre: u.nombre };
      }
    }
    if (!elegido) {
      if (desactivado) return res.status(403).json({ ok: false, mensaje: 'Tu cuenta está desactivada. Avisa a tu supervisor.' });
      if (sinPermiso) return res.status(403).json({ ok: false, mensaje: 'Tu usuario no puede registrar ventas aquí.' });
      return res.status(401).json({ ok: false, mensaje: 'Usuario o contraseña incorrectos' });
    }
    const nombre = String(elegido.nombre || usuario).trim();
    // `usuario` viaja en la sesión: con él se asigna la venta CLARO en FUTURA
    const sesion = jwt.sign({ tipo: 'venta-publica', clave: elegido.clave, nombre, usuario }, claveSesion(), { expiresIn: '12h' });
    res.json({ ok: true, sesion, nombre });
  } catch (e) {
    console.error('[publico/ingresar] Error:', e.message);
    res.status(500).json({ ok: false, mensaje: 'No se pudo ingresar. Intenta de nuevo.' });
  }
});

// ── Coordenadas desde Google Maps ──
// El formulario se abre sin candado (por la IP), y ahí el navegador no deja
// leer el GPS. El vendedor comparte su ubicación desde Google Maps y pega el
// enlace (o las coordenadas): aquí se convierte en "lat, lng".
const HOSTS_MAPS = /^(maps\.app\.goo\.gl|goo\.gl|g\.co|(www\.|maps\.)?google\.[a-z.]{2,6})$/i;

function coordenadasValidas(lat, lng) {
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  return `${a.toFixed(6)}, ${b.toFixed(6)}`;
}

// Busca "lat, lng" en un texto o en una dirección de Google Maps
function coordenadasEnTexto(texto) {
  const t = decodeURIComponent(String(texto || '').replace(/\+/g, ' '));
  const patrones = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,                                   // pin exacto del lugar
    /[?&](?:q|query|ll|sll|center|destination|daddr)=(?:loc:)?\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i,
    /\/(?:search|place|dir)\/\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,                                       // centro del mapa
    /^\s*\(?\s*(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*\)?\s*$/,          // "lat, lng" escritas
  ];
  for (const p of patrones) {
    const m = p.exec(t);
    if (m) { const c = coordenadasValidas(m[1], m[2]); if (c) return c; }
  }
  return null;
}

// Sigue las redirecciones de un enlace corto de Google Maps (solo dominios de Google)
async function resolverEnlaceMaps(enlace) {
  let actual = enlace;
  for (let salto = 0; salto < 6; salto++) {
    let url;
    try { url = new URL(actual); } catch { return null; }
    if (url.protocol !== 'https:' || !HOSTS_MAPS.test(url.hostname)) return null;
    const directo = coordenadasEnTexto(url.href);
    if (directo) return directo;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let r;
    try {
      r = await fetch(url.href, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36', 'Accept-Language': 'es' } });
    } catch { return null; } finally { clearTimeout(t); }
    const destino = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && destino) {
      try { actual = new URL(destino, url.href).href; } catch { return null; }
      continue;
    }
    // Última página: a veces las coordenadas solo vienen dentro del contenido
    if (r.ok) {
      const html = (await r.text().catch(() => '')).substring(0, 400000);
      const m = /https:\/\/(?:www\.)?google\.[a-z.]{2,6}\/maps\/[^"'\\<> ]{0,600}/i.exec(html);
      if (m) { const c = coordenadasEnTexto(m[0]); if (c) return c; }
    }
    return null;
  }
  return null;
}

// POST /api/publico/coordenadas  Body: { texto } → { ok, coordenadas }
router.post('/coordenadas', limiteLista, async (req, res) => {
  try {
    const texto = String(req.body?.texto || '').trim().substring(0, 1500);
    if (!texto) return res.status(400).json({ ok: false, mensaje: 'Pega el enlace de Google Maps o las coordenadas' });
    const enlace = /https?:\/\/[^\s]+/i.exec(texto)?.[0];
    let coordenadas = enlace ? null : coordenadasEnTexto(texto);
    if (enlace) coordenadas = await resolverEnlaceMaps(enlace.replace(/^http:/i, 'https:'));
    if (!coordenadas) {
      return res.status(400).json({ ok: false, mensaje: 'No se pudo leer la ubicación. En Google Maps mantén presionado el punto exacto, toca Compartir y copia el enlace.' });
    }
    res.json({ ok: true, coordenadas });
  } catch (e) {
    console.error('[publico/coordenadas] Error:', e.message);
    res.status(500).json({ ok: false, mensaje: 'No se pudo leer la ubicación. Intenta de nuevo.' });
  }
});

// Fotos de ventas WIN: tras crear la venta se entrega un pase temporal para
// subir sus fotos una por una (así cada envío pesa poco).
const PASES_FOTOS = new Map(); // pase -> { ventaId, vence, subidas }
const MAX_FOTOS_POR_VENTA = 8;
const crypto = require('crypto');
function crearPaseFotos(ventaId) {
  const ahora = Date.now();
  for (const [k, p] of PASES_FOTOS) if (p.vence < ahora) PASES_FOTOS.delete(k);
  const pase = crypto.randomBytes(24).toString('base64url');
  PASES_FOTOS.set(pase, { ventaId, vence: ahora + 60 * 60 * 1000, subidas: 0 });
  return pase;
}
const limiteFotos = rateLimit({
  windowMs: 10 * 60 * 1000, max: 300, keyGenerator: ipCliente, validate: false,
  message: { ok: false, mensaje: 'Se subieron demasiadas fotos seguidas. Espera unos minutos.' },
  standardHeaders: true, legacyHeaders: false,
});

// POST /api/publico/venta-foto  Body: { pase, nombre, datos (JPEG base64) }
router.post('/venta-foto', limiteFotos, async (req, res) => {
  try {
    const p = PASES_FOTOS.get(String(req.body?.pase || ''));
    if (!p || p.vence < Date.now()) return res.status(400).json({ ok: false, mensaje: 'Ya no se pueden agregar fotos a esta venta' });
    if (p.subidas >= MAX_FOTOS_POR_VENTA) return res.status(400).json({ ok: false, mensaje: `Máximo ${MAX_FOTOS_POR_VENTA} fotos por venta` });
    const datos = String(req.body?.datos || '');
    if (!datos || datos.length > 4 * 1024 * 1024) return res.status(400).json({ ok: false, mensaje: 'La foto no es válida' });
    const { res: r, data } = await llamarGrupoFutura('venta-foto', {
      method: 'POST', body: JSON.stringify({ ventaId: p.ventaId, nombre: String(req.body?.nombre || 'foto.jpg').substring(0, 200), datos }),
    });
    if (!r.ok || !data.ok) return res.status(r.status >= 400 && r.status < 500 && r.status !== 401 ? 400 : 502).json({ ok: false, mensaje: data.mensaje || 'No se pudo subir la foto' });
    p.subidas++;
    res.json({ ok: true });
  } catch (e) {
    console.error('[publico/venta-foto] Error:', e.message);
    res.status(502).json({ ok: false, mensaje: 'No se pudo subir la foto. Intenta de nuevo.' });
  }
});

// Última anotación de Validación (sin la marca "[fecha - usuario]"), para que
// el vendedor sepa por qué su venta no avanzó.
function ultimaNota(obs) {
  const lineas = String(obs || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lineas.length ? lineas[lineas.length - 1].replace(/^\[[^\]]*\]\s*/, '').substring(0, 200) : '';
}

// POST /api/publico/mis-ventas  Body: { sesion } → ventas WIN y CLARO de quien ingresó
//   WIN   → Grupo Futura.   CLARO → FUTURA (donde avanza su estado).
router.post('/mis-ventas', limiteLista, async (req, res) => {
  try {
    const sesion = leerSesion(req.body?.sesion);
    if (!sesion) return res.status(401).json({ ok: false, mensaje: 'Tu sesión venció. Vuelve a ingresar.', sesionVencida: true });
    const m = /^(fu|gf):(\d{1,10})$/.exec(sesion.clave);
    const id = Number(m[2]);

    // Grupo Futura: por id (vendedor de allá) o por el mismo `usuario` (vendedor de FUTURA)
    let usuario = null;
    let consultaGrupo = { asesorId: id };
    if (m[1] === 'fu') {
      const [u] = await db.query('SELECT usuario FROM usuarios WHERE id = ? LIMIT 1', [id]);
      usuario = u[0]?.usuario || null;
      consultaGrupo = { usuario };
    }
    let delGrupo = [];
    let avisoGrupo = false;
    if (consultaGrupo.asesorId || consultaGrupo.usuario) {
      try {
        const { res: r, data } = await llamarGrupoFutura('mis-ventas', { method: 'POST', body: JSON.stringify(consultaGrupo) });
        if (r.ok && data.ok) { delGrupo = data.ventas || []; usuario = usuario || data.usuario || null; }
        else avisoGrupo = true;
      } catch (e) {
        console.warn('[publico/mis-ventas] sin conexión con Grupo Futura:', e.message);
        avisoGrupo = true;
      }
    }

    // FUTURA: las ventas CLARO del usuario con el mismo `usuario` (fecha en hora de Perú)
    let deFutura = [];
    if (usuario) {
      [deFutura] = await db.query(`
        SELECT v.id, DATE_FORMAT(DATE_SUB(v.created_at, INTERVAL (TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) + 300) MINUTE), '%Y-%m-%d %H:%i') AS created_at,
               v.nombre, v.dni, v.distrito, v.paquete, v.claro_hogar, v.estado, v.estado_grab,
               v.fecha_programada, v.obs_validacion
          FROM ventas v JOIN usuarios u ON u.id = v.asesor_id
         WHERE u.usuario = ? ORDER BY v.id DESC LIMIT 200
      `, [usuario]);
    }

    const fila = (v, operador, extra = {}) => ({
      clave: `${operador}-${extra.origen || 'x'}-${v.id}`,
      operador,
      fecha: String(v.created_at || '').replace('T', ' ').substring(0, 16),
      cliente: v.nombre || '', dni: v.dni || '', distrito: v.distrito || '',
      paquete: operador === 'CLARO' ? [v.claro_hogar, v.paquete].filter(Boolean).join(' · ') : (v.paquete || ''),
      estado: String(v.estado || 'VENTA').toUpperCase(),
      grabacion: String(v.estado_grab || '').toLowerCase(),
      programada: v.fecha_programada ? String(v.fecha_programada).substring(0, 10) : '',
      nota: ultimaNota(v.obs_validacion),
      ...extra.campos,
    });
    const ventas = [
      ...deFutura.map(v => fila(v, 'CLARO', { origen: 'fu' })),
      ...delGrupo.filter(v => String(v.operador || '').toUpperCase() !== 'CLARO')
        .map(v => fila(v, String(v.operador || '').toUpperCase() === 'PERU FIBRA' ? 'PERU FIBRA' : 'WIN', { origen: 'gf' })),
      // CLARO que todavía no llegó a FUTURA (se reintenta sola)
      ...delGrupo.filter(v => String(v.operador || '').toUpperCase() === 'CLARO' && v.futura_envio !== 'enviada')
        .map(v => fila(v, 'CLARO', { origen: 'gf', campos: { estado: 'ENVIANDO', nota: 'Se está enviando.' } })),
    ].sort((a, b) => b.fecha.localeCompare(a.fecha));
    res.json({ ok: true, ventas, aviso: avisoGrupo ? 'No se pudieron cargar las ventas de WIN y Perú Fibra en este momento.' : '' });
  } catch (e) {
    console.error('[publico/mis-ventas] Error:', e.message);
    res.status(500).json({ ok: false, mensaje: 'No se pudieron cargar tus ventas. Intenta de nuevo.' });
  }
});

async function reenviarAGrupoFutura(res, ruta, body) {
  let r, data;
  try {
    ({ res: r, data } = await llamarGrupoFutura(ruta, { method: 'POST', body: JSON.stringify(body) }));
  } catch (e) {
    console.error(`[publico/${ruta}] sin conexión con Grupo Futura:`, e.message);
    return res.status(502).json({ ok: false, mensaje: 'No se pudo guardar la venta. Revisa tu internet e intenta de nuevo.' });
  }
  if (!r.ok || !data.ok) {
    return res.status(r.status >= 400 && r.status < 500 && r.status !== 401 ? 400 : 502)
      .json({ ok: false, mensaje: data.mensaje || 'No se pudo guardar la venta. Intenta de nuevo.' });
  }
  if (ruta === 'venta-win' && Number.isInteger(data.id)) return res.json({ ok: true, paseFotos: crearPaseFotos(data.id) });
  return res.json({ ok: true });
}

// POST /api/publico/venta  Body: { operador:'WIN'|'CLARO', sesion, venta:{...}, web:'' }
//   WIN   → Grupo Futura (si el vendedor es de FUTURA y no tiene usuario allá, se le crea)
//   CLARO → FUTURA (Validación); si el vendedor es de Grupo Futura, también a Grupo Futura
router.post(['/venta', '/venta-claro'], limiteEnvio, async (req, res) => {
  try {
    // Campo oculto: solo lo llenan los robots
    if (req.body?.web) return res.json({ ok: true });
    // El vendedor sale de la sesión (usuario y contraseña), nunca del cuerpo
    const sesion = leerSesion(req.body?.sesion);
    if (!sesion) return res.status(401).json({ ok: false, mensaje: 'Tu sesión venció. Vuelve a ingresar con tu usuario y contraseña.', sesionVencida: true });
    const m = /^(fu|gf):(\d{1,10})$/.exec(sesion.clave);
    const operador = String(req.body?.operador || 'CLARO').trim().toUpperCase();
    if (!['WIN', 'CLARO', 'PERU FIBRA'].includes(operador)) return res.status(400).json({ ok: false, mensaje: 'Elige el operador' });
    // WIN y PERU FIBRA van a Grupo Futura con el mismo tipo de formulario
    const vaAGrupoFutura = operador !== 'CLARO';
    const v = limpiarVenta(req.body?.venta || {});
    const errores = vaAGrupoFutura ? erroresVentaWin(v, operador === 'PERU FIBRA') : erroresVentaClaro(v);
    if (operador === 'PERU FIBRA') v.predio = '';
    if (errores) return res.status(400).json({ ok: false, mensaje: errores[0], errores });
    const errorTel = errorTelefonos(v);
    if (errorTel) return res.status(400).json({ ok: false, mensaje: errorTel });
    const vendedorId = Number(m[2]);

    if (vaAGrupoFutura) {
      if (m[1] === 'gf') return reenviarAGrupoFutura(res, 'venta-win', { operador, asesorId: vendedorId, venta: v });
      const [usuarios] = await db.query(
        `SELECT usuario, nombre, cargo, genero FROM usuarios WHERE id = ? AND activo = 1 AND cargo IN (?) LIMIT 1`,
        [vendedorId, CARGOS_VENDEDOR_FUTURA]
      );
      if (!usuarios.length) return res.status(400).json({ ok: false, mensaje: 'Tu nombre ya no está en la lista. Recarga la página.' });
      return reenviarAGrupoFutura(res, 'venta-win', { operador, asesor: usuarios[0], venta: v });
    }

    // CLARO va SOLO a FUTURA (Validación). Grupo Futura no guarda ventas CLARO.
    let dueno;
    if (m[1] === 'gf') {
      // Vendedor de Grupo Futura: se asigna al usuario de FUTURA con su mismo
      // `usuario`; si no existe se crea (contraseña aleatoria, la cambia Jefatura).
      const usuarioVendedor = String(sesion.usuario || '').trim().toLowerCase().substring(0, 100);
      if (!usuarioVendedor) return res.status(401).json({ ok: false, mensaje: 'Vuelve a ingresar con tu usuario y contraseña.', sesionVencida: true });
      const buscar = () => db.query('SELECT id, nombre, sala FROM usuarios WHERE usuario = ? LIMIT 1', [usuarioVendedor]);
      let [existentes] = await buscar();
      if (!existentes.length) {
        const nombreVendedor = String(sesion.nombre || usuarioVendedor).split(' ').filter(Boolean).join(' ').toUpperCase().substring(0, 150);
        const hash = bcrypt.hashSync(require('crypto').randomBytes(18).toString('base64url'), 10);
        try {
          await db.query(
            `INSERT INTO usuarios (nombre, usuario, password, cargo, sala, genero, activo, permisos) VALUES (?, ?, ?, 'asesor', NULL, 'M', 1, '[]')`,
            [nombreVendedor, usuarioVendedor, hash]
          );
          console.log(`[publico/venta-claro] usuario creado en FUTURA: ${usuarioVendedor}`);
        } catch (e) {
          if (e.code !== 'ER_DUP_ENTRY') throw e; // otro envío lo creó a la vez
        }
        [existentes] = await buscar();
      }
      dueno = existentes[0];
    } else {
      const [usuarios] = await db.query(
        `SELECT id, nombre, sala FROM usuarios WHERE id = ? AND activo = 1 AND cargo IN (?) LIMIT 1`,
        [vendedorId, CARGOS_VENDEDOR_FUTURA]
      );
      dueno = usuarios[0];
    }
    if (!dueno) return res.status(400).json({ ok: false, mensaje: 'No se encontró tu usuario. Vuelve a ingresar.' });
    const [result] = await db.query(`
      INSERT INTO ventas (
        asesor_id, asesor_nombre, tipo_doc, dni, nombre, email,
        telefono1, telefono2, departamento, provincia, distrito,
        direccion, coordenadas, fecha_nac, lugar_nac, padre, madre,
        cuota_inst, claro_hogar, predio, tecnologia, paquete,
        full_claro, cant_decos, cant_mesh, plano, estado, observacion,
        sala_atribucion
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      dueno.id, dueno.nombre, v.tipoDoc, v.dni, v.nombre, v.email,
      v.telefono1, v.telefono2 || null, v.departamento, v.provincia, v.distrito,
      v.direccion, v.coordenadas, v.fechaNac, v.lugarNac, v.padre, v.madre,
      v.cuotaInstalacion, v.hogar, v.predio, v.tec, v.paquete,
      v.full, parseInt(v.cantDecos) || 0, parseInt(v.cantMesh) || 0, v.plano, 'VENTA',
      `[Formulario Claro] ${v.obs}`.substring(0, 1000),
      dueno.sala || null,
    ]);
    console.log(`[publico/venta-claro] venta ${result.insertId} -> usuario ${dueno.id}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[publico/venta-claro] Error:', e);
    res.status(500).json({ ok: false, mensaje: 'No se pudo guardar la venta. Intenta de nuevo.' });
  }
});

module.exports = router;
