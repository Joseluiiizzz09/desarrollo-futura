import { useEffect, useState } from 'react'
import { API } from '../services/api'
import { UBIGEO, UBIGEO_CLARO } from '../services/ubigeo'

// ── Formulario público de ventas WIN y CLARO (sin iniciar sesión) ───────────
// El vendedor ingresa con su usuario y contraseña, elige el operador y carga la venta por pasos. El
// backend (routes/publico.js) la reparte:
//   WIN   → Grupo Futura (sus Ventas Subidas)
//   CLARO → Validación de FUTURA (y también Grupo Futura si el vendedor es de allá)
// Pensado para personas mayores: letra grande, un paso a la vez.

const PAQUETES_CLARO_POR_PLAN = {
  '1 PLAY': ['150 MBPS S/70.00','300 MBPS S/75.00','800 MBPS S/100.00','1500 MBPS S/200.00','PROM ENTRADA 200 X 12 M 400 MBPS X 6M 39.5','PROM GRANDE 1000 MBPS X 6M 59.9','PROM GRANDE 850 X 12M 1000 MBPS X 4M 55','PROM LIM/ARQ 400 X 12 M 1000 MBPS X 2 M 1 SOL','PROM MEDIANA 400 X 12M 1000 MBPS X 6M 55','REG PRO 1000 MBPS','REG PRO 500 MBPS'],
  '2 PLAY INTERNET + TELEFONO': ['150 MBPS S/70.00','1000 MBPS S/150.00','1500 MBPS S/205.00','300 MBPS S/80.00','300 MPBS 84.00','400 MBPS 94.00 S','400 MBPS S/90.00','800 MBPS S/105.00'],
  '2 PLAY INTERNET + CABLE ESTANDAR': ['1000 MBPS S/230.00','150 MBPS S/150.00','1500 MBPS S/285.00','300 MBPS S/160.00','400 MBPS S/170.00','800 MBPS S/185.00'],
  '2 PLAY INTERNET + CABLE SUPERIOR': ['1000 MBPS S/270.00','150 MBPS S/190.00','1500 MBPS S/325.00','300 MBPS S/200.00','400 MBPS S/210.00','800 MBPS S/225.00'],
  '3 PLAY ESTANDAR': ['1000 MBPS S/235.00','150 MBPS S/155.00','1500 MBPS S/290.00','300 MBPS S/165.00','400 MBPS S/175.00','800 MBPS S/190.00'],
  '3 PLAY SUPERIOR': ['1000 MBPS S/275.00','150 MBPS S/195.00','1500 MBPS S/330.00','300 MBPS S/205.00','400 MBPS S/215.00','800 MBPS S/230.00'],
}
const CUOTAS = ['S/. 0 SOLES', 'S/. 120 SOLES']
const TECNOLOGIAS = ['FTTH', 'HFC']
const VIVIENDAS = [['HORIZONTAL', 'Casa (horizontal)'], ['VERTICAL', 'Edificio (vertical)']]
const TIPOS_DOC = [['DNI', 'DNI'], ['CE', 'Carné de extranjería'], ['RUC', 'RUC'], ['PASAPORTE', 'Pasaporte']]
const CANTIDADES = ['0', '1', '2', '3', '4', '5']

const DATOS_SERVICIO = {
  cuotaInstalacion:'', hogar:'', paquete:'', predio:'', tec:'', full:'', cantDecos:'0', cantMesh:'', plano:'', obs:'', adicionales:[],
}
const VACIO = {
  operador:'',
  nombre:'', tipoDoc:'DNI', dni:'', fechaNac:'', lugarNac:'', padre:'', madre:'',
  telefono1:'', telefono2:'', email:'',
  departamento:'', provincia:'', distrito:'', direccion:'', coordenadas:'',
  ...DATOS_SERVICIO,
}

const CLAVE_SESION = 'futura_venta_publica_sesion' // { sesion, nombre, vence }
function leerSesionGuardada() {
  const s = leer(CLAVE_SESION, null)
  return s && s.sesion && s.vence > Date.now() ? s : null
}
const CLAVE_BORRADOR = 'futura_venta_publica_borrador'
function leer(clave, porDefecto) {
  try { const v = JSON.parse(localStorage.getItem(clave) || 'null'); return v ?? porDefecto } catch { return porDefecto }
}
function guardar(clave, valor) {
  try { valor === null ? localStorage.removeItem(clave) : localStorage.setItem(clave, JSON.stringify(valor)) } catch {}
}

const PASOS = ['Ingresar', 'Operador', 'Cliente', 'Dirección', 'Servicio', 'Revisar']
const P = { NOMBRE: 0, OPERADOR: 1, CLIENTE: 2, DIRECCION: 3, SERVICIO: 4, REVISAR: 5 }

// Fotos: se achican en el celular a JPEG liviano (cada envío debe pesar menos de ~900 KB)
const MAX_FOTOS = 8
const MAX_BASE64_FOTO = 850 * 1024
function cargarImagen(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen')) }
    img.src = url
  })
}
async function comprimirFoto(archivo) {
  const img = await cargarImagen(archivo)
  let lado = 1600
  for (let intento = 0; intento < 6; intento++) {
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const calidad of [0.82, 0.7, 0.55]) {
      const base64 = canvas.toDataURL('image/jpeg', calidad).split(',')[1] || ''
      if (base64 && base64.length <= MAX_BASE64_FOTO) return base64
    }
    lado = Math.round(lado * 0.75)
  }
  throw new Error('muy grande')
}

const regionWin = dpto => !dpto ? '' : (String(dpto).trim().toUpperCase() === 'LIMA' ? 'LIMA' : 'PROVINCIA')
const esRuc20 = paquete => /^RUC\s*20/i.test(String(paquete || '').trim())

// Qué falta en cada paso (mensajes simples)
function faltantes(paso, f) {
  const req = []
  const pedir = (valor, texto) => { if (!String(valor || '').trim()) req.push(texto) }
  const claro = f.operador === 'CLARO'
  if (paso === P.OPERADOR) pedir(f.operador, 'Elige el operador')
  if (paso === P.CLIENTE) {
    pedir(f.nombre, 'Nombres y apellidos del cliente')
    pedir(f.dni, 'Número de documento')
    const d = String(f.dni || '').trim()
    if (d) {
      if (f.tipoDoc === 'DNI' && !/^\d{8}$/.test(d)) req.push('El DNI debe tener 8 números')
      else if (f.tipoDoc === 'CE' && !/^\d{9}$/.test(d)) req.push('El carné de extranjería debe tener 9 números')
      else if (f.tipoDoc === 'RUC' && !/^\d{11}$/.test(d)) req.push('El RUC debe tener 11 números')
      else if (!/^\d+$/.test(d)) req.push('El documento solo lleva números')
    }
    if (claro) {
      pedir(f.fechaNac, 'Fecha de nacimiento')
      pedir(f.lugarNac, 'Lugar de nacimiento')
      pedir(f.padre, 'Nombre del padre')
      pedir(f.madre, 'Nombre de la madre')
    }
  }
  if (paso === P.DIRECCION) {
    pedir(f.telefono1, 'Teléfono de contacto')
    if (f.telefono2 && f.telefono2 === f.telefono1) req.push('El teléfono de referencia debe ser distinto al de contacto')
    pedir(f.email, 'Correo electrónico')
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) req.push('El correo no está bien escrito')
    pedir(f.departamento, 'Departamento')
    pedir(f.provincia, 'Provincia')
    pedir(f.distrito, 'Distrito')
    pedir(f.direccion, 'Dirección')
    pedir(f.coordenadas, 'Coordenadas (usa el botón "Usar mi ubicación")')
  }
  if (paso === P.SERVICIO) {
    if (claro) {
      pedir(f.cuotaInstalacion, 'Cuota de instalación')
      pedir(f.hogar, 'Claro Hogar (plan)')
      pedir(f.paquete, 'Paquete')
      pedir(f.predio, 'Tipo de vivienda')
      pedir(f.tec, 'Tecnología')
      pedir(f.full, 'Full Claro')
      pedir(f.cantMesh, 'Cantidad de mesh')
      pedir(f.plano, 'Plano')
    } else {
      if (f.operador !== 'PERU FIBRA') pedir(f.predio, 'Tipo de vivienda')
      pedir(f.paquete, 'Paquete')
      if (esRuc20(f.paquete)) pedir(f.cuotaInstalacion, 'Costo de instalación')
      pedir(f.cantMesh, 'Cantidad de mesh')
    }
  }
  return req
}

// Mismo estilo visual que Grupo Futura (formulario "Nueva Venta" y su
// cabecera), con letra y botones más grandes para que sea fácil de usar.
const ESTILOS = `
.vc { min-height:100vh; background:linear-gradient(180deg, #e8eef6 0, #f4f6fa 100%); font-family:'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; color:#111827; font-size:18px; overflow-x:hidden; }
.vc * { box-sizing:border-box; }
.vc-top { background:#fff; border-bottom:1px solid #eef0f3; padding:16px 24px; }
.vc-top .dentro { max-width:760px; margin:0 auto; display:flex; align-items:center; gap:14px; }
.vc-top img { width:64px; height:auto; display:block; }
.vc-marca { font-family:'Archivo Black', 'DM Sans', sans-serif; font-size:26px; line-height:1; color:#111827; letter-spacing:.3px; }
.vc-marca-sub { font-family:Georgia, 'Times New Roman', serif; font-size:17px; color:#6b7280; margin-top:4px; }
.vc-main { max-width:760px; margin:0 auto; padding:26px 16px 130px; }
.vc-pasos { display:flex; gap:6px; margin-bottom:8px; }
.vc-paso { flex:1; text-align:center; font-size:13px; font-weight:600; color:#9ca3af; }
.vc-paso .barra { height:6px; border-radius:6px; background:#e5e7eb; margin-bottom:6px; }
.vc-paso.hecho .barra, .vc-paso.actual .barra { background:#111827; }
.vc-paso.actual { color:#111827; }
.vc-paso-texto { text-align:left; font-size:12px; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:1px; margin:16px 0 10px; }
.vc-card { background:#fff; border-radius:22px; padding:24px; box-shadow:0 18px 50px rgba(15,23,42,.08); border:1px solid #eef0f3; }
.vc-card-cab { display:flex; align-items:center; gap:12px; margin-bottom:18px; }
.vc-icono { width:44px; height:44px; flex:none; background:#111827; border-radius:12px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px; font-weight:800; letter-spacing:.5px; }
.vc-card h2 { margin:0; font-size:21px; font-weight:700; letter-spacing:-.2px; color:#111827; }
.vc-ayuda { margin:3px 0 0; color:#9ca3af; font-size:16px; }
.vc-card > .vc-ayuda { margin:0 0 16px; }
.vc-campo { margin-bottom:16px; }
.vc-campo label { display:block; font-weight:600; margin-bottom:7px; font-size:16px; color:#4b5563; letter-spacing:.1px; }
.vc-campo .opc { font-weight:500; color:#9ca3af; font-size:13px; }
.vc input, .vc select, .vc textarea { width:100%; font-size:18px; padding:14px 14px; border:1.5px solid #e5e7eb; border-radius:12px; background:#f9fafb; color:#111827; font-family:inherit; transition:all .2s; }
.vc select { appearance:none; cursor:pointer; padding-right:40px; background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 12px center; }
.vc select:disabled, .vc input:disabled { opacity:.6; cursor:not-allowed; }
.vc input::placeholder, .vc textarea::placeholder { color:#c4c9d1; }
.vc textarea { min-height:110px; resize:vertical; }
.vc input:focus, .vc select:focus, .vc textarea:focus { outline:none; border-color:#9ca3af; background:#fff; box-shadow:0 0 0 3px rgba(0,0,0,.06); }
.vc-opciones { display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; }
.vc-opcion { font-size:17px; font-weight:600; padding:15px 10px; border:1.5px solid #e5e7eb; border-radius:12px; background:#f9fafb; color:#374151; cursor:pointer; text-align:center; font-family:inherit; transition:all .2s; }
.vc-opcion:hover { border-color:#9ca3af; background:#fff; }
.vc-opcion.sel { border-color:#111827; background:#111827; color:#fff; }
.vc-btn { font-size:18px; font-weight:700; padding:16px 22px; border-radius:12px; border:none; cursor:pointer; font-family:inherit; transition:all .2s; }
.vc-btn-pri { background:#111827; color:#fff; }
.vc-btn-pri:hover { background:#374151; }
.vc-btn-pri:disabled { opacity:.5; cursor:wait; }
.vc-btn-sec { background:#fff; color:#6b7280; border:1.5px solid #e5e7eb; }
.vc-btn-sec:hover { background:#f9fafb; }
.vc-btn-ubic { width:100%; background:#fff; color:#111827; border:1.5px solid #d1d5db; margin-bottom:10px; }
.vc-btn-ubic:hover { background:#f9fafb; }
.vc-barra-abajo { position:fixed; left:0; right:0; bottom:0; background:rgba(255,255,255,.96); border-top:1px solid #eef0f3; padding:12px 16px calc(12px + env(safe-area-inset-bottom)); backdrop-filter:blur(6px); }
.vc-barra-abajo .dentro { max-width:760px; margin:0 auto; display:flex; gap:10px; }
.vc-barra-abajo .vc-btn { flex:1; }
.vc-error { background:#fef2f2; border:1.5px solid #fecaca; color:#991b1b; border-radius:14px; padding:14px 16px; margin-bottom:16px; font-size:17px; }
.vc-error ul { margin:6px 0 0; padding-left:22px; }
.vc-quien { background:#fff; border:1px solid #e5e7eb; border-radius:14px; padding:12px 16px; margin-bottom:14px; font-size:16px; color:#6b7280; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
.vc-quien b { color:#111827; }
.vc-resumen { width:100%; border-collapse:collapse; font-size:17px; }
.vc-resumen td { padding:10px 4px; border-bottom:1px solid #f3f4f6; vertical-align:top; }
.vc-resumen td:first-child { color:#9ca3af; width:44%; font-size:15px; }
.vc-resumen td:last-child { font-weight:600; word-break:break-word; color:#111827; }
.vc-ok { text-align:center; padding:32px 20px; }
.vc-ok .icono { width:84px; height:84px; border-radius:50%; background:#111827; color:#fff; font-size:46px; line-height:84px; margin:0 auto 16px; }
.vc-ok h2 { margin-bottom:8px; }
.vc-ok .vc-ayuda { color:#6b7280; margin-bottom:18px; }
.vc-pass { position:relative; }
.vc-pass input { padding-right:96px; }
.vc-pass button { position:absolute; right:8px; top:50%; transform:translateY(-50%); border:none; background:#f3f4f6; color:#374151; font-size:15px; font-weight:700; padding:9px 12px; border-radius:9px; cursor:pointer; font-family:inherit; }
.vc-oculto { position:absolute; left:-10000px; width:1px; height:1px; overflow:hidden; }
`

const ESTILOS_OPERADOR = `
.vc-operadores { display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; }
.vc-operador { display:flex; align-items:center; justify-content:center; padding:28px 10px; border-radius:18px; border:2px solid #e5e7eb; background:#fff; cursor:pointer; transition:all .2s; }
.vc-operador:hover { border-color:#9ca3af; background:#fff; }
.vc-operador img { width:120px; height:120px; object-fit:contain; border-radius:22px; display:block; }
.vc-operador.sel { border-color:#111827; background:#fff; box-shadow:0 0 0 3px rgba(17,24,39,.12); }
.vc-region { background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:12px 14px; margin-bottom:16px; font-size:16px; color:#6b7280; }
.vc-region b { color:#111827; }
.vc-fotos { display:grid; grid-template-columns:repeat(auto-fill, minmax(110px, 1fr)); gap:10px; margin-bottom:12px; }
.vc-foto { position:relative; border-radius:12px; overflow:hidden; border:1.5px solid #e5e7eb; background:#f9fafb; }
.vc-foto img { display:block; width:100%; height:110px; object-fit:cover; }
.vc-foto button { width:100%; border:none; background:#f3f4f6; color:#991b1b; font-size:15px; font-weight:700; padding:9px; cursor:pointer; font-family:inherit; }
.vc-btn-foto { display:block; text-align:center; cursor:pointer; }
.vc-btn-foto.ocupado { opacity:.6; cursor:wait; }
.vc-btn-foto input { display:none; }
.vc-campo label.vc-btn { text-transform:none; font-size:18px; font-weight:700; color:#111827; letter-spacing:0; margin-bottom:0; }

.vc-mv-volver { display:inline-flex; align-items:center; gap:8px; margin-bottom:16px; color:#111827; border-color:#111827; padding:12px 18px; }
.vc-mv-dia { margin-bottom:12px; }
.vc-mv-dia label { display:block; font-weight:600; font-size:16px; color:#4b5563; margin-bottom:7px; }
.vc-mv-dia-fila { display:flex; gap:8px; flex-wrap:wrap; }
.vc-mv-dia-fila input { flex:2; min-width:170px; }
.vc-mv-dia-fila .vc-mv-filtro { flex:1; min-width:80px; }
.vc-mv-filtros { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
.vc-mv-filtro { flex:1; min-width:90px; font-size:16px; font-weight:700; padding:12px 8px; border-radius:12px; border:1.5px solid #e5e7eb; background:#f9fafb; color:#374151; cursor:pointer; font-family:inherit; }
.vc-mv-filtro.sel { background:#111827; border-color:#111827; color:#fff; }
.vc-mv { border:1.5px solid #e5e7eb; border-radius:14px; padding:14px; margin-bottom:10px; background:#fff; }
.vc-mv-cab { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.vc-mv-cab img { width:34px; height:34px; min-width:34px; border-radius:9px; object-fit:contain; }
.vc-mv-cliente { flex:1; min-width:0; font-size:17px; font-weight:700; color:#111827; word-break:break-word; }
.vc-mv-estado { font-size:12px; font-weight:800; letter-spacing:.3px; padding:6px 10px; border-radius:8px; white-space:nowrap; }
.vc-mv-dato { font-size:15px; color:#6b7280; margin-top:3px; word-break:break-word; }
.vc-mv-dato b { color:#374151; font-weight:600; }
.vc-mv-nota { margin-top:8px; font-size:15px; color:#991b1b; background:#fef2f2; border-radius:10px; padding:8px 10px; }

.vc-maps { border:1.5px solid #e5e7eb; border-radius:14px; padding:14px; margin-bottom:10px; background:#f9fafb; }
.vc-maps-abrir { display:block; text-align:center; text-decoration:none; margin-bottom:0; }
.vc-maps ol { margin:12px 0; padding-left:22px; color:#4b5563; font-size:16px; line-height:1.5; }
.vc-maps ol b { color:#111827; }
.vc-maps-fila { display:flex; gap:8px; }
.vc-maps-fila input { flex:1; min-width:0; background:#fff; }
.vc-maps-fila .vc-btn { padding:14px 18px; }
.vc-maps-ok { font-size:15px; font-weight:700; color:#047857; margin-bottom:8px; }

/* Celular */
@media (max-width: 600px) {
  .vc { font-size:17px;  }
  .vc-top { padding:12px 14px; }
  .vc-top img { width:52px; }
  .vc-marca { font-size:21px; }
  .vc-marca-sub { font-size:15px; }
  .vc-main { padding:16px 12px 130px; }
  .vc-pasos { gap:4px; }
  .vc-paso { font-size:0; }
  .vc-paso .barra { height:7px; margin-bottom:0; }
  .vc-paso-texto { margin:12px 0 8px; }
  .vc-card { padding:18px 14px; border-radius:18px; }
  .vc-card h2 { font-size:19px; }
  .vc-icono { width:40px; height:40px; font-size:13px; }
  .vc-ayuda { font-size:15px; }
  .vc input, .vc select, .vc textarea { font-size:17px; padding:14px 12px; }
  .vc-opciones { grid-template-columns:repeat(2, 1fr); gap:8px; }
  .vc-opcion { font-size:16px; padding:15px 6px; }
  .vc-operadores { gap:8px; }
  .vc-operador { padding:14px 4px; border-radius:14px; }
  .vc-operador img { width:100%; max-width:88px; height:auto; aspect-ratio:1; border-radius:16px; }
  .vc-quien { font-size:15px; padding:10px 12px; }
  .vc-btn { font-size:17px; padding:16px 12px; }
  .vc-resumen { font-size:16px; }
  .vc-resumen td:first-child { width:40%; font-size:14px; }
  .vc-error { font-size:16px; padding:12px 14px; }
}
`

function Campo({ label, opcional, children }) {
  return (
    <div className="vc-campo">
      <label>{label} {opcional && <span className="opc">(opcional)</span>}</label>
      {children}
    </div>
  )
}

function Opciones({ valor, opciones, onChange }) {
  return (
    <div className="vc-opciones">
      {opciones.map(o => {
        const [v, t] = Array.isArray(o) ? o : [o, o]
        return <button type="button" key={v} className={'vc-opcion' + (valor === v ? ' sel' : '')} onClick={() => onChange(v)}>{t}</button>
      })}
    </div>
  )
}

// Cómo se le muestra el estado de su venta al vendedor
const ESTADOS_MALOS = ['CORTA_LLAMADA','FRAUDE','NO_DESEA','NO_CONTESTA','BUZON_VOZ','MALA_OFERTA','SERVICIO_ACTIVO','CAIDA','RECHAZADO','RECHAZO_CAMPO','ANULADO']
function estadoParaVendedor(v) {
  const e = v.estado
  if (e === 'ENVIANDO') return { texto:'ENVIANDO', bg:'#f3f4f6', color:'#374151', nota:true }
  if (e === 'VENTA') return { texto:'EN VALIDACIÓN', bg:'#eff6ff', color:'#1d4ed8' }
  if (e === 'VALIDADO') return { texto: v.grabacion === 'grabado' ? 'VALIDADA Y GRABADA' : 'VALIDADA', bg:'#ecfdf5', color:'#047857' }
  if (e === 'INSTALADO') return { texto:'INSTALADA', bg:'#ecfdf5', color:'#047857' }
  if (e === 'PROGRAMADO') return { texto:'PROGRAMADA', bg:'#f5f3ff', color:'#6d28d9' }
  if (e === 'CORREGIR') return { texto:'CORREGIR', bg:'#fffbeb', color:'#b45309', nota:true }
  if (ESTADOS_MALOS.includes(e)) return { texto:e.replace(/_/g, ' '), bg:'#fef2f2', color:'#b91c1c', nota:true }
  return { texto:e.replace(/_/g, ' '), bg:'#f3f4f6', color:'#374151' }
}

function MisVentas({ ventas, cargando, error, aviso, filtro, setFiltro, onRecargar, onVolver }) {
  const [dia, setDia] = useState('') // yyyy-mm-dd; vacío = todos los días
  const hoy = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const delDia = (ventas || []).filter(v => !dia || String(v.fecha || '').startsWith(dia))
  const lista = delDia.filter(v => filtro === 'TODAS' || v.operador === filtro)
  const cuenta = op => delDia.filter(v => op === 'TODAS' || v.operador === op).length
  return (
    <div className="vc-card">
      <button className="vc-btn vc-btn-sec vc-mv-volver" onClick={onVolver}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18, minWidth: 18 }}><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>
        Volver
      </button>
      <div className="vc-card-cab">
        <div className="vc-icono">MV</div>
        <div><h2>Mis ventas</h2><p className="vc-ayuda">Tus ventas de WIN, Claro y Perú Fibra, con su estado.</p></div>
      </div>
      <div className="vc-mv-dia">
        <label htmlFor="vc-mv-dia">Ver por día</label>
        <div className="vc-mv-dia-fila">
          <input id="vc-mv-dia" type="date" value={dia} max={hoy} onChange={e => setDia(e.target.value)} />
          <button className={'vc-mv-filtro' + (dia === hoy ? ' sel' : '')} onClick={() => setDia(hoy)}>Hoy</button>
          <button className={'vc-mv-filtro' + (!dia ? ' sel' : '')} onClick={() => setDia('')}>Todos</button>
        </div>
      </div>
      <div className="vc-mv-filtros">
        {[['TODAS', 'Todas'], ['WIN', 'WIN'], ['CLARO', 'Claro'], ['PERU FIBRA', 'Perú Fibra']].map(([id, texto]) => (
          <button key={id} className={'vc-mv-filtro' + (filtro === id ? ' sel' : '')} onClick={() => setFiltro(id)}>
            {texto}{ventas ? ` (${cuenta(id)})` : ''}
          </button>
        ))}
      </div>
      {aviso && <div className="vc-error">{aviso}</div>}
      {error ? (
        <div className="vc-error">{error}<div style={{ marginTop: 10 }}><button className="vc-btn vc-btn-pri" onClick={onRecargar}>Intentar de nuevo</button></div></div>
      ) : cargando || !ventas ? (
        <p className="vc-ayuda" style={{ margin: '10px 0 16px' }}>Cargando tus ventas…</p>
      ) : !lista.length ? (
        <p className="vc-ayuda" style={{ margin: '10px 0 16px' }}>{!ventas.length ? 'Todavía no tienes ventas registradas.' : dia ? 'No tienes ventas ese día.' : 'No tienes ventas de este operador.'}</p>
      ) : lista.map(v => {
        const e = estadoParaVendedor(v)
        return (
          <div className="vc-mv" key={v.clave}>
            <div className="vc-mv-cab">
              <img src={v.operador === 'WIN' ? '/assets/logo-win.png' : v.operador === 'PERU FIBRA' ? '/assets/logo-perufibra.png' : '/assets/logo-claro.png'} alt={v.operador} />
              <div className="vc-mv-cliente">{v.cliente || 'Sin nombre'}</div>
              <span className="vc-mv-estado" style={{ background: e.bg, color: e.color }}>{e.texto}</span>
            </div>
            <div className="vc-mv-dato"><b>Fecha:</b> {v.fecha || '—'}{v.dni ? <> · <b>Doc.:</b> {v.dni}</> : null}</div>
            {v.paquete && <div className="vc-mv-dato"><b>Paquete:</b> {v.paquete}</div>}
            {v.distrito && <div className="vc-mv-dato"><b>Distrito:</b> {v.distrito}</div>}
            {v.programada && <div className="vc-mv-dato"><b>Instalación programada:</b> {v.programada}</div>}
            {e.nota && v.nota && v.nota.trim().toUpperCase() !== e.texto && <div className="vc-mv-nota">{v.nota}</div>}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="vc-btn vc-btn-sec" style={{ flex: 1 }} onClick={onRecargar} disabled={cargando}>Actualizar</button>
        <button className="vc-btn vc-btn-pri" style={{ flex: 1 }} onClick={onVolver}>Registrar venta</button>
      </div>
    </div>
  )
}

export default function VentaClaro() {
  const [vendedor, setVendedor] = useState(leerSesionGuardada) // { sesion, nombre, vence }
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [ingresando, setIngresando] = useState(false)
  const [errorIngreso, setErrorIngreso] = useState('')
  // "Mis ventas": lo que ya registró quien ingresó
  const [vista, setVista] = useState('venta') // 'venta' | 'misventas'
  const [misVentas, setMisVentas] = useState(null)
  const [cargandoMis, setCargandoMis] = useState(false)
  const [errorMis, setErrorMis] = useState('')
  const [avisoMis, setAvisoMis] = useState('')
  const [filtroMis, setFiltroMis] = useState('TODAS')
  const [paso, setPaso] = useState(() => (leerSesionGuardada() ? P.OPERADOR : P.NOMBRE))
  // Cada venta empieza en blanco: no se guarda nada de la venta anterior
  const [f, setF] = useState(() => ({ ...VACIO }))
  const [faltan, setFaltan] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState('')
  const [listo, setListo] = useState(false)
  const [ubicando, setUbicando] = useState(false)
  const [web, setWeb] = useState('')
  // Fotos (solo WIN): no se guardan en el borrador, pesan mucho
  const [fotos, setFotos] = useState([]) // [{ id, nombre, datos (JPEG base64) }]
  const [procesandoFotos, setProcesandoFotos] = useState(false)
  const [paseFotos, setPaseFotos] = useState('')
  const [subiendoFotos, setSubiendoFotos] = useState(false)
  const [progresoFotos, setProgresoFotos] = useState({ actual: 0, total: 0 })
  const [fotosSubidas, setFotosSubidas] = useState(0)
  const [fotosFallidas, setFotosFallidas] = useState([])
  const [catalogoWin, setCatalogoWin] = useState(null) // { paquetes:{LIMA,PROVINCIA}, adicionales:{...} }
  const [errorWin, setErrorWin] = useState('')

  const esClaro = f.operador === 'CLARO'
  const esWin = f.operador === 'WIN'
  // Perú Fibra: otra compañía. Va a Grupo Futura con el formulario de WIN, pero
  // con sus propios paquetes y sin Winbox ni adicionales.
  const esPeruFibra = f.operador === 'PERU FIBRA'
  const esTipoWin = esWin || esPeruFibra

  useEffect(() => {
    document.title = 'Registrar venta'
    // Entrando por la dirección con números no se muestra la marca en la pestaña
    if (/^[0-9.]+$/.test(window.location.hostname)) {
      const icono = document.querySelector('link[rel~="icon"]')
      if (icono) icono.href = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#111827"/><path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>')
    }
  }, [])
  // Limpia el borrador que guardaban las versiones anteriores del formulario
  useEffect(() => { guardar(CLAVE_BORRADOR, null) }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [paso, listo])


  function cargarCatalogoWin() {
    setErrorWin('')
    fetch(`${API}/publico/paquetes-win`).then(r => r.json()).then(d => {
      if (!d.ok) throw new Error(d.mensaje)
      setCatalogoWin({ paquetes: d.paquetes || {}, adicionales: d.adicionales || {} })
    }).catch(() => setErrorWin('No se pudo cargar los paquetes WIN. Revisa tu internet y toca "Intentar de nuevo".'))
  }
  useEffect(() => { if (esTipoWin && !catalogoWin) cargarCatalogoWin() }, [esTipoWin]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (campo, valor) => setF(p => ({ ...p, [campo]: valor }))
  // CLARO: todo el país. WIN y Perú Fibra: la misma lista de cobertura
  const ubigeo = esClaro ? UBIGEO_CLARO : UBIGEO
  const provincias = f.departamento ? Object.keys(ubigeo[f.departamento] || {}) : []
  const distritos = f.departamento && f.provincia ? (ubigeo[f.departamento]?.[f.provincia] || []) : []
  const region = regionWin(f.departamento)
  const paquetesClaro = PAQUETES_CLARO_POR_PLAN[f.hogar] || []
  // Vivienda VERTICAL (edificio): usa la lista "Vertical" del catálogo si tiene paquetes
  const paquetesWinDe = predio => {
    if (esPeruFibra) return catalogoWin?.paquetes?.PERUFIBRA || []
    const vertical = catalogoWin?.paquetes?.VERTICAL || []
    return predio === 'VERTICAL' && vertical.length ? vertical : (catalogoWin?.paquetes?.[region] || [])
  }
  const paquetesWin = paquetesWinDe(f.predio)
  const adicionalesWin = esPeruFibra ? [] : (catalogoWin?.adicionales?.[region] || [])

  async function ingresar(e) {
    e?.preventDefault()
    if (ingresando) return
    if (!usuario.trim() || !password) { setErrorIngreso('Escribe tu usuario y tu contraseña'); return }
    setIngresando(true)
    setErrorIngreso('')
    try {
      const r = await fetch(`${API}/publico/ingresar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: usuario.trim(), password }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.mensaje || 'No se pudo ingresar. Intenta de nuevo.')
      const s = { sesion: d.sesion, nombre: d.nombre, vence: Date.now() + 11 * 60 * 60 * 1000 }
      guardar(CLAVE_SESION, s)
      setVendedor(s)
      setPassword('')
      setPaso(P.OPERADOR)
    } catch (err) {
      setErrorIngreso(err.message === 'Failed to fetch' ? 'No hay conexión a internet. Revisa tu señal e intenta de nuevo.' : err.message)
    } finally {
      setIngresando(false)
    }
  }

  async function cargarMisVentas() {
    if (cargandoMis) return
    setCargandoMis(true)
    setErrorMis('')
    try {
      const r = await fetch(`${API}/publico/mis-ventas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sesion: vendedor?.sesion }),
      })
      const d = await r.json().catch(() => ({}))
      if (d.sesionVencida) { salir(); setErrorIngreso('Tu sesión venció. Vuelve a ingresar.'); return }
      if (!r.ok || !d.ok) throw new Error(d.mensaje || 'No se pudieron cargar tus ventas.')
      setMisVentas(d.ventas || [])
      setAvisoMis(d.aviso || '')
    } catch (e) {
      setErrorMis(e.message === 'Failed to fetch' ? 'No hay conexión a internet. Revisa tu señal e intenta de nuevo.' : e.message)
    } finally {
      setCargandoMis(false)
    }
  }
  function abrirMisVentas() {
    setVista('misventas')
    window.scrollTo(0, 0)
    cargarMisVentas()
  }

  function salir(conservarVenta = false) {
    if (conservarVenta !== true) { setF({ ...VACIO }); setFotos([]) }
    setVista('venta')
    setMisVentas(null)
    guardar(CLAVE_SESION, null)
    setVendedor(null)
    setUsuario('')
    setPassword('')
    setFaltan([])
    setPaso(P.NOMBRE)
  }

  // Cambiar de operador limpia los datos del servicio (son formularios distintos)
  function elegirOperador(op) {
    if (f.operador !== op) setFotos([])
    // La lista de departamentos también cambia con el operador
    setF(p => p.operador === op ? p : { ...p, ...DATOS_SERVICIO, departamento: '', provincia: '', distrito: '', operador: op })
    setFaltan([])
    setPaso(P.CLIENTE)
  }

  // En WIN el departamento decide la región (Lima / Provincia) y con ella los paquetes
  function elegirDepartamento(dpto) {
    setF(p => {
      const cambiaRegion = p.operador === 'WIN' && regionWin(p.departamento) !== regionWin(dpto)
      return { ...p, departamento: dpto, provincia: '', distrito: '', ...(cambiaRegion ? { paquete: '', adicionales: [], cuotaInstalacion: '' } : {}) }
    })
  }

  function alternarAdicional(id) {
    setF(p => ({ ...p, adicionales: p.adicionales.includes(id) ? p.adicionales.filter(a => a !== id) : [...p.adicionales, id] }))
  }

  function siguiente() {
    const req = faltantes(paso, f)
    setFaltan(req)
    if (req.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setPaso(p => p + 1)
  }
  function atras() { setFaltan([]); setErrorEnvio(''); setPaso(p => Math.max(P.OPERADOR, p - 1)) }

  // Sin candado (entrando por la dirección con números) el navegador no deja
  // leer el GPS: el vendedor abre Google Maps, copia el enlace de su ubicación
  // y lo pega; el servidor lo convierte en coordenadas.
  const gpsDirecto = typeof window !== 'undefined' && window.isSecureContext
  const [textoMaps, setTextoMaps] = useState('')
  const [leyendoMaps, setLeyendoMaps] = useState(false)
  const [errorMaps, setErrorMaps] = useState('')
  async function leerDeMaps(valor) {
    const texto = String(valor ?? textoMaps).trim()
    if (!texto || leyendoMaps) return
    setLeyendoMaps(true)
    setErrorMaps('')
    try {
      const r = await fetch(`${API}/publico/coordenadas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.ok) throw new Error(d.mensaje || 'No se pudo leer la ubicación.')
      setF(p => ({ ...p, coordenadas: d.coordenadas }))
      setTextoMaps('')
    } catch (e) {
      setErrorMaps(e.message === 'Failed to fetch' ? 'No hay conexión a internet. Revisa tu señal e intenta de nuevo.' : e.message)
    } finally {
      setLeyendoMaps(false)
    }
  }

  function usarUbicacion() {
    if (!navigator.geolocation) return alert('Este celular no permite obtener la ubicación. Escribe las coordenadas.')
    setUbicando(true)
    navigator.geolocation.getCurrentPosition(
      pos => { set('coordenadas', `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`); setUbicando(false) },
      () => { setUbicando(false); alert('No se pudo obtener la ubicación. Activa el GPS y da permiso, o escribe las coordenadas.') },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  async function enviar() {
    if (enviando) return
    for (const p of [P.OPERADOR, P.CLIENTE, P.DIRECCION, P.SERVICIO]) {
      const req = faltantes(p, f)
      if (req.length) { setPaso(p); setFaltan(req); return }
    }
    setEnviando(true)
    setErrorEnvio('')
    try {
      const venta = esTipoWin
        ? { ...f, fechaNac: '', lugarNac: '', padre: '', madre: '', hogar: '', tec: '', full: '', plano: '',
            cuotaInstalacion: esWin && esRuc20(f.paquete) ? f.cuotaInstalacion : '',
            ...(esPeruFibra ? { cantDecos: '0', adicionales: [], predio: '' } : {}) }
        : { ...f, adicionales: [] }
      const r = await fetch(`${API}/publico/venta`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operador: f.operador, sesion: vendedor?.sesion, venta, web }),
      })
      const d = await r.json().catch(() => ({}))
      if (d.sesionVencida) {
        // Lo escrito se conserva en pantalla: al volver a ingresar sigue ahí
        salir(true)
        setErrorIngreso('Tu sesión venció. Vuelve a ingresar; los datos de la venta no se pierden.')
        return
      }
      if (!r.ok || !d.ok) throw new Error(d.mensaje || 'No se pudo guardar la venta. Intenta de nuevo.')
      setListo(true)
      // La venta ya quedó guardada; las fotos (solo WIN) se suben después, una por una
      if (esTipoWin && d.paseFotos && fotos.length) {
        setPaseFotos(d.paseFotos)
        subirFotos(d.paseFotos, fotos)
      }
    } catch (e) {
      setErrorEnvio(e.message === 'Failed to fetch' ? 'No hay conexión a internet. Revisa tu señal e intenta de nuevo.' : e.message)
    } finally {
      setEnviando(false)
    }
  }

  async function agregarFotos(archivos) {
    const lista = Array.from(archivos || []).slice(0, MAX_FOTOS - fotos.length)
    if (!lista.length) return
    setProcesandoFotos(true)
    const nuevas = []
    for (const archivo of lista) {
      try {
        const datos = await comprimirFoto(archivo)
        nuevas.push({ id: `${Date.now()}-${Math.random()}`, nombre: archivo.name || 'foto.jpg', datos })
      } catch {
        alert(`No se pudo leer la foto "${archivo.name || ''}". Prueba con otra.`)
      }
    }
    setFotos(prev => [...prev, ...nuevas].slice(0, MAX_FOTOS))
    setProcesandoFotos(false)
  }

  async function subirFotos(pase, pendientes) {
    setSubiendoFotos(true)
    let fallidas = []
    for (let i = 0; i < pendientes.length; i++) {
      setProgresoFotos({ actual: i + 1, total: pendientes.length })
      const foto = pendientes[i]
      try {
        const r = await fetch(`${API}/publico/venta-foto`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pase, nombre: foto.nombre, datos: foto.datos }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok || !d.ok) throw new Error(d.mensaje)
        setFotosSubidas(n => n + 1)
      } catch {
        fallidas.push(foto)
      }
    }
    setFotosFallidas(fallidas)
    setSubiendoFotos(false)
  }

  function otraVenta() {
    setFotos([])
    setPaseFotos('')
    setFotosSubidas(0)
    setFotosFallidas([])
    setF({ ...VACIO })
    setListo(false)
    setFaltan([])
    setPaso(P.OPERADOR)
  }

  const resumen = [
    ['Vendedor', vendedor?.nombre],
    ['Operador', f.operador],
    ['Cliente', f.nombre], ['Documento', `${f.tipoDoc} ${f.dni}`],
    ...(esClaro ? [['Fecha de nacimiento', f.fechaNac], ['Lugar de nacimiento', f.lugarNac], ['Padre', f.padre], ['Madre', f.madre]] : []),
    ['Teléfono', f.telefono1], ['Teléfono de referencia', f.telefono2 || '—'], ['Correo', f.email],
    ['Ubicación', [f.departamento, f.provincia, f.distrito].filter(Boolean).join(' / ')], ['Dirección', f.direccion],
    ['Coordenadas', f.coordenadas],
    ...(esClaro ? [
      ['Cuota de instalación', f.cuotaInstalacion], ['Claro Hogar', f.hogar], ['Paquete', f.paquete],
      ['Tipo de vivienda', VIVIENDAS.find(x => x[0] === f.predio)?.[1] || f.predio],
      ['Tecnología', f.tec], ['Full Claro', f.full], ['Decos', f.cantDecos], ['Mesh', f.cantMesh], ['Plano', f.plano],
    ] : [
      ...(esWin ? [['Región', region]] : []),
      ...(esWin ? [['Tipo de vivienda', VIVIENDAS.find(x => x[0] === f.predio)?.[1] || f.predio]] : []), ['Paquete', f.paquete],
      ...(esWin && esRuc20(f.paquete) ? [['Costo de instalación', `S/ ${f.cuotaInstalacion}`]] : []),
      ...(esWin ? [['Winbox', f.cantDecos]] : []), ['Mesh', f.cantMesh],
      ...(esWin ? [['Adicionales', f.adicionales.join(', ') || '—']] : []),
      ['Fotos', fotos.length ? `${fotos.length} foto${fotos.length === 1 ? '' : 's'}` : 'Ninguna'],
    ]),
    ['Observación', f.obs || '—'],
  ]

  return (
    <div className="vc">
      <style>{ESTILOS + ESTILOS_OPERADOR}</style>

      <div className="vc-main">
        {vista === 'misventas' && vendedor ? (
          <MisVentas ventas={misVentas} cargando={cargandoMis} error={errorMis} aviso={avisoMis}
            filtro={filtroMis} setFiltro={setFiltroMis} onRecargar={cargarMisVentas} onVolver={() => setVista('venta')} />
        ) : listo ? (
          <div className="vc-card vc-ok">
            <div className="icono">✓</div>
            <h2>¡Venta enviada!</h2>
            <p className="vc-ayuda" style={{ fontSize: 19 }}>
              La venta <b>{f.operador}</b> de <b>{f.nombre}</b> quedó registrada a nombre de <b>{vendedor?.nombre}</b>
              {esClaro ? ' y pasó a Validación.' : '.'}
            </p>
            {paseFotos && (
              subiendoFotos ? (
                <div className="vc-region" style={{ fontSize: 19 }}>Subiendo fotos {progresoFotos.actual} de {progresoFotos.total}… <b>No cierres la página.</b></div>
              ) : fotosFallidas.length ? (
                <div className="vc-error">
                  Se subieron {fotosSubidas} foto{fotosSubidas === 1 ? '' : 's'}, pero {fotosFallidas.length} no se pudo subir. Revisa tu internet.
                  <div style={{ marginTop: 10 }}><button className="vc-btn vc-btn-pri" onClick={() => subirFotos(paseFotos, fotosFallidas)}>Reintentar fotos</button></div>
                </div>
              ) : (
                <div className="vc-region" style={{ fontSize: 19 }}>✓ Se subieron {fotosSubidas} foto{fotosSubidas === 1 ? '' : 's'}.</div>
              )
            )}
            <button className="vc-btn vc-btn-pri" style={{ width: '100%' }} onClick={otraVenta} disabled={subiendoFotos}>Registrar otra venta</button>
            <button className="vc-btn vc-btn-sec" style={{ width: '100%', marginTop: 10 }} onClick={() => { otraVenta(); abrirMisVentas() }} disabled={subiendoFotos}>Ver mis ventas</button>
          </div>
        ) : (<>
          <div className="vc-pasos">
            {PASOS.map((t, i) => (
              <div key={t} className={'vc-paso' + (i < paso ? ' hecho' : i === paso ? ' actual' : '')}>
                <div className="barra" />{t}
              </div>
            ))}
          </div>
          <div className="vc-paso-texto">Paso {paso + 1} de {PASOS.length} · {PASOS[paso]}</div>

          {paso > P.NOMBRE && vendedor && (
            <div className="vc-quien">
              <span>Vendedor: <b>{vendedor.nombre}</b>{f.operador && paso > P.OPERADOR && <> · <b>{f.operador}</b></>}</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button className="vc-btn vc-btn-sec" style={{ fontSize: 16, padding: '8px 14px', color: '#111827', borderColor: '#111827' }} onClick={abrirMisVentas}>Mis ventas</button>
                <button className="vc-btn vc-btn-sec" style={{ fontSize: 16, padding: '8px 14px' }} onClick={() => salir()}>Salir</button>
              </span>
            </div>
          )}

          {faltan.length > 0 && (
            <div className="vc-error">
              <b>Falta completar:</b>
              <ul>{faltan.map(x => <li key={x}>{x}</li>)}</ul>
            </div>
          )}

          {paso === P.NOMBRE && (
            <div className="vc-card">
              <div className="vc-card-cab">
                <div className="vc-icono">{paso + 1}</div>
                <div><h2>Ingresa</h2><p className="vc-ayuda">Con tu usuario y contraseña de siempre. La venta se guardará a tu nombre.</p></div>
              </div>
              <form onSubmit={ingresar}>
                {errorIngreso && <div className="vc-error">{errorIngreso}</div>}
                <div className="vc-campo">
                  <label htmlFor="vc-usuario">Usuario</label>
                  <input id="vc-usuario" value={usuario} onChange={e => { setUsuario(e.target.value); setErrorIngreso('') }}
                    autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="Tu usuario" />
                </div>
                <div className="vc-campo">
                  <label htmlFor="vc-password">Contraseña</label>
                  <div className="vc-pass">
                    <input id="vc-password" type={verPassword ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); setErrorIngreso('') }}
                      autoComplete="current-password" placeholder="Tu contraseña" />
                    <button type="button" onClick={() => setVerPassword(v => !v)}>{verPassword ? 'Ocultar' : 'Ver'}</button>
                  </div>
                </div>
                <button type="submit" className="vc-btn vc-btn-pri" style={{ width: '100%' }} disabled={ingresando}>{ingresando ? 'Ingresando…' : 'Ingresar'}</button>
                <p className="vc-ayuda" style={{ fontSize: 15, marginTop: 14, textAlign: 'center' }}>Si olvidaste tu contraseña, avisa a tu supervisor.</p>
              </form>
            </div>
          )}

          {paso === P.OPERADOR && (
            <div className="vc-card">
              <div className="vc-card-cab">
                <div className="vc-icono">{paso + 1}</div>
                <div><h2>¿De qué operador es la venta?</h2><p className="vc-ayuda">Toca el logo del operador.</p></div>
              </div>
              <div className="vc-operadores">
                <button className={'vc-operador win' + (esWin ? ' sel' : '')} onClick={() => elegirOperador('WIN')} aria-label="WIN">
                  <img src="/assets/logo-win.png" alt="WIN" />
                </button>
                <button className={'vc-operador claro' + (esClaro ? ' sel' : '')} onClick={() => elegirOperador('CLARO')} aria-label="CLARO">
                  <img src="/assets/logo-claro.png" alt="CLARO" />
                </button>
                <button className={'vc-operador perufibra' + (esPeruFibra ? ' sel' : '')} onClick={() => elegirOperador('PERU FIBRA')} aria-label="Perú Fibra">
                  <img src="/assets/logo-perufibra.png" alt="Perú Fibra" />
                </button>
              </div>
              {/* Acceso grande a las ventas ya registradas */}
              <button className="vc-btn vc-btn-sec" style={{ width: '100%', marginTop: 16, color: '#111827', borderColor: '#111827' }} onClick={abrirMisVentas}>Ver mis ventas</button>
            </div>
          )}

          {paso === P.CLIENTE && (
            <div className="vc-card">
              <div className="vc-card-cab">
                <div className="vc-icono">{paso + 1}</div>
                <div><h2>Datos del cliente</h2><p className="vc-ayuda">Escribe los datos tal como están en su documento.</p></div>
              </div>
              <Campo label="Nombres y apellidos"><input value={f.nombre} onChange={e => set('nombre', e.target.value.toUpperCase())} autoComplete="off" /></Campo>
              <Campo label="Tipo de documento"><Opciones valor={f.tipoDoc} opciones={TIPOS_DOC} onChange={v => set('tipoDoc', v)} /></Campo>
              <Campo label="Número de documento"><input inputMode="numeric" value={f.dni} onChange={e => set('dni', e.target.value.replace(/\D/g, '').slice(0, 15))} autoComplete="off" /></Campo>
              {esClaro && (<>
                <Campo label="Fecha de nacimiento"><input type="date" value={f.fechaNac} max={new Date().toISOString().slice(0, 10)} onChange={e => set('fechaNac', e.target.value)} /></Campo>
                <Campo label="Lugar de nacimiento"><input value={f.lugarNac} onChange={e => set('lugarNac', e.target.value.toUpperCase())} placeholder="Ciudad o región" /></Campo>
                <Campo label="Nombre del padre"><input value={f.padre} onChange={e => set('padre', e.target.value.toUpperCase())} /></Campo>
                <Campo label="Nombre de la madre"><input value={f.madre} onChange={e => set('madre', e.target.value.toUpperCase())} /></Campo>
              </>)}
            </div>
          )}

          {paso === P.DIRECCION && (
            <div className="vc-card">
              <div className="vc-card-cab">
                <div className="vc-icono">{paso + 1}</div>
                <div><h2>Contacto y dirección</h2><p className="vc-ayuda">Dónde se instalará el servicio.</p></div>
              </div>
              <Campo label="Teléfono de contacto"><input type="tel" inputMode="numeric" value={f.telefono1} onChange={e => set('telefono1', e.target.value.replace(/\D/g, '').slice(0, 15))} placeholder="9XXXXXXXX" /></Campo>
              <Campo label="Teléfono de referencia" opcional><input type="tel" inputMode="numeric" value={f.telefono2} onChange={e => set('telefono2', e.target.value.replace(/\D/g, '').slice(0, 15))} placeholder="9XXXXXXXX" /></Campo>
              <Campo label="Correo electrónico"><input type="email" inputMode="email" value={f.email} onChange={e => set('email', e.target.value.trim())} placeholder="cliente@correo.com" autoCapitalize="none" /></Campo>
              <Campo label="Departamento">
                <select value={f.departamento} onChange={e => elegirDepartamento(e.target.value)}>
                  <option value="">Elegir departamento</option>
                  {Object.keys(ubigeo).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Campo>
              <Campo label="Provincia">
                <select value={f.provincia} disabled={!f.departamento} onChange={e => setF(p => ({ ...p, provincia: e.target.value, distrito: '' }))}>
                  <option value="">{f.departamento ? 'Elegir provincia' : 'Primero elige el departamento'}</option>
                  {provincias.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Campo>
              <Campo label="Distrito">
                <select value={f.distrito} disabled={!f.provincia} onChange={e => set('distrito', e.target.value)}>
                  <option value="">{f.provincia ? 'Elegir distrito' : 'Primero elige la provincia'}</option>
                  {distritos.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Campo>
              <Campo label="Dirección"><textarea value={f.direccion} onChange={e => set('direccion', e.target.value.toUpperCase())} placeholder="Calle, número, referencia" style={{ minHeight: 90 }} /></Campo>
              <Campo label="Coordenadas">
                {gpsDirecto ? (
                  <button type="button" className="vc-btn vc-btn-ubic" onClick={usarUbicacion} disabled={ubicando}>{ubicando ? 'Buscando ubicación…' : 'Usar mi ubicación'}</button>
                ) : (
                  <div className="vc-maps">
                    <a className="vc-btn vc-btn-ubic vc-maps-abrir" href="https://www.google.com/maps/@?api=1&map_action=map" target="_blank" rel="noopener noreferrer">Abrir Google Maps</a>
                    <ol>
                      <li>En Maps, <b>mantén presionado</b> el punto exacto de la casa.</li>
                      <li>Toca <b>Compartir</b> y luego <b>Copiar</b>.</li>
                      <li>Vuelve aquí, <b>pega</b> en el cuadro de abajo y toca <b>Listo</b>.</li>
                    </ol>
                    <div className="vc-maps-fila">
                      <input value={textoMaps} placeholder="Pega aquí lo que copiaste de Maps"
                        onChange={e => { setTextoMaps(e.target.value); setErrorMaps('') }}
                        onPaste={e => { const t = e.clipboardData?.getData('text'); if (t) { e.preventDefault(); setTextoMaps(t); leerDeMaps(t) } }}
                        onKeyDown={e => { if (e.key === 'Enter') leerDeMaps() }} />
                      <button type="button" className="vc-btn vc-btn-pri" onClick={() => leerDeMaps()} disabled={leyendoMaps || !textoMaps.trim()}>{leyendoMaps ? 'Leyendo…' : 'Listo'}</button>
                    </div>
                    {errorMaps && <div className="vc-error" style={{ marginTop: 10, marginBottom: 0 }}>{errorMaps}</div>}
                  </div>
                )}
                {f.coordenadas && !gpsDirecto && <div className="vc-maps-ok">Ubicación lista</div>}
                <input value={f.coordenadas} onChange={e => set('coordenadas', e.target.value)} placeholder="-12.000000, -77.000000" />
              </Campo>
            </div>
          )}

          {paso === P.SERVICIO && esClaro && (
            <div className="vc-card">
              <div className="vc-card-cab">
                <div className="vc-icono">{paso + 1}</div>
                <div><h2>Servicio CLARO</h2><p className="vc-ayuda">Lo que contrató el cliente.</p></div>
              </div>
              <Campo label="Cuota de instalación"><Opciones valor={f.cuotaInstalacion} opciones={CUOTAS} onChange={v => set('cuotaInstalacion', v)} /></Campo>
              <Campo label="Claro Hogar (plan)">
                <select value={f.hogar} onChange={e => setF(p => ({ ...p, hogar: e.target.value, paquete: '' }))}>
                  <option value="">Elegir plan</option>
                  {Object.keys(PAQUETES_CLARO_POR_PLAN).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Campo>
              <Campo label="Paquete">
                <select value={f.paquete} disabled={!f.hogar} onChange={e => set('paquete', e.target.value)}>
                  <option value="">{f.hogar ? 'Elegir paquete' : 'Primero elige el plan'}</option>
                  {paquetesClaro.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Campo>
              <Campo label="Tipo de vivienda"><Opciones valor={f.predio} opciones={VIVIENDAS} onChange={v => set('predio', v)} /></Campo>
              <Campo label="Tecnología"><Opciones valor={f.tec} opciones={TECNOLOGIAS} onChange={v => set('tec', v)} /></Campo>
              <Campo label="Full Claro"><Opciones valor={f.full} opciones={[['Si', 'Sí'], ['No', 'No']]} onChange={v => set('full', v)} /></Campo>
              <Campo label="Cantidad de decos"><Opciones valor={f.cantDecos} opciones={CANTIDADES} onChange={v => set('cantDecos', v)} /></Campo>
              <Campo label="Cantidad de mesh"><Opciones valor={f.cantMesh} opciones={CANTIDADES} onChange={v => set('cantMesh', v)} /></Campo>
              <Campo label="Plano"><input value={f.plano} onChange={e => set('plano', e.target.value.toUpperCase())} placeholder="Código de plano" /></Campo>
              <Campo label="Observación" opcional><textarea value={f.obs} onChange={e => set('obs', e.target.value)} placeholder="Escribe aquí cualquier detalle de la venta" /></Campo>
            </div>
          )}

          {paso === P.SERVICIO && esTipoWin && (
            <div className="vc-card">
              <div className="vc-card-cab">
                <div className="vc-icono">{paso + 1}</div>
                <div><h2>{esPeruFibra ? 'Servicio Perú Fibra' : 'Servicio WIN'}</h2><p className="vc-ayuda">Lo que contrató el cliente.</p></div>
              </div>
              {esWin && <div className="vc-region">Región: <b>{region === 'LIMA' ? 'Lima' : 'Provincia'}</b></div>}
              {errorWin ? (
                <div className="vc-error">{errorWin}<div style={{ marginTop: 10 }}><button className="vc-btn vc-btn-pri" onClick={cargarCatalogoWin}>Intentar de nuevo</button></div></div>
              ) : !catalogoWin ? (
                <p className="vc-ayuda">Cargando paquetes…</p>
              ) : (<>
                {esWin && <Campo label="Tipo de vivienda"><Opciones valor={f.predio} opciones={VIVIENDAS}
                  onChange={v => setF(p => ({ ...p, predio: v, ...(paquetesWinDe(v).includes(p.paquete) ? {} : { paquete: '', cuotaInstalacion: '' }) }))} /></Campo>}
                <Campo label="Paquete">
                  <select value={f.paquete} onChange={e => setF(p => ({ ...p, paquete: e.target.value, cuotaInstalacion: esRuc20(e.target.value) ? p.cuotaInstalacion : '' }))}>
                    <option value="">Elegir paquete</option>
                    {paquetesWin.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Campo>
                {esWin && esRuc20(f.paquete) && (
                  <Campo label="Costo de instalación (S/)">
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={f.cuotaInstalacion} onChange={e => set('cuotaInstalacion', e.target.value)} placeholder="Ej. 150.00" />
                  </Campo>
                )}
                {esWin && <Campo label="Cantidad de Winbox"><Opciones valor={f.cantDecos} opciones={CANTIDADES} onChange={v => set('cantDecos', v)} /></Campo>}
                <Campo label="Cantidad de mesh"><Opciones valor={f.cantMesh} opciones={CANTIDADES} onChange={v => set('cantMesh', v)} /></Campo>
                {adicionalesWin.length > 0 && (
                  <Campo label="Adicionales" opcional>
                    <div className="vc-opciones">
                      {adicionalesWin.map(a => (
                        <button type="button" key={a} className={'vc-opcion' + (f.adicionales.includes(a) ? ' sel' : '')} onClick={() => alternarAdicional(a)}>{f.adicionales.includes(a) ? '✓ ' : ''}{a}</button>
                      ))}
                    </div>
                  </Campo>
                )}
                <Campo label="Observación" opcional><textarea value={f.obs} onChange={e => set('obs', e.target.value)} placeholder="Escribe aquí cualquier detalle de la venta" /></Campo>
                <Campo label={`Fotos (${fotos.length} de ${MAX_FOTOS})`} opcional>
                  {fotos.length > 0 && (
                    <div className="vc-fotos">
                      {fotos.map(foto => (
                        <div className="vc-foto" key={foto.id}>
                          <img src={`data:image/jpeg;base64,${foto.datos}`} alt={foto.nombre} />
                          <button type="button" onClick={() => setFotos(prev => prev.filter(x => x.id !== foto.id))}>Quitar</button>
                        </div>
                      ))}
                    </div>
                  )}
                  {fotos.length < MAX_FOTOS && (
                    <label className={'vc-btn vc-btn-ubic vc-btn-foto' + (procesandoFotos ? ' ocupado' : '')}>
                      {procesandoFotos ? 'Preparando fotos…' : 'Agregar fotos'}
                      <input type="file" accept="image/*" multiple disabled={procesandoFotos}
                        onChange={e => { agregarFotos(e.target.files); e.target.value = '' }} />
                    </label>
                  )}
                </Campo>
              </>)}
            </div>
          )}

          {paso === P.REVISAR && (
            <div className="vc-card">
              <div className="vc-card-cab">
                <div className="vc-icono">{paso + 1}</div>
                <div><h2>Revisa antes de enviar</h2><p className="vc-ayuda">Si algo está mal, toca "Atrás" para corregirlo.</p></div>
              </div>
              {errorEnvio && <div className="vc-error">{errorEnvio}</div>}
              <table className="vc-resumen"><tbody>
                {resumen.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v || '—'}</td></tr>)}
              </tbody></table>
            </div>
          )}

          {/* Campo trampa para robots: las personas no lo ven */}
          <div className="vc-oculto" aria-hidden="true">
            <input tabIndex={-1} autoComplete="off" value={web} onChange={e => setWeb(e.target.value)} name="web" />
          </div>
        </>)}
      </div>

      {vista === 'venta' && !listo && paso > P.OPERADOR && (
        <div className="vc-barra-abajo">
          <div className="dentro">
            <button className="vc-btn vc-btn-sec" onClick={atras} disabled={enviando}>Atrás</button>
            {paso < P.REVISAR
              ? <button className="vc-btn vc-btn-pri" onClick={siguiente}>Siguiente</button>
              : <button className="vc-btn vc-btn-pri" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar venta'}</button>}
          </div>
        </div>
      )}
    </div>
  )
}
