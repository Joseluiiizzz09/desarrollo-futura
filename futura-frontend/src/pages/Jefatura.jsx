import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import MediaViewer from '../components/MediaViewer'
import { HistorialVentaModal, ReasignarVentaModal } from '../components/VentaAssignmentModal'
import { VentaEditarModal } from '../components/VentaEditarModal'
import { VentaProgramarModal } from '../components/VentaProgramarModal'
import ObsSeguimientoCell from '../components/ObsSeguimientoCell'
import ProgramacionInfoCell from '../components/ProgramacionInfoCell'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import CanalBadge from '../components/CanalBadge'
import RangoFechasPicker from '../components/RangoFechasPicker'
import { API, ncHeaders } from '../services/api'
import { permisosDeUsuario, usuarioTieneCargo } from '../utils/roles'
import { CAMPANAS } from '../utils/campanas'
import { responseChanged, setVisibleInterval, clearVisibleInterval } from '../utils/polling'
import Chart from 'chart.js/auto'
import * as XLSX from 'xlsx'
import '../styles/jefatura.css'

/* ── constantes ── */
const JEF_APARTADO_KEY     = 'nc_jefatura_apartado'
const JEF_SALA_REPORTE_KEY = 'nc_jefatura_sala_reporte'
const JEF_SEG_FILTRO_KEY   = 'nc_jefatura_seg_filtro'

const CARGOS = [
  { id:'asesor',         label:'Asesor',           cls:'bc-asesor'         },
  { id:'supervisor',     label:'Supervisor',        cls:'bc-supervisor'     },
  { id:'backoffice',     label:'Back Data',         cls:'bc-backoffice'     },
  { id:'validacion',     label:'Validación',        cls:'bc-validacion'     },
  { id:'grabaciones',    label:'Grabaciones',       cls:'bc-grabaciones'    },
  { id:'seguimiento',    label:'Seguimiento',       cls:'bc-seguimiento'    },
  { id:'jefatura',       label:'Jefatura',          cls:'bc-jefatura'       },
  { id:'usuarios',       label:'Usuarios',          cls:'bc-usuarios'       },
  { id:'programacion',   label:'Programación',      cls:'bc-programacion'   },
  { id:'cobranzas',      label:'Cobranzas',         cls:'bc-cobranzas'      },
  { id:'calidad',        label:'Calidad',           cls:'bc-calidad'        },
  { id:'supcalidad',     label:'Super de Calidad',  cls:'bc-calidad'        },
  { id:'supgrabaciones', label:'Sup. Grabaciones',  cls:'bc-supgrabaciones' },
  { id:'backreclutamiento',   label:'Back Data Reclutaminto',  cls:'bc-backreclutamiento'   },
  { id:'entrevistas',   label:'Entrevistas',   cls:'bc-entrevistas'   },
  { id:'capacitador',   label:'Capacitación',  cls:'bc-capacitador'   },
  { id:'marketing',     label:'Marketing',     cls:'bc-marketing'     },
]
const SALAS = ['SALA 1','SALA 2','CAMPO']
const TIPIFICACIONES_ENTREVISTA = ['NO CONTESTA','DESISTE','REPROGRAMA','CORTA LLAMADA','ASISTE','EN CAMINO','FALTA']
const TURNOS_ENTREVISTA = ['TURNO 1','TURNO 2']

const SEG_MAP = {
  en_ejecucion:'ejecucion',
  instalado:'instalado',caida:'caida',rechazo_campo:'rechazo',tecnico_casa:'tecnico',
  levantar_sot:'levantar_sot', tecnicos_camino:'tecnicos_camino',
  instalado_no_validado:'instalado_no_validado', reasignacion:'reasignacion',
  derivado_planta_externa:'derivado_planta_externa', servicio_activo:'servicio_activo',
}
// Colores idénticos al resultado final real de seguimiento.css (cascada de
// .bs-ejec/.bs-inst/.bs-rech/.bs-caida/.bs-tecnico + overrides !important en
// .leyenda-item.l-*, que son los que realmente ganan en /seguimiento).
const SEG_BADGES = {
  ejecucion:{ label:'EN EJECUCIÓN',    bg:'#ecfdf5', color:'#047857', border:'rgba(52,211,153,.35)'  },
  instalado:{ label:'INSTALADO',       bg:'#eff6ff', color:'#2563eb', border:'rgba(96,165,250,.35)'  },
  rechazo:  { label:'RECHAZO CAMPO',   bg:'#fff7ed', color:'#c2410c', border:'rgba(251,146,60,.38)'  },
  caida:    { label:'CAÍDA',           bg:'#fee2e2', color:'#b91c1c', border:'rgba(248,113,113,.35)' },
  tecnico:  { label:'TÉCNICO EN CASA', bg:'#fce7f3', color:'#be185d', border:'rgba(244,114,182,.45)' },
  levantar_sot:{ label:'LEVANTAR SOT', bg:'#fff7ed', color:'#c2410c', border:'rgba(251,146,60,.38)' },
  tecnicos_camino:{ label:'TÉCNICOS EN CAMINO', bg:'#fce7f3', color:'#be185d', border:'rgba(244,114,182,.45)' },
  instalado_no_validado:{ label:'INSTALADO NO VALIDADO', bg:'#eff6ff', color:'#2563eb', border:'rgba(96,165,250,.35)' },
  reasignacion:{ label:'REASIGNACIÓN', bg:'#ecfdf5', color:'#047857', border:'rgba(52,211,153,.35)' },
  derivado_planta_externa:{ label:'DERIVADO A PLANTA EXTERNA', bg:'#fff7ed', color:'#c2410c', border:'rgba(251,146,60,.38)' },
  servicio_activo:{ label:'SERVICIO ACTIVO', bg:'#f3f4f6', color:'#1f2937', border:'rgba(156,163,175,.45)' },
}
const SEG_ORD = { caida:0, rechazo:1, levantar_sot:2, derivado_planta_externa:3, tecnico:4, tecnicos_camino:5, reasignacion:6, ejecucion:7, instalado_no_validado:8, servicio_activo:9, instalado:10 }

const PROG_STYLES = {
  PROGRAMADO:       { bg:'#dcfce7',color:'#15803d',border:'rgba(74,222,128,.4)'  },
  BLOQUEADO:        { bg:'#fee2e2',color:'#991b1b',border:'rgba(248,113,113,.4)' },
  RECHAZADO:        { bg:'#ffedd5',color:'#9a3412',border:'rgba(251,146,60,.4)'  },
  SIN_AGENDA:       { bg:'#fef9c3',color:'#854d0e',border:'rgba(250,204,21,.4)'  },
  CARACTER_ESPECIAL:{ bg:'#ede9fe',color:'#5b21b6',border:'rgba(167,139,250,.4)' },
  FRAUDE:           { bg:'#1f2937',color:'#f9fafb',border:'rgba(75,85,99,.4)'    },
  ZONA_RESTRINGIDA: { bg:'#ffedd5',color:'#9a3412',border:'rgba(251,146,60,.4)'  },
  PENDIENTE:        { bg:'#f3f4f6',color:'#6b7280',border:'rgba(156,163,175,.4)' },
  EN_EJECUCION:     { bg:'#dbeafe',color:'#1e3a8a',border:'rgba(96,165,250,.4)'  },
  INSTALADO:        { bg:'#dcfce7',color:'#15803d',border:'rgba(74,222,128,.4)'  },
  INSTALADO_NO_VALIDADO:{ bg:'#dcfce7',color:'#15803d',border:'rgba(74,222,128,.4)' },
  CAIDA:            { bg:'#fee2e2',color:'#991b1b',border:'rgba(248,113,113,.4)' },
  TECNICO_CASA:     { bg:'#e0f2fe',color:'#075985',border:'rgba(56,189,248,.4)'  },
  TECNICOS_CAMINO:  { bg:'#e0f2fe',color:'#075985',border:'rgba(56,189,248,.4)'  },
  REASIGNACION:     { bg:'#fef9c3',color:'#854d0e',border:'rgba(250,204,21,.4)'  },
  RECHAZO_CAMPO:    { bg:'#fee2e2',color:'#991b1b',border:'rgba(248,113,113,.4)' },
  RECHAZO_MESA:     { bg:'#fee2e2',color:'#991b1b',border:'rgba(248,113,113,.4)' },
}
function estadoProg(raw) {
  const s = (raw || '').toUpperCase()
  if (!s) return { key:'PENDIENTE', label:'PENDIENTE' }
  if (s === 'VALIDADO') return { key:'RECHAZADO', label:'RECHAZADO' }
  const m = { PROGRAMADO:'PROGRAMADO',BLOQUEADO:'BLOQUEADO',RECHAZADO:'RECHAZADO',SIN_AGENDA:'SIN AGENDA',CARACTER_ESPECIAL:'CARÁCTER ESPECIAL',FRAUDE:'FRAUDE',ZONA_RESTRINGIDA:'ZONA RESTRINGIDA',
    EN_EJECUCION:'EN EJECUCIÓN', INSTALADO:'INSTALADO', INSTALADO_NO_VALIDADO:'INSTALADO (NO VALIDADO)', CAIDA:'CAÍDA',
    TECNICO_CASA:'TÉCNICO EN CASA', TECNICOS_CAMINO:'TÉCNICOS EN CAMINO', REASIGNACION:'REASIGNACIÓN', RECHAZO_CAMPO:'RECHAZO CAMPO', RECHAZO_MESA:'RECHAZO MESA' }
  return { key:s, label:m[s]||s }
}
function estadoProgramacionFlujo(venta) {
  if (venta?.estado_prog) return estadoProg(venta.estado_prog)
  if (venta?.fecha_programada || venta?.fecha_prog || venta?.fecha_programado) return estadoProg('PROGRAMADO')
  return estadoProg('')
}

const ACCESOS_MODS = [
  { nombre:'Back Data',        desc:'Gestión y asignación de leads', icon:'clipboard', path:'/backoffice',      color:'#dc3545', cargo:'backoffice' },
  { nombre:'Validación',       desc:'Control y revisión de ventas',  icon:'shield',    path:'/validacion',      color:'#059669', cargo:'validacion' },
  { nombre:'Grabaciones',      desc:'Auditoría de llamadas',         icon:'mic',       path:'/grabaciones',     color:'#0f766e', cargo:'grabaciones' },
  { nombre:'Seguimiento',      desc:'Seguimiento postventa',         icon:'activity',  path:'/seguimiento',     color:'#0284c7', cargo:'seguimiento' },
  { nombre:'Supervisor',       desc:'Gestión de equipos y salas',    icon:'briefcase', path:'/supervisor',      color:'#7c3aed', cargo:'supervisor' },
  { nombre:'Dashboard CRM',    desc:'Panel individual del asesor',   icon:'chart',     path:'/dashboard',       color:'#2563eb', cargo:'asesor' },
  { nombre:'Gestión Usuarios', desc:'Administración de accesos',     icon:'users',     path:'/usuarios',        color:'#be185d', cargo:'usuarios' },
  { nombre:'Programación',     desc:'Agenda de instalaciones',       icon:'calendar',  path:'/programacion',    color:'#c2410c', cargo:'programacion' },
  { nombre:'Cobranzas',        desc:'Clientes instalados y contratos',icon:'wallet',    path:'/cobranzas',       color:'#0f766e', cargo:'cobranzas' },
  { nombre:'Calidad',          desc:'Control de clientes instalados',   icon:'quality',   path:'/calidad',         color:'#2563eb', cargo:'calidad' },
  { nombre:'Super de Calidad', desc:'Supervisión del equipo de Calidad',icon:'quality',   path:'/sup-calidad',     color:'#7c3aed', cargo:'supcalidad' },
  { nombre:'Sup. Grabaciones', desc:'Supervisión del equipo de audio',icon:'headphones',path:'/sup-grabaciones',color:'#047857', cargo:'supgrabaciones' },
  { nombre:'Back Data Reclutaminto',        desc:'Gestión y asignación de candidatos', icon:'clipboard', path:'/backdata-reclutamiento', color:'#4338ca', cargo:'backreclutamiento' },
  { nombre:'Capacitación',      desc:'Seguimiento de postulantes en capacitación', icon:'graduation', path:'/backdata-reclutamiento', color:'#0e7490', cargo:'capacitador' },
]

function ModuloIcon({ tipo, size = 24 }) {
  const trazos = {
    clipboard: <><rect x="7" y="4.5" width="10" height="15" rx="2.3"/><path d="M10 8.5h4M10 12h4M10 15.5h4"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.8 2.8 8 7 10 4.2-2 7-5.2 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6"/></>,
    activity: <><path d="M3 12h4l2.2-5 4.1 10 2.2-5H21"/><circle cx="12" cy="12" r="9"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="m4 7 5-3 6 5 5-4"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h2M14 14h2M8 18h2"/></>,
    headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M18 19h-2v-7h4v5a2 2 0 0 1-2 2ZM6 19H4a2 2 0 0 1-2-2v-5h4v7Z"/></>,
    wallet: <><path d="M4 6.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3v-10a3 3 0 0 1 3-3h11"/><path d="M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/></>,
    quality: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
    graduation: <><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{display:'block', margin:'auto', flex:'0 0 auto'}}>{trazos[tipo] || trazos.activity}</svg>
}

function IconLapiz({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
}

function IconHoja({ size = 15 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
}

// Filtro estilo Excel: checkbox por opción + "Todos" para marcar/desmarcar en bloque.
// seleccionados === null significa "todos" (sin filtro); un array es la selección puntual.
function MasivoFiltroColumna({ titulo, opciones, seleccionados, onChange, buscable = false }) {
  const [abierto, setAbierto] = useState(false)
  const [buscar, setBuscar] = useState('')
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return undefined
    const cerrar = evento => { if (!ref.current?.contains(evento.target)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])
  const visibles = opciones.filter(opcion => !buscar || opcion.toLowerCase().includes(buscar.toLowerCase()))
  const todosMarcados = seleccionados === null || (opciones.length > 0 && seleccionados.length === opciones.length)
  const alternar = opcion => {
    const actuales = todosMarcados ? [...opciones] : seleccionados
    onChange(actuales.includes(opcion) ? actuales.filter(v => v !== opcion) : [...actuales, opcion])
  }
  return (
    <div className="masivo-filtro-columna" ref={ref}>
      <button type="button" className={!todosMarcados ? 'activo' : ''} onClick={() => setAbierto(v => !v)}>
        {titulo}<span>▼</span>
      </button>
      {abierto && <div className="masivo-filtro-menu">
        {buscable && <input autoFocus value={buscar} onChange={e => setBuscar(e.target.value)} placeholder={`Buscar ${titulo.toLowerCase()}…`} />}
        <label className="masivo-filtro-todos"><input type="checkbox" checked={todosMarcados} onChange={() => onChange(todosMarcados ? [] : null)} /> Todos</label>
        <div className="masivo-filtro-opciones">
          {visibles.map(opcion => <label key={opcion}><input type="checkbox" checked={todosMarcados || seleccionados.includes(opcion)} onChange={() => alternar(opcion)} /> {opcion}</label>)}
          {!visibles.length && <small>Sin resultados</small>}
        </div>
      </div>}
    </div>
  )
}

/* ── helpers puros ── */
// Los valores crudos de tipif_vend en Reclutamiento (VENTA CERRADA, NO TOCAR,
// FRAUDE...) no son los mismos nombres que usan a diario en ese equipo — ahi
// se llaman por su etiqueta (Acepta propuesta, No cumple el perfil, Provincia...).
// Mismo mapeo que TIPIF_VEND_OPCIONES en Backdatareclutamiento.jsx.
const TIPIF_VEND_RECL_LABELS = {
  'VENTA CERRADA':   'Acepta propuesta',
  'BUZON DE VOZ':    'Buzón de voz',
  'NO TOCAR':        'No cumple el perfil',
  'CORTA LLAMADA':   'Corta llamada',
  'GESTION WSP':      'Gestión WSP',
  'NO CONTESTA':      'No contesta',
  'NO INTERESADO':    'No interesado',
  'NO ROTAR':         'No rotar',
  'VOLVER A LLAMAR':  'Volver a llamar',
  'FRAUDE':           'Provincia',
}
function labelTipifVendRecl(valor) { return TIPIF_VEND_RECL_LABELS[String(valor||'').trim().toUpperCase()] || valor }
// Tipificaciones vigentes del vendedor en Backoffice (mismo set que
// TIPIF_VEND_OPCIONES en Backoffice.jsx) — el reporte de Marketing solo debe
// ofrecer estas para filtrar, no cualquier texto libre historico que haya
// quedado guardado en tipif_vend/tipif_back/tipif_back_2.
const TIPIF_VEND_VENTAS_ACTUALES = ['VENTA CERRADA','PREVENTA','AGENDADO','EN EJECUCION','INSTALADO','NO CONTESTA','BUZON DE VOZ','CORTA LLAMADA','NO DESEA','NO CALIFICA','SIN COBERTURA','CONTACTO CON TERCEROS','EDIFICIO NO LIBERADO','DESEA MOVIL','SERVICIO ACTIVO','NO ROTAR','SIN TIPIFICAR']

function ventaAlcanzoInstalacion(venta) {
  const estado = String(venta?.estado || '').trim().toLowerCase().replace(/_/g, ' ')
  return Boolean(venta?.fecha_instalado) || ['instalado', 'instalado no validado', 'reasignacion'].includes(estado)
}
// OJO: toISOString() usa UTC, no la hora local — como Lima va 5h detrás de
// UTC, entre las 7pm y medianoche (hora Lima) esto devolvía "mañana" en vez
// de "hoy" (reportes con rango de fechas por defecto vacíos toda esa
// ventana). Usar componentes locales de Date, igual que horaAhora() de al lado.
function fechaHoy()    { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
function horaAhora()   { return new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false}) }
function mesActual()   { return fechaHoy().slice(0,7) }
function formatF(f)    { if(!f)return'—'; const p=f.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }
function cargoObj(id)  { return CARGOS.find(c=>c.id===id)||{label:id,cls:'bc-default'} }
function colorAvatar(n){ const c=["#3b82f6","#8b5cf6","#22c55e","#f97316","#ef4444","#06b6d4","#ec4899","#f59e0b"]; let s=0; for(const ch of n) s+=ch.charCodeAt(0); return c[s%c.length] }
function iniciales(n)  { return n.trim().split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase() }
function mapSeg(e)     { const s=(e||'').toLowerCase(); if(SEG_MAP[s])return SEG_MAP[s]; if(s.includes('tecnico'))return'tecnico'; if(s.includes('rechazo'))return'rechazo'; if(s.includes('ejecucion'))return'ejecucion'; return null }
function efColor(v)    { return v>=70?'#16a34a':v>=40?'#d97706':'#dc2626' }
function normEstado(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
const FLUJO_NO_VALIDA = new Set(['venta','corta_llamada','fraude','no_desea','no_contesta','buzon_voz','servicio_activo','no_validado','bloqueado','zona_restringida','caracter_especial','sin_agenda','corregir','mala_oferta'])
const FLUJO_GRABADA = new Set(['grabado','grabada','aprobado','programado','en_ejecucion','instalado','caida','rechazo_campo','tecnico_casa','levantar_sot','tecnicos_camino','instalado_no_validado','reasignacion','derivado_planta_externa'])
const FLUJO_SEGUIMIENTO = new Set(['en_ejecucion','instalado','caida','rechazo_campo','tecnico_casa','levantar_sot','tecnicos_camino','instalado_no_validado','reasignacion','derivado_planta_externa','servicio_activo'])
function estadoSeguimiento(v) {
  const estado = normEstado(v?.estado || v?.estado_venta)
  if (FLUJO_SEGUIMIENTO.has(estado)) return estado
  // CONFORME es la puerta de entrada real a Seguimiento. Algunas ventas
  // históricas conservan PROGRAMADO como estado global, pero operativamente
  // ya están EN EJECUCIÓN y deben reflejarse así en esta columna.
  if (normEstado(v?.estado_supgrab) === 'conforme') return 'en_ejecucion'
  return ''
}
function flujoTieneAudio(v) {
  return Boolean(v?.audio || v?.audio_url || v?.archivo_audio || v?.archivoAudio || v?.grabacion || v?.grabacion_url || v?.audio_path)
}
function flujoNoValidada(v) {
  const estado = normEstado(v?.estado || v?.estado_venta)
  if (estado === 'servicio_activo' && normEstado(v?.estado_supgrab) === 'conforme') return false
  return FLUJO_NO_VALIDA.has(estado)
}
function flujoValidada(v) {
  const e = normEstado(v?.estado || v?.estado_venta)
  return Boolean(e) && e !== 'venta' && !flujoNoValidada(v)
}
function flujoGrabada(v) {
  return FLUJO_GRABADA.has(normEstado(v?.estado || v?.estado_venta))
    || normEstado(v?.estado_grab) === 'grabado'
    || flujoTieneAudio(v)
}
function flujoNoGrabada(v) { return flujoValidada(v) && !flujoGrabada(v) }
const ESTADOS_PROPIOS_VALIDACION = new Set([
  'venta','validado','no_validado','corta_llamada','fraude','no_desea',
  'no_contesta','buzon_voz','servicio_activo','corregir','mala_oferta',
])
function estadoValidacion(v) {
  // La validación tiene un estado histórico propio. Nunca debe heredar el
  // estado global que luego cambia en Programación o Seguimiento.
  const e = normEstado(v?.estado_validacion)
  const propio = ESTADOS_PROPIOS_VALIDACION.has(e) ? e : 'venta'
  return propio.replace(/_/g, ' ').toUpperCase()
}
function coincideFiltroValidacion(v, filtro) {
  const estado = estadoValidacion(v)
  if (filtro === 'validado') return estado === 'VALIDADO'
  if (filtro === 'no_validado') return estado !== 'VALIDADO' && estado !== 'VENTA'
  if (filtro === 'ventas') return estado === 'VENTA'
  return true
}
function estadoGrabacion(v) {
  // La tabla conserva el estado detallado. Si la venta no superó Validación,
  // prevalece su tipificación real para evitar combinaciones engañosas como
  // CORREGIR + GRABANDO.
  const validacion = estadoValidacion(v)
  if (validacion !== 'VALIDADO' && validacion !== 'VENTA') return validacion
  const g = String(v?.estado_grab || '').trim()
  return g ? g.replace(/_/g, ' ').toUpperCase() : 'PENDIENTE'
}
function categoriaFiltroGrabacion(v) {
  const estado = normEstado(estadoGrabacion(v))
  if (estado === 'grabado' || estado === 'grabada') return 'GRABADO'
  if (estado === 'grabando' || estado.startsWith('grabando_')) return 'GRABANDO'
  return 'NO GRABADO'
}
function flujoLabelEstado(estado) {
  const e = normEstado(estado)
  return ({
    venta:'Venta subida',
    validado:'Validada',
    validada:'Validada',
    no_validado:'No validada',
    grabado:'Grabada',
    grabada:'Grabada',
    aprobado:'Grabada',
    observado:'Observada',
    en_revision:'En revisión',
    programado:'Programada',
    en_ejecucion:'En ejecución',
    instalado:'Instalada',
    caida:'Caída',
    rechazo_campo:'Rechazo campo',
    tecnico_casa:'Técnico en casa',
    levantar_sot:'Levantar SOT',
    tecnicos_camino:'Técnicos en camino',
    instalado_no_validado:'Instalado no validado',
    reasignacion:'Reasignación',
    derivado_planta_externa:'Derivado a planta externa',
    corta_llamada:'Corta llamada',
    fraude:'Fraude',
    no_desea:'No desea',
    no_contesta:'No contesta',
    servicio_activo:'Servicio activo',
    buzon_voz:'Buzón de voz',
    bloqueado:'Bloqueado',
    zona_restringida:'Zona restringida',
    caracter_especial:'Carácter especial',
    sin_agenda:'Sin agenda',
  })[e] || (estado || 'Venta subida')
}

const MOD_FORM_VACIO = { nombre:'', usuario:'', cargo:'', cargo2:'', cargo3:'', sala:'', salaManual:true, pass:'', pass2:'' }

// Valores únicos y ordenados para poblar selects dinámicos (Asesor/Sala/Distrito/Plan) —
// nunca hardcodeados, siempre derivados de los datos reales ya cargados.
function opcionesUnicas(valores) {
  return [...new Set(valores.map(v => String(v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

// Fecha "YYYY-MM-DD" comparable como texto — sin conversiones de Date/timezone,
// desde/hasta quedan inclusivos en ambos extremos.
function soloFecha(v) {
  return String(v || '').split(' ')[0].split('T')[0]
}

function snapshotEliminado(item) {
  if (!item?.snapshot_json) return null
  if (typeof item.snapshot_json === 'object') return item.snapshot_json
  try { return JSON.parse(item.snapshot_json) } catch { return null }
}

function etiquetaTipoEliminacion(tipo) {
  return ({
    VENTA: 'Venta',
    POSTULANTE: 'Postulante',
    NUMERO_BACKDATA: 'Número Back Data',
    NUMERO_RECLUTAMIENTO: 'Número Reclutamiento',
    ASIGNACION_BACKDATA: 'Asignación quitada',
  })[tipo] || tipo || 'Registro'
}

// Exportación genérica a Excel: recibe filas ya filtradas (nunca solo la
// página visible) y una lista de columnas [encabezado, getter(fila)].
function descargarExcel(filas, columnas, nombreArchivo) {
  const datos = filas.map(fila => {
    const obj = {}
    columnas.forEach(([header, getter]) => { obj[header] = getter(fila) ?? '-' })
    return obj
  })
  const hoja  = XLSX.utils.json_to_sheet(datos)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Datos')
  XLSX.writeFile(libro, nombreArchivo)
}

// Filtro de estado multi-seleccion (estilo Excel), igual al de /seguimiento
// pero con una lista plana de strings en vez de {id,label}.
function textoFiltroMayuscula(valor) {
  return String(valor || '').replace(/_/g, ' ').toLocaleUpperCase('es-PE')
}

function FiltroEstadoMultiple({ opciones, seleccionados, onChange }) {
  const [abierto, setAbierto] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    function onClickFuera(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', onClickFuera)
    return () => document.removeEventListener('mousedown', onClickFuera)
  }, [])

  const todos = seleccionados.length === 0
  function toggleUno(valor) {
    onChange(seleccionados.includes(valor) ? seleccionados.filter(x => x !== valor) : [...seleccionados, valor])
  }

  const label = todos
    ? 'TODOS'
    : seleccionados.length === 1
      ? textoFiltroMayuscula(seleccionados[0])
      : `${seleccionados.length} ESTADOS SELECCIONADOS`

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button type="button" className="filtro-estado-btn" onClick={() => setAbierto(o => !o)}>
        <span>{label}</span>
        <span style={{ marginLeft: 6, opacity: .6 }}>▾</span>
      </button>
      {abierto && (
        <div className="filtro-estado-panel">
          <label className="filtro-estado-item filtro-estado-todos">
            <input type="checkbox" checked={todos} onChange={() => onChange([])} />
            <span>TODOS</span>
          </label>
          <div className="filtro-estado-divider" />
          {opciones.map(o => (
            <label key={o} className="filtro-estado-item">
              <input type="checkbox" checked={seleccionados.includes(o)} onChange={() => toggleUno(o)} />
              <span>{textoFiltroMayuscula(o)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Jefatura() {
  const navigate = useNavigate()
  const { sesion, logout, refrescarSesion } = useAuth()
  const usuarioNombre = sesion?.nombre || 'Jefatura'
  const mainRef = useRef(null)
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)

  /* nav */
  const [seccion, setSeccion] = useState(() => {
    try { return sessionStorage.getItem(JEF_APARTADO_KEY) || 'dashboard' } catch { return 'dashboard' }
  })

  /* data */
  const [usuarios,    setUsuarios]    = useState([])
  const [usuariosCarga, setUsuariosCarga] = useState({ cargando:true, error:'' })
  const [ventasCache, setVentasCache] = useState([])
  const [ventasSeg,   setVentasSeg]   = useState([])
  const [reclutados, setReclutados] = useState([])
  const [cargandoReclutados, setCargandoReclutados] = useState(false)
  const [reclutadosVista, setReclutadosVista] = useState('reclutados')
  const [entrevistados, setEntrevistados] = useState([])
  const [cargandoEntrevistados, setCargandoEntrevistados] = useState(false)
  const [entrevistaEditar, setEntrevistaEditar] = useState(null)
  const [entrevistaForm, setEntrevistaForm] = useState({ tipificacion:'', observacion:'', fecha_agendamiento:'', turno:'' })
  const [guardandoEntrevista, setGuardandoEntrevista] = useState(false)
  const [eliminaciones, setEliminaciones] = useState([])
  const [cargandoEliminaciones, setCargandoEliminaciones] = useState(false)
  const [eliminacionBorrandoId, setEliminacionBorrandoId] = useState(null)
  const [eliminacionRestaurandoId, setEliminacionRestaurandoId] = useState(null)
  const [detalleEliminacion, setDetalleEliminacion] = useState(null)
  const [cobCodigosTexto, setCobCodigosTexto] = useState('')
  const [cobCodigosProcesando, setCobCodigosProcesando] = useState(false)
  const [cobCodigosMensaje, setCobCodigosMensaje] = useState('')
  const [cobCodigosResultado, setCobCodigosResultado] = useState(null)
  const [masivoLeads, setMasivoLeads] = useState([])
  const [masivoCargando, setMasivoCargando] = useState(false)
  const [masivoMensaje, setMasivoMensaje] = useState('')
  const [masivoSeleccion, setMasivoSeleccion] = useState(() => new Set())
  const [masivoFiltros, setMasivoFiltros] = useState({ campana: '', distrito: '', desde: '', hasta: '' })
  const [masivoCantidadInput, setMasivoCantidadInput] = useState('')
  const [masivoCatalogos, setMasivoCatalogos] = useState({ campanas: [], tipificaciones: [] })
  const [filtroMasivoCampanas, setFiltroMasivoCampanas] = useState(null)
  const [filtroMasivoTipificaciones, setFiltroMasivoTipificaciones] = useState(null)
  const [masivoModoFecha, setMasivoModoFecha] = useState('rango')
  const [masivoCopiando, setMasivoCopiando] = useState(false)
  const [masivoPagina, setMasivoPagina] = useState(1)
  const [masivoPorPagina, setMasivoPorPagina] = useState(25)


  /* filtros persistentes */
  const [filtroSeg, setFiltroSeg] = useState(() => {
    try { return sessionStorage.getItem(JEF_SEG_FILTRO_KEY) || '' } catch { return '' }
  })
  const [salaReporte, setSalaReporte] = useState(() => {
    try { return sessionStorage.getItem(JEF_SALA_REPORTE_KEY) || 'todas' } catch { return 'todas' }
  })
  // Los reportes abren en el mes vigente; el histórico completo queda como
  // una consulta explícita mediante el botón "Ver todos".
  const [mesReporte, setMesReporte] = useState(() => mesActual())
  const [busqUsuarios, setBusqUsuarios] = useState('')
  const [filtroUsuarioCargo, setFiltroUsuarioCargo] = useState('')
  const [filtroUsuarioSala, setFiltroUsuarioSala] = useState('')
  const [filtroFlujoVentas, setFiltroFlujoVentas] = useState('todas')
  const [busqFlujoVentas, setBusqFlujoVentas] = useState('')

  /* filtros avanzados — Ventas generales (se combinan con filtroFlujoVentas/busqFlujoVentas) */
  const [fvEstados,    setFvEstados]    = useState([])
  const [fvValidacion, setFvValidacion] = useState('')
  const [fvGrabacion,  setFvGrabacion]  = useState('')
  const [fvCanal,      setFvCanal]      = useState('')
  const [fvCampana,    setFvCampana]    = useState([])
  const [fvAsesor,     setFvAsesor]     = useState('')
  const [fvSala,       setFvSala]       = useState('')
  const [fvDistrito,   setFvDistrito]   = useState('')
  // Cada criterio conserva su propio rango al alternar entre la fecha de
  // ingreso de la venta y la fecha de programación.
  const [fvTipoFecha,  setFvTipoFecha]  = useState('venta')
  const [fvDesde,      setFvDesde]      = useState('')
  const [fvHasta,      setFvHasta]      = useState('')
  const [fvProgDesde,  setFvProgDesde]  = useState('')
  const [fvProgHasta,  setFvProgHasta]  = useState('')
  const [paginaFlujo, setPaginaFlujo] = useState(1)
  const [porPaginaFlujo, setPorPaginaFlujo] = useState(18)

  /* filtros avanzados — Seguimiento en campo (se combinan con filtroSeg) */
  const [fsAsesor,    setFsAsesor]    = useState('')
  const [fsSala,      setFsSala]      = useState('')
  const [fsDistrito,  setFsDistrito]  = useState('')
  const [fsPlan,      setFsPlan]      = useState('')
  const [fsDesde,     setFsDesde]     = useState('')
  const [fsHasta,     setFsHasta]     = useState('')
  const [fsBusqueda,  setFsBusqueda]  = useState('')

  /* dashboard de leads para Marketing — exclusivo de esta vista de Jefatura */
  const [marketingVista, setMarketingVista] = useState('ventas')
  const [ordenCampanas, setOrdenCampanas] = useState('total')
  const [marketingFiltros, setMarketingFiltros] = useState({ desde:fechaHoy(), hasta:fechaHoy(), campana:'', tipificacion:'' })
  const [marketingData, setMarketingData] = useState([])
  const [marketingCatalogos, setMarketingCatalogos] = useState({ campanas:[], tipificaciones:[] })
  const [marketingCarga, setMarketingCarga] = useState({ cargando:false, error:'' })
  // Costos publicitarios por campaña (cruzados con marketingData para CPL/CPV)
  const [gastosData, setGastosData] = useState([])
  const [gastosCarga, setGastosCarga] = useState({ cargando:false, error:'' })
  const [gastoForm, setGastoForm] = useState({ fecha:fechaHoy(), campana:'', monto:'', notas:'' })
  const [gastoGuardando, setGastoGuardando] = useState(false)
  const [gastoEditandoId, setGastoEditandoId] = useState(null)
  const [filaAbierta, setFilaAbierta] = useState('')
  // Mismo dashboard, pero para las campañas de Reclutamiento (leads_reclutamiento)
  const [marketingReclFiltros, setMarketingReclFiltros] = useState({ desde:fechaHoy(), hasta:fechaHoy(), campana:'', tipificacion:'' })
  const [marketingReclData, setMarketingReclData] = useState([])
  const [marketingReclCatalogos, setMarketingReclCatalogos] = useState({ campanas:[], tipificaciones:[] })
  const [marketingReclCarga, setMarketingReclCarga] = useState({ cargando:false, error:'' })
  const [gastosReclData, setGastosReclData] = useState([])
  const [gastosReclCarga, setGastosReclCarga] = useState({ cargando:false, error:'' })
  const [gastoReclForm, setGastoReclForm] = useState({ fecha:fechaHoy(), campana:'', monto:'', notas:'' })
  const [gastoReclGuardando, setGastoReclGuardando] = useState(false)
  const [gastoReclEditandoId, setGastoReclEditandoId] = useState(null)
  const [filaReclAbierta, setFilaReclAbierta] = useState('')
  /* ranking de Grabaciones: quién grabó más ventas hoy/semana/mes */
  const [grabRanking, setGrabRanking] = useState([])
  const [grabCarga, setGrabCarga] = useState({ cargando:false, error:'' })

  /* logs */
  const [logs, setLogs] = useState(() => {
    try { const r = localStorage.getItem('jef_logs'); return r ? JSON.parse(r) : [] } catch { return [] }
  })

  /* modal usuario */
  const [modalUsu,    setModalUsu]    = useState(false)
  const [editandoId,  setEditandoId]  = useState(null)
  const [modForm,     setModForm]     = useState(MOD_FORM_VACIO)
  const [modErrores,  setModErrores]  = useState({})
  const [guardandoUsu,setGuardandoUsu]= useState(false)
  const [modalEliminar, setModalEliminar] = useState(null)
  const [eliminandoUsu, setEliminandoUsu] = useState(false)

  /* selector de usuario por módulo */
  const [selectorModulo, setSelectorModulo] = useState({ open:false, modulo:null, buscar:'' })
  const [mediaVenta, setMediaVenta] = useState(null)
  const [ventaReasignar, setVentaReasignar] = useState(null)
  const [ventaHistorial, setVentaHistorial] = useState(null)
  const [ventaEditar, setVentaEditar] = useState(null)
  const [ventaProgramar, setVentaProgramar] = useState(null)

  /* charts */
  const canvasEstados = useRef(null)
  const canvasSalas   = useRef(null)
  const canvasDiario  = useRef(null)
  const chartInst     = useRef({})

  /* toast */
  const [toastMsg, setToastMsg] = useState('')
  const toastRef = useRef(null)

  function mostrarToast(msg) {
    setToastMsg(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToastMsg(''), 3200)
  }

  function agregarLog(accion, detalle = '') {
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`, fecha: fechaHoy(), hora: horaAhora(), usuario: usuarioNombre, accion, detalle, color: '#7C3AED' }
    setLogs(prev => {
      const next = [entry, ...prev].slice(0, 200)
      try { localStorage.setItem('jef_logs', JSON.stringify(next.slice(0, 100))) } catch {}
      return next
    })
  }

  /* ── carga de datos ── */
  const cargarUsuarios = useCallback(async () => {
    setUsuariosCarga({ cargando:true, error:'' })
    try {
      const res  = await fetch(`${API}/usuarios`, { headers: ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        sessionStorage.removeItem('nc_token')
        sessionStorage.removeItem('nc_usuario')
        window.location.replace('/login')
        return
      }
      if (!res.ok || !data.ok) {
        setUsuariosCarga({ cargando:false, error:data.mensaje || 'No se pudo cargar la lista de usuarios.' })
        return
      }
      setUsuarios(Array.isArray(data.data) ? data.data : [])
      setUsuariosCarga({ cargando:false, error:'' })
    } catch {
      setUsuariosCarga({ cargando:false, error:'No fue posible conectar con la API. Los usuarios no han sido eliminados.' })
    }
  }, [])

  const cargandoVentasRef = useRef(false)
  const firmaVentasRef = useRef('')
  const cargarVentasCache = useCallback(async () => {
    if (cargandoVentasRef.current) return  // evita polls solapados (respuestas fuera de orden que causan parpadeo)
    cargandoVentasRef.current = true
    try {
      const res  = await fetch(`${API}/ventas`, { headers: ncHeaders() })
      const data = await res.json()
      if (data.ok) {
        if (!responseChanged(firmaVentasRef, data.data)) return
        setVentasCache(data.data.map(v => ({ ...v, _fecha: (v.created_at || '').split(' ')[0] })))
      }
    } catch { console.error('Error cargando ventas') }
    finally { cargandoVentasRef.current = false }
  }, [])

  const ESTADOS_CAMPO = FLUJO_SEGUIMIENTO
  const cargarSeguimiento = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/ventas?seguimiento_campo=1`, { headers: ncHeaders() })
      const data = await res.json()
      if (data.ok) {
        setVentasSeg(data.data
          .filter(v => ESTADOS_CAMPO.has((v.estado||'').toLowerCase().trim()))
          .map(v => ({ ...v, _seg: mapSeg(v.estado)||(v.estado||'').toLowerCase(), _fecha: (v.created_at||'').split(' ')[0] }))
        )
      }
    } catch { console.error('Error seguimiento') }
  }, [])

  const cargarReclutados = useCallback(async () => {
    setCargandoReclutados(true)
    try {
      const res = await fetch(`${API}/ventas-reclutamiento`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      setReclutados(res.ok && data.ok && Array.isArray(data.data) ? data.data : [])
    } catch {
      setReclutados([])
    } finally {
      setCargandoReclutados(false)
    }
  }, [])

  const cargarEntrevistados = useCallback(async () => {
    setCargandoEntrevistados(true)
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      setEntrevistados(res.ok && data.ok && Array.isArray(data.data) ? data.data : [])
    } catch {
      setEntrevistados([])
    } finally {
      setCargandoEntrevistados(false)
    }
  }, [])

  const cargarEliminaciones = useCallback(async () => {
    setCargandoEliminaciones(true)
    try {
      const res = await fetch(`${API}/eliminaciones`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      setEliminaciones(res.ok && data.ok && Array.isArray(data.data) ? data.data : [])
    } catch {
      setEliminaciones([])
    } finally {
      setCargandoEliminaciones(false)
    }
  }, [])

  const cargarMasivo = useCallback(async (filtros = masivoFiltros) => {
    setMasivoCargando(true)
    setMasivoMensaje('')
    try {
      const qs = new URLSearchParams()
      Object.entries(filtros).forEach(([k, v]) => { if (v) qs.set(k, v) })
      const res = await fetch(`${API}/leads/masivo-elegibles?${qs}`, { headers: ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar los leads')
      setMasivoLeads(Array.isArray(data.data) ? data.data : [])
      setMasivoSeleccion(new Set())
      setMasivoCatalogos({
        campanas: Array.isArray(data.filtros?.campanas) ? data.filtros.campanas : [],
        tipificaciones: Array.isArray(data.filtros?.tipificaciones) ? data.filtros.tipificaciones : [],
      })
    } catch (error) {
      setMasivoLeads([])
      setMasivoMensaje(error.message || 'Error conectando con el servidor')
    } finally {
      setMasivoCargando(false)
    }
  }, [masivoFiltros])

  function masivoAlternarUno(id) {
    setMasivoSeleccion(actual => {
      const nuevo = new Set(actual)
      if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id)
      return nuevo
    })
  }

  const masivoLeadsFiltrados = useMemo(() => masivoLeads.filter(l =>
    (filtroMasivoCampanas === null || filtroMasivoCampanas.includes(l.campana)) &&
    (filtroMasivoTipificaciones === null || filtroMasivoTipificaciones.includes((l.tipif_vend && l.tipif_vend.trim()) || 'SIN TIPIFICAR'))
  ), [masivoLeads, filtroMasivoCampanas, filtroMasivoTipificaciones])

  const masivoTotalPaginas = Math.max(1, Math.ceil(masivoLeadsFiltrados.length / masivoPorPagina))
  const masivoPaginaSegura = Math.min(masivoPagina, masivoTotalPaginas)
  const masivoLeadsPagina = masivoLeadsFiltrados.slice((masivoPaginaSegura - 1) * masivoPorPagina, masivoPaginaSegura * masivoPorPagina)
  useEffect(() => { setMasivoPagina(1) }, [masivoLeads, filtroMasivoCampanas, filtroMasivoTipificaciones, masivoPorPagina])

  function masivoSeleccionarPrimerosN() {
    const n = Number(masivoCantidadInput)
    if (!Number.isInteger(n) || n <= 0) { setMasivoMensaje('Ingresa una cantidad válida'); return }
    setMasivoSeleccion(new Set(masivoLeadsFiltrados.slice(0, n).map(l => l.id)))
  }

  async function masivoCopiarNumeros() {
    const seleccionados = masivoLeads.filter(l => masivoSeleccion.has(l.id))
    if (!seleccionados.length) { setMasivoMensaje('No hay leads seleccionados'); return }
    const texto = seleccionados.map(l => l.n1 || (l.usuario_whatsapp ? `@${l.usuario_whatsapp}` : '')).filter(Boolean).join('\n')
    setMasivoCopiando(true)
    setMasivoMensaje('')
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      setMasivoMensaje('No se pudo copiar al portapapeles (revisa permisos del navegador)')
      setMasivoCopiando(false)
      return
    }
    try {
      const res = await fetch(`${API}/leads/masivo-lote`, {
        method: 'POST', headers: ncHeaders(), body: JSON.stringify({ ids: seleccionados.map(l => l.id) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo registrar el lote')
      const ahora = new Date().toISOString()
      setMasivoLeads(actuales => actuales.map(l => masivoSeleccion.has(l.id) ? { ...l, masivo_lote_id: data.lote_id, masivo_fecha: ahora } : l))
      setMasivoMensaje(`Copiados ${seleccionados.length} números al portapapeles (lote #${data.lote_id})`)
    } catch (error) {
      setMasivoMensaje(`Se copiaron los números, pero no se pudo dejar constancia: ${error.message || 'error de servidor'}`)
    } finally {
      setMasivoCopiando(false)
    }
  }

  const cargarMarketing = useCallback(async (filtros = marketingFiltros) => {
    setMarketingCarga({ cargando:true, error:'' })
    try {
      const qs = new URLSearchParams()
      Object.entries(filtros).forEach(([k,v]) => { if (v) qs.set(k,v) })
      const res = await fetch(`${API}/leads/marketing-resumen?${qs}`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el dashboard')
      setMarketingData(Array.isArray(data.data) ? data.data : [])
      setMarketingCatalogos({
        campanas:Array.isArray(data.filtros?.campanas) ? data.filtros.campanas : [],
        tipificaciones:Array.isArray(data.filtros?.tipificaciones) ? data.filtros.tipificaciones : [],
      })
      setMarketingCarga({ cargando:false, error:'' })
    } catch (error) {
      setMarketingCarga({ cargando:false, error:error.message || 'Error de conexión' })
    }
  }, [marketingFiltros])

  const cargarGastos = useCallback(async (filtros = marketingFiltros) => {
    setGastosCarga({ cargando:true, error:'' })
    try {
      const qs = new URLSearchParams({ tipo:'ventas' })
      if (filtros.desde) qs.set('desde', filtros.desde)
      if (filtros.hasta) qs.set('hasta', filtros.hasta)
      const res = await fetch(`${API}/leads/marketing-gastos?${qs}`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar los gastos publicitarios')
      setGastosData(Array.isArray(data.data) ? data.data : [])
      setGastosCarga({ cargando:false, error:'' })
    } catch (error) {
      setGastosCarga({ cargando:false, error:error.message || 'Error de conexión' })
    }
  }, [marketingFiltros])

  async function guardarGasto() {
    const monto = Number(gastoForm.monto)
    if (!gastoForm.campana) return setGastosCarga(p => ({ ...p, error:'Selecciona una campaña' }))
    if (!Number.isFinite(monto) || monto <= 0) return setGastosCarga(p => ({ ...p, error:'El monto debe ser mayor a 0' }))
    setGastoGuardando(true)
    try {
      const res = await fetch(`${API}/leads/marketing-gastos`, {
        method:'POST', headers:ncHeaders(),
        body:JSON.stringify({ fecha:gastoForm.fecha, campana:gastoForm.campana, tipo:'ventas', monto, notas:gastoForm.notas }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar el gasto')
      setGastoForm(p => ({ ...p, monto:'', notas:'' }))
      setGastoEditandoId(null)
      await cargarGastos()
    } catch (error) {
      setGastosCarga(p => ({ ...p, error:error.message || 'Error de conexión' }))
    } finally {
      setGastoGuardando(false)
    }
  }

  function editarGasto(fila) {
    setGastoEditandoId(fila.id)
    setGastoForm({ fecha:(fila.fecha || '').slice(0,10), campana:fila.campana, monto:String(fila.monto), notas:fila.notas || '' })
  }

  async function eliminarGasto(id) {
    if (!window.confirm('¿Eliminar este registro de gasto?')) return
    try {
      const res = await fetch(`${API}/leads/marketing-gastos/${id}`, { method:'DELETE', headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo eliminar el gasto')
      if (gastoEditandoId === id) { setGastoEditandoId(null); setGastoForm(p => ({ ...p, monto:'', notas:'' })) }
      await cargarGastos()
    } catch (error) {
      setGastosCarga(p => ({ ...p, error:error.message || 'Error de conexión' }))
    }
  }

  function abrirPanelCampana(campana, modo) {
    if (filaAbierta === campana) { setFilaAbierta(''); return }
    if (modo === 'editar') {
      const fechaObjetivo = marketingFiltros.hasta || marketingFiltros.desde || fechaHoy()
      const match = gastosData.find(g => g.campana === campana && (g.fecha||'').slice(0,10) === fechaObjetivo)
      if (match) { setGastoEditandoId(match.id); setGastoForm({ fecha:(match.fecha||'').slice(0,10), campana:match.campana, monto:String(match.monto), notas:match.notas||'' }) }
      else { setGastoEditandoId(null); setGastoForm({ fecha:fechaObjetivo, campana, monto:'', notas:'' }) }
    } else {
      setGastoEditandoId(null)
      setGastoForm({ fecha:marketingFiltros.hasta || marketingFiltros.desde || fechaHoy(), campana, monto:'', notas:'' })
    }
    setFilaAbierta(campana)
  }

  // ===== Espejo de lo anterior, para las campañas de Reclutamiento =====
  const cargarGastosRecl = useCallback(async (filtros = marketingReclFiltros) => {
    setGastosReclCarga({ cargando:true, error:'' })
    try {
      const qs = new URLSearchParams({ tipo:'reclutamiento' })
      if (filtros.desde) qs.set('desde', filtros.desde)
      if (filtros.hasta) qs.set('hasta', filtros.hasta)
      const res = await fetch(`${API}/leads/marketing-gastos?${qs}`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar los gastos publicitarios')
      setGastosReclData(Array.isArray(data.data) ? data.data : [])
      setGastosReclCarga({ cargando:false, error:'' })
    } catch (error) {
      setGastosReclCarga({ cargando:false, error:error.message || 'Error de conexión' })
    }
  }, [marketingReclFiltros])

  async function guardarGastoRecl() {
    const monto = Number(gastoReclForm.monto)
    if (!gastoReclForm.campana) return setGastosReclCarga(p => ({ ...p, error:'Selecciona una campaña' }))
    if (!Number.isFinite(monto) || monto <= 0) return setGastosReclCarga(p => ({ ...p, error:'El monto debe ser mayor a 0' }))
    setGastoReclGuardando(true)
    try {
      const res = await fetch(`${API}/leads/marketing-gastos`, {
        method:'POST', headers:ncHeaders(),
        body:JSON.stringify({ fecha:gastoReclForm.fecha, campana:gastoReclForm.campana, tipo:'reclutamiento', monto, notas:gastoReclForm.notas }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar el gasto')
      setGastoReclForm(p => ({ ...p, monto:'', notas:'' }))
      setGastoReclEditandoId(null)
      await cargarGastosRecl()
    } catch (error) {
      setGastosReclCarga(p => ({ ...p, error:error.message || 'Error de conexión' }))
    } finally {
      setGastoReclGuardando(false)
    }
  }

  function editarGastoRecl(fila) {
    setGastoReclEditandoId(fila.id)
    setGastoReclForm({ fecha:(fila.fecha || '').slice(0,10), campana:fila.campana, monto:String(fila.monto), notas:fila.notas || '' })
  }

  async function eliminarGastoRecl(id) {
    if (!window.confirm('¿Eliminar este registro de gasto?')) return
    try {
      const res = await fetch(`${API}/leads/marketing-gastos/${id}`, { method:'DELETE', headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo eliminar el gasto')
      if (gastoReclEditandoId === id) { setGastoReclEditandoId(null); setGastoReclForm(p => ({ ...p, monto:'', notas:'' })) }
      await cargarGastosRecl()
    } catch (error) {
      setGastosReclCarga(p => ({ ...p, error:error.message || 'Error de conexión' }))
    }
  }

  function abrirPanelCampanaRecl(campana, modo) {
    if (filaReclAbierta === campana) { setFilaReclAbierta(''); return }
    if (modo === 'editar') {
      const fechaObjetivo = marketingReclFiltros.hasta || marketingReclFiltros.desde || fechaHoy()
      const match = gastosReclData.find(g => g.campana === campana && (g.fecha||'').slice(0,10) === fechaObjetivo)
      if (match) { setGastoReclEditandoId(match.id); setGastoReclForm({ fecha:(match.fecha||'').slice(0,10), campana:match.campana, monto:String(match.monto), notas:match.notas||'' }) }
      else { setGastoReclEditandoId(null); setGastoReclForm({ fecha:fechaObjetivo, campana, monto:'', notas:'' }) }
    } else {
      setGastoReclEditandoId(null)
      setGastoReclForm({ fecha:marketingReclFiltros.hasta || marketingReclFiltros.desde || fechaHoy(), campana, monto:'', notas:'' })
    }
    setFilaReclAbierta(campana)
  }

  const cargarMarketingRecl = useCallback(async (filtros = marketingReclFiltros) => {
    setMarketingReclCarga({ cargando:true, error:'' })
    try {
      const qs = new URLSearchParams()
      Object.entries(filtros).forEach(([k,v]) => { if (v) qs.set(k,v) })
      const res = await fetch(`${API}/leads-reclutamiento/marketing-resumen?${qs}`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el dashboard')
      setMarketingReclData(Array.isArray(data.data) ? data.data : [])
      setMarketingReclCatalogos({
        campanas:Array.isArray(data.filtros?.campanas) ? data.filtros.campanas : [],
        tipificaciones:Array.isArray(data.filtros?.tipificaciones) ? data.filtros.tipificaciones : [],
      })
      setMarketingReclCarga({ cargando:false, error:'' })
    } catch (error) {
      setMarketingReclCarga({ cargando:false, error:error.message || 'Error de conexión' })
    }
  }, [marketingReclFiltros])

  const cargarGrabRendimiento = useCallback(async () => {
    setGrabCarga({ cargando:true, error:'' })
    try {
      const res = await fetch(`${API}/ventas/grabaciones-rendimiento`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el rendimiento de Grabaciones')
      setGrabRanking(Array.isArray(data.ranking) ? data.ranking : [])
      setGrabCarga({ cargando:false, error:'' })
    } catch (error) {
      setGrabCarga({ cargando:false, error:error.message || 'Error de conexión' })
    }
  }, [])

  const grabResumen = useMemo(() => grabRanking.reduce((acc, f) => ({
    hoy:acc.hoy+f.hoy, semana:acc.semana+f.semana, mes:acc.mes+f.mes,
  }), { hoy:0, semana:0, mes:0 }), [grabRanking])

  async function eliminarRegistroEliminacion(item) {
    if (!item?.id || eliminacionBorrandoId !== null) return
    if (!window.confirm('¿Eliminar este registro del historial?\n\nEsta acción solo borra el registro de auditoría.')) return
    setEliminacionBorrandoId(item.id)
    try {
      const res = await fetch(`${API}/eliminaciones/${item.id}`, {
        method:'DELETE',
        headers:ncHeaders(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo eliminar el registro')
      setEliminaciones(actuales => actuales.filter(registro => registro.id !== item.id))
      if (detalleEliminacion?.id === item.id) setDetalleEliminacion(null)
      mostrarToast(data.mensaje || 'Registro eliminado del historial')
    } catch (error) {
      mostrarToast(error.message || 'Error de conexión')
    } finally {
      setEliminacionBorrandoId(null)
    }
  }

  async function restablecerRegistroEliminacion(item) {
    if (!item?.id || item.tipo !== 'VENTA' || item.restored_at || eliminacionRestaurandoId !== null) return
    if (!window.confirm(`¿Restablecer la venta ${item.registro_id}?\n\nLa venta volverá a aparecer en el sistema con sus datos originales.`)) return
    setEliminacionRestaurandoId(item.id)
    try {
      const res = await fetch(`${API}/eliminaciones/${item.id}/restablecer`, {
        method:'POST',
        headers:ncHeaders(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo restablecer la venta')
      setEliminaciones(actuales => actuales.map(registro => registro.id === item.id
        ? { ...registro, restored_at:new Date().toISOString(), restored_by_nombre:sesion?.nombre || 'Jefatura' }
        : registro))
      setDetalleEliminacion(actual => actual?.id === item.id
        ? { ...actual, restored_at:new Date().toISOString(), restored_by_nombre:sesion?.nombre || 'Jefatura' }
        : actual)
      mostrarToast(data.mensaje || 'Venta restablecida correctamente')
    } catch (error) {
      mostrarToast(error.message || 'Error de conexión')
    } finally {
      setEliminacionRestaurandoId(null)
    }
  }

  async function eliminarReclutado(postulante) {
    if (!window.confirm(`¿Eliminar definitivamente a ${postulante.nombre || 'este postulante'}?`)) return
    const res = await fetch(`${API}/ventas-reclutamiento/${postulante.id}`, {
      method:'DELETE',
      headers:ncHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      console.error(data.mensaje || 'No se pudo eliminar el postulante')
      return
    }
    setReclutados(prev => prev.filter(item => item.id !== postulante.id))
  }

  function abrirEditarEntrevista(entrevista) {
    setEntrevistaEditar(entrevista)
    setEntrevistaForm({
      tipificacion: entrevista.tipificacion || '',
      observacion: entrevista.observacion || '',
      fecha_agendamiento: soloFecha(entrevista.fecha_agendamiento) || '',
      turno: entrevista.turno || 'TURNO 1',
    })
  }

  async function guardarEntrevista() {
    if (!entrevistaEditar) return
    setGuardandoEntrevista(true)
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas/${entrevistaEditar.id}`, {
        method:'PATCH', headers:ncHeaders(), body:JSON.stringify(entrevistaForm),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar la entrevista')
      setEntrevistados(prev => prev.map(item => item.id === entrevistaEditar.id ? { ...item, ...entrevistaForm } : item))
      setEntrevistaEditar(null)
    } catch (e) {
      window.alert(e.message || 'No se pudo guardar la entrevista')
    } finally {
      setGuardandoEntrevista(false)
    }
  }

  async function eliminarEntrevista(entrevista) {
    if (!window.confirm(`¿Eliminar definitivamente la entrevista de ${entrevista.nombre_postulante || 'este postulante'}?`)) return
    const res = await fetch(`${API}/leads-reclutamiento/entrevistas/${entrevista.id}`, {
      method:'DELETE',
      headers:ncHeaders(),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) {
      console.error(data.mensaje || 'No se pudo eliminar la entrevista')
      return
    }
    setEntrevistados(prev => prev.filter(item => item.id !== entrevista.id))
  }

  async function completarReasignacion(data) {
    const venta = ventaReasignar
    setVentaReasignar(null)
    await Promise.all([cargarSeguimiento(), cargarVentasCache()])
    agregarLog('Venta reasignada', data?.mensaje || `Venta ${venta?.id || ''}`)
  }

  async function eliminarVenta(venta) {
    const cliente = venta?.nombre || `venta ${venta?.id}`
    if (!window.confirm(`¿Eliminar definitivamente la venta de ${cliente}? Esta acción no se puede deshacer.`)) return
    try {
      const res = await fetch(`${API}/ventas/${venta.id}`, { method:'DELETE', headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo eliminar la venta.')
      setVentasSeg(prev => prev.filter(item => item.id !== venta.id))
      setVentasCache(prev => prev.filter(item => item.id !== venta.id))
      agregarLog('Venta eliminada', `${cliente} · DNI ${venta?.dni || '—'}`)
    } catch (error) {
      mostrarToast(error.message || 'Error de conexión')
    }
  }

  /* mount */
  useEffect(() => {
    cargarUsuarios()
    cargarVentasCache()
    agregarLog('Sesión iniciada', 'Panel de Jefatura')
    const iv = setVisibleInterval(cargarVentasCache, 5000)
    return () => clearVisibleInterval(iv)
  }, [cargarUsuarios, cargarVentasCache])

  useEffect(() => {
    if (seccion === 'seguimiento') cargarSeguimiento()
    if (seccion === 'reclutados-generales') { cargarReclutados(); cargarEntrevistados() }
    if (seccion === 'eliminaciones') cargarEliminaciones()
    if (seccion === 'marketing-leads') { cargarMarketing(); cargarMarketingRecl(); cargarGastos(); cargarGastosRecl() }
    if (seccion === 'grab-rendimiento') cargarGrabRendimiento()
    if (seccion === 'envio-masivo') cargarMasivo()
  }, [seccion, cargarSeguimiento, cargarReclutados, cargarEntrevistados, cargarEliminaciones, cargarMarketing, cargarMarketingRecl, cargarGastos, cargarGastosRecl, cargarGrabRendimiento, cargarMasivo])

  // El dashboard representa el ciclo del mes actual según la fecha real de
  // cada evento. Una venta puede haberse creado antes y programarse o instalarse
  // este mes; en ese caso cuenta en la métrica del evento, no en la de altas.
  const cicloDashboardMes = useMemo(() => {
    const mes = mesReporte || mesActual()
    const esMes = valor => String(soloFecha(valor) || '').slice(0, 7) === mes
    const ventasNuevas = ventasCache.filter(v => esMes(v._fecha || v.fecha_ingreso || v.fecha || v.created_at))
    const programaciones = ventasCache.filter(v => esMes(v.fecha_programada))
    const instalaciones = ventasCache.filter(v => esMes(v.fecha_instalado) && ventaAlcanzoInstalacion(v))
    const caidasMes = ventasCache.filter(v => esMes(v.fecha_programada) && ['CAIDA', 'RECHAZO_CAMPO'].includes(String(v.estado || '').toUpperCase()))
    return {
      ventasNuevas,
      programaciones,
      instalaciones,
      caidasMes,
    }
  }, [ventasCache, mesReporte])

  /* charts — siempre en DOM; solo recrear cuando estamos en dashboard */
  useEffect(() => {
    if (seccion !== 'dashboard') return

    function destroy(key) {
      if (chartInst.current[key]) { try { chartInst.current[key].destroy() } catch {} delete chartInst.current[key] }
    }

    /* Chart 1 — doughnut estados */
    if (canvasEstados.current) {
      destroy('estados')
      const e  = s => (s || '').toLowerCase()
      const estados = [
        { label:'Validadas',       val: cicloDashboardMes.ventasNuevas.filter(v=>!['venta','','corta_llamada','fraude','no_desea','no_contesta','servicio_activo','no_validado'].includes(e(v.estado))).length, color:'#7C3AED' },
        { label:'No validadas',    val: cicloDashboardMes.ventasNuevas.filter(v=>['venta','corta_llamada','fraude','no_desea','no_contesta','servicio_activo','no_validado'].includes(e(v.estado))).length,        color:'#ef4444' },
        { label:'Grabadas',        val: cicloDashboardMes.ventasNuevas.filter(flujoGrabada).length,   color:'#d97706' },
        { label:'No grabadas',     val: cicloDashboardMes.ventasNuevas.filter(flujoNoGrabada).length, color:'#9ca3af' },
        { label:'No programadas',  val: cicloDashboardMes.ventasNuevas.filter(v=>['bloqueado','sin_agenda','caracter_especial','fraude','zona_restringida'].includes(e(v.estado))).length, color:'#6366f1' },
        { label:'Instaladas',      val: cicloDashboardMes.instalaciones.length, color:'#16a34a' },
        { label:'Caídas',          val: cicloDashboardMes.ventasNuevas.filter(v=>e(v.estado)==='caida').length,     color:'#dc2626' },
        { label:'Rechazos',        val: cicloDashboardMes.ventasNuevas.filter(v=>e(v.estado)==='rechazo_campo').length, color:'#f97316' },
      ].filter(x => x.val > 0)
      if (estados.length) {
        chartInst.current.estados = new Chart(canvasEstados.current, {
          type: 'doughnut',
          data: { labels: estados.map(x=>x.label), datasets: [{ data: estados.map(x=>x.val), backgroundColor: estados.map(x=>x.color), borderWidth:2, borderColor:'#fff', hoverOffset:6 }] },
          options: { responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{position:'right',labels:{font:{size:11},boxWidth:12,padding:10}}, tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw}`}} } }
        })
      }
    }

    /* Chart 2 — bar salas */
    if (canvasSalas.current) {
      destroy('salas')
      const mesUsar   = mesReporte || mesActual()
      const esMesSeleccionado = valor => String(soloFecha(valor) || '').slice(0, 7) === mesUsar
      const salas     = ['SALA 1','SALA 2','SALA 3','SALA 4','SALA CHANCAY','SALA 5','SALA 6']
      // Se agrupa por v.sala (ya resuelve sala_atribucion en el backend), no
      // por la sala ACTUAL del asesor en usuarios: si no, una venta que un
      // asesor hizo para otra sala y que luego se movio de sala seguia
      // contando para su sala nueva en vez de la sala a la que se atribuyo.
      const instaladas = salas.map(s =>
        ventasCache.filter(v=>String(v.sala||'').toUpperCase()===s&&esMesSeleccionado(v.fecha_instalado)&&ventaAlcanzoInstalacion(v)).length
      )
      const caidas = salas.map(s =>
        ventasCache.filter(v=>String(v.sala||'').toUpperCase()===s&&esMesSeleccionado(v.fecha_programada)&&(v.estado||'').toLowerCase()==='caida').length
      )
      chartInst.current.salas = new Chart(canvasSalas.current, {
        type: 'bar',
        data: { labels:salas, datasets:[
          { label:'Instaladas', data:instaladas, backgroundColor:'#16a34a', borderRadius:6 },
          { label:'Caídas',     data:caidas,     backgroundColor:'#ef4444', borderRadius:6 },
        ]},
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top',labels:{font:{size:11},boxWidth:12}}}, scales:{y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'#f3f4f6'}},x:{grid:{display:false}}} }
      })
    }

    /* Chart 3 — line diario */
    if (canvasDiario.current) {
      destroy('diario')
      const dias = []
      for (let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); dias.push(d.toISOString().split('T')[0]) }
      const salas  = ['SALA 1','SALA 2','SALA 3','SALA 4','SALA CHANCAY','SALA 5','SALA 6']
      const colors = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#06b6d4','#f43f5e','#eab308']
      const datasets = salas.map((s,i) =>
        ({ label:s, data:dias.map(d=>ventasCache.filter(v=>v._fecha===d&&String(v.sala||'').toUpperCase()===s).length), borderColor:colors[i], backgroundColor:colors[i]+'22', fill:true, tension:.4, borderWidth:2, pointRadius:4 })
      )
      chartInst.current.diario = new Chart(canvasDiario.current, {
        type: 'line',
        data: { labels:dias.map(d=>{const p=d.split('-');return `${p[2]}/${p[1]}`}), datasets },
        options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:12}}}, scales:{y:{beginAtZero:true,ticks:{stepSize:1},grid:{color:'#f3f4f6'}},x:{grid:{display:false}}} }
      })
    }

    return () => { destroy('estados'); destroy('salas'); destroy('diario') }
  }, [seccion, ventasCache, cicloDashboardMes, usuarios, mesReporte])

  /* ── navegación ── */
  function irSeccion(id) {
    setSeccion(id)
    setMenuMovilAbierto(false)
    try { sessionStorage.setItem(JEF_APARTADO_KEY, id) } catch {}
  }

  /* ── KPIs dashboard ── */
  const kpis = useMemo(() => {
    const e   = s => (s||'').toLowerCase()
    const inst  = cicloDashboardMes.instalaciones.length
    const caida = cicloDashboardMes.caidasMes.length
    const instM = inst
    const caidM = caida
    const efect = (instM+caidM)>0?Math.round(instM/(instM+caidM)*100):0
    return {
      ventasMes:     cicloDashboardMes.ventasNuevas.length,
      validadas:     cicloDashboardMes.ventasNuevas.filter(v=>!['venta',''].includes(e(v.estado))).length,
      noValidadas:   cicloDashboardMes.ventasNuevas.filter(v=>['venta','corta_llamada','fraude','no_desea','no_contesta','servicio_activo','no_validado'].includes(e(v.estado))).length,
      grabadas:      cicloDashboardMes.ventasNuevas.filter(flujoGrabada).length,
      noGrabadas:    cicloDashboardMes.ventasNuevas.filter(flujoNoGrabada).length,
      enEjecucion:   cicloDashboardMes.programaciones.filter(v=>['aprobado','programado','en_ejecucion','tecnico_casa'].includes(e(v.estado))).length,
      noProgramadas: cicloDashboardMes.ventasNuevas.filter(v=>['bloqueado','sin_agenda','caracter_especial','fraude','zona_restringida'].includes(e(v.estado))).length,
      instaladas:    inst,
      caidas:        caida,
      conv:          efect+'%',
      totalUs:       usuarios.length,
      activos:       usuarios.filter(u=>u.activo).length,
      asesores:      usuarios.filter(u=>usuarioTieneCargo(u,'asesor')&&u.activo).length,
      supervisores:  usuarios.filter(u=>usuarioTieneCargo(u,'supervisor')&&u.activo).length,
    }
  }, [cicloDashboardMes, usuarios])

  // Una venta cerrada, en cualquiera de sus 3 estados posteriores, sigue
  // siendo una venta: VENTA CERRADA (recien cerrada), INSTALADO (se completo)
  // o VENTA CAIDA (se cayo despues) — las 3 cuentan para el total de ventas.
  const TIPIF_CONJUNTO_VENTA = new Set(['VENTA CERRADA','VENTA CAIDA','INSTALADO'])
  const resumenMarketing = useMemo(() => {
    const porCampana = new Map()
    let total = 0, sinTipificar = 0
    marketingData.forEach(fila => {
      const cantidad = Number(fila.cantidad || 0)
      total += cantidad
      if (fila.tipificacion === 'SIN TIPIFICAR') sinTipificar += cantidad
      const actual = porCampana.get(fila.campana) || { campana:fila.campana, total:0, ventas:0, instaladas:0, tipificaciones:[] }
      actual.total += cantidad
      const tipificacion = String(fila.tipificacion||'').trim().toUpperCase()
      if (TIPIF_CONJUNTO_VENTA.has(tipificacion)) actual.ventas += cantidad
      if (tipificacion === 'INSTALADO') actual.instaladas += cantidad
      actual.tipificaciones.push({ nombre:fila.tipificacion, cantidad })
      porCampana.set(fila.campana, actual)
    })
    const campanas = [...porCampana.values()].sort((a,b) => {
      if (ordenCampanas === 'instaladas') return b.instaladas-a.instaladas || b.ventas-a.ventas || b.total-a.total || a.campana.localeCompare(b.campana,'es')
      if (ordenCampanas === 'ventas') return b.ventas-a.ventas || b.total-a.total || a.campana.localeCompare(b.campana,'es')
      return b.total-a.total || a.campana.localeCompare(b.campana,'es')
    })
    return { total, sinTipificar, tipificados:total-sinTipificar, campanas, max:Math.max(1,...campanas.map(c=>c.total)), maxVentas:Math.max(1,...campanas.map(c=>c.ventas)), maxInstaladas:Math.max(1,...campanas.map(c=>c.instaladas)) }
  }, [marketingData, ordenCampanas])

  const costosPorCampana = useMemo(() => {
    const gastoPorCampana = new Map()
    let gastoTotalPeriodo = 0
    gastosData.forEach(g => {
      const monto = Number(g.monto || 0)
      gastoTotalPeriodo += monto
      gastoPorCampana.set(g.campana, (gastoPorCampana.get(g.campana) || 0) + monto)
    })
    const ventasTotalPeriodo = resumenMarketing.campanas.reduce((acc, c) => acc + c.ventas, 0)
    const nombres = new Set([...resumenMarketing.campanas.map(c => c.campana), ...gastoPorCampana.keys()])
    const filas = [...nombres].map(campana => {
      const info = resumenMarketing.campanas.find(c => c.campana === campana)
      const leads = info?.total || 0
      const ventas = info?.ventas || 0
      const gasto = gastoPorCampana.get(campana) || 0
      return {
        campana, leads, ventas, gasto,
        cpl: leads > 0 ? gasto / leads : null,
        cpv: ventas > 0 ? gasto / ventas : null,
      }
    }).sort((a,b) => b.gasto-a.gasto || b.leads-a.leads || a.campana.localeCompare(b.campana,'es'))
    return { filas, gastoTotalPeriodo, ventasTotalPeriodo }
  }, [gastosData, resumenMarketing])

  function exportarCostosExcel() {
    descargarExcel(costosPorCampana.filas, [
      ['Campaña', f=>f.campana],
      ['Leads', f=>f.leads],
      ['Ventas', f=>f.ventas],
      ['Gasto (S/)', f=>Number(f.gasto.toFixed(2))],
      ['Costo por lead (S/)', f=>f.cpl!=null?Number(f.cpl.toFixed(2)):''],
      ['Costo por venta (S/)', f=>f.cpv!=null?Number(f.cpv.toFixed(2)):''],
    ], `costos-marketing-${fechaHoy()}.xlsx`)
  }

  function exportarMarketingExcel() {
    descargarExcel(marketingData, [
      ['Campaña', f=>f.campana],
      ['Tipificación', f=>f.tipificacion],
      ['Leads', f=>Number(f.cantidad || 0)],
      ['Primera alta', f=>f.primera_alta || ''],
      ['Última alta', f=>f.ultima_alta || ''],
    ], `leads-marketing-${fechaHoy()}.xlsx`)
  }

  const resumenMarketingRecl = useMemo(() => {
    const porCampana = new Map()
    let total = 0, sinTipificar = 0
    marketingReclData.forEach(fila => {
      const cantidad = Number(fila.cantidad || 0)
      total += cantidad
      if (fila.tipificacion === 'SIN TIPIFICAR') sinTipificar += cantidad
      const actual = porCampana.get(fila.campana) || { campana:fila.campana, total:0, ventas:0, tipificaciones:[] }
      actual.total += cantidad
      // En Reclutamiento "venta" equivale a Acepta propuesta (VENTA CERRADA en tipif_vend).
      if (String(fila.tipificacion||'').trim().toUpperCase() === 'VENTA CERRADA') actual.ventas += cantidad
      actual.tipificaciones.push({ nombre:fila.tipificacion, cantidad })
      porCampana.set(fila.campana, actual)
    })
    const campanas = [...porCampana.values()].sort((a,b) => ordenCampanas==='ventas'
      ? (b.ventas-a.ventas || b.total-a.total || a.campana.localeCompare(b.campana,'es'))
      : (b.total-a.total || a.campana.localeCompare(b.campana,'es')))
    return { total, sinTipificar, tipificados:total-sinTipificar, campanas, max:Math.max(1,...campanas.map(c=>c.total)), maxVentas:Math.max(1,...campanas.map(c=>c.ventas)) }
  }, [marketingReclData, ordenCampanas])

  const costosPorCampanaRecl = useMemo(() => {
    const gastoPorCampana = new Map()
    let gastoTotalPeriodo = 0
    gastosReclData.forEach(g => {
      const monto = Number(g.monto || 0)
      gastoTotalPeriodo += monto
      gastoPorCampana.set(g.campana, (gastoPorCampana.get(g.campana) || 0) + monto)
    })
    const aceptacionesTotalPeriodo = resumenMarketingRecl.campanas.reduce((acc, c) => acc + c.ventas, 0)
    const nombres = new Set([...resumenMarketingRecl.campanas.map(c => c.campana), ...gastoPorCampana.keys()])
    const filas = [...nombres].map(campana => {
      const info = resumenMarketingRecl.campanas.find(c => c.campana === campana)
      const leads = info?.total || 0
      const aceptaciones = info?.ventas || 0
      const gasto = gastoPorCampana.get(campana) || 0
      return {
        campana, leads, aceptaciones, gasto,
        cpl: leads > 0 ? gasto / leads : null,
        cpa: aceptaciones > 0 ? gasto / aceptaciones : null,
      }
    }).sort((a,b) => b.gasto-a.gasto || b.leads-a.leads || a.campana.localeCompare(b.campana,'es'))
    return { filas, gastoTotalPeriodo, aceptacionesTotalPeriodo }
  }, [gastosReclData, resumenMarketingRecl])

  function exportarCostosReclExcel() {
    descargarExcel(costosPorCampanaRecl.filas, [
      ['Campaña', f=>f.campana],
      ['Leads', f=>f.leads],
      ['Aceptaciones', f=>f.aceptaciones],
      ['Gasto (S/)', f=>Number(f.gasto.toFixed(2))],
      ['Costo por lead (S/)', f=>f.cpl!=null?Number(f.cpl.toFixed(2)):''],
      ['Costo por aceptación (S/)', f=>f.cpa!=null?Number(f.cpa.toFixed(2)):''],
    ], `costos-reclutamiento-${fechaHoy()}.xlsx`)
  }

  function exportarMarketingReclExcel() {
    descargarExcel(marketingReclData, [
      ['Campaña', f=>f.campana],
      ['Tipificación', f=>f.tipificacion],
      ['Leads', f=>Number(f.cantidad || 0)],
      ['Primera alta', f=>f.primera_alta || ''],
      ['Última alta', f=>f.ultima_alta || ''],
    ], `leads-marketing-reclutamiento-${fechaHoy()}.xlsx`)
  }

  /* ── usuarios para el selector de accesos ── */
  const usuariosModulo = useMemo(() => {
    const modulo = selectorModulo.modulo
    if (!modulo) return []
    const buscar = selectorModulo.buscar.trim().toLowerCase()
    return usuarios
      .filter(u => usuarioTieneCargo(u, modulo.cargo))
      .filter(u => !buscar || [u.nombre, u.usuario, u.sala].some(v => String(v || '').toLowerCase().includes(buscar)))
      .sort((a, b) => Number(Boolean(b.activo)) - Number(Boolean(a.activo)) || String(a.nombre || '').localeCompare(String(b.nombre || '')))
  }, [usuarios, selectorModulo])

  function abrirSelectorModulo(modulo) {
    setSelectorModulo({ open:true, modulo, buscar:'' })
  }

  function cerrarSelectorModulo() {
    setSelectorModulo({ open:false, modulo:null, buscar:'' })
  }

  function entrarModulo(modulo, usuario) {
    const objetivo = {
      id: usuario.id,
      nombre: usuario.nombre,
      usuario: usuario.usuario,
      cargo: modulo.cargo,
      cargoPrincipal: usuario.cargo,
      cargos: [usuario.cargo, ...permisosDeUsuario(usuario)],
      permisos: permisosDeUsuario(usuario),
      sala: usuario.sala || '',
      path: modulo.path,
    }
    sessionStorage.setItem('nc_jefatura_usuario_objetivo', JSON.stringify(objetivo))
    if (modulo.cargo === 'asesor') {
      sessionStorage.setItem('nc_dashboard_asesor_objetivo', JSON.stringify(objetivo))
    } else {
      sessionStorage.removeItem('nc_dashboard_asesor_objetivo')
    }
    refrescarSesion()
    agregarLog('Acceso a módulo', `${modulo.nombre}: ${usuario.nombre}`)
    cerrarSelectorModulo()
    navigate(modulo.path)
  }

  /* ── seguimiento ── */
  const ventasSegMes = useMemo(() => {
    const mes = mesReporte || mesActual()
    return ventasSeg.filter(v => {
      const fechaEvento = v._seg === 'instalado'
        ? (v.fecha_instalado || v.fecha_programada || v._fecha)
        : (v.fecha_programada || v._fecha)
      return String(soloFecha(fechaEvento) || '').slice(0, 7) === mes
    })
  }, [ventasSeg, mesReporte])

  const estadosSeg = useMemo(() => {
    const porClave = new Map()
    ventasSegMes.forEach(v => {
      const clave = v._seg
      if (clave && !porClave.has(clave)) {
        porClave.set(clave, (SEG_BADGES[clave] || {}).label || flujoLabelEstado(v.estado))
      }
    })
    return [...porClave.entries()].sort((a, b) =>
      (SEG_ORD[a[0]] ?? 99) - (SEG_ORD[b[0]] ?? 99) || a[1].localeCompare(b[1]))
  }, [ventasSegMes])

  const ventasSegFiltradas = useMemo(() => {
    let lista = filtroSeg ? ventasSegMes.filter(v=>v._seg===filtroSeg) : [...ventasSegMes]
    if (fsAsesor)   lista = lista.filter(v => String(v.asesor_nombre || v.vendedor || '').toLowerCase().includes(fsAsesor.trim().toLowerCase()))
    if (fsSala)     lista = lista.filter(v => String(v.sala || '').toLowerCase().includes(fsSala.trim().toLowerCase()))
    if (fsDistrito) lista = lista.filter(v => String(v.distrito || '').toLowerCase().includes(fsDistrito.trim().toLowerCase()))
    if (fsPlan)     lista = lista.filter(v => String(v.paquete || '').toLowerCase().includes(fsPlan.trim().toLowerCase()))
    if (fsDesde || fsHasta) {
      lista = lista.filter(v => {
        const f = soloFecha(v._fecha)
        if (!f) return false
        if (fsDesde && f < fsDesde) return false
        if (fsHasta && f > fsHasta) return false
        return true
      })
    }
    const b = fsBusqueda.trim().toLowerCase()
    if (b) {
      lista = lista.filter(v => [v.nombre, v.dni, v.asesor_nombre, v.vendedor, v.distrito, v.sala, v.paquete]
        .some(x => String(x || '').toLowerCase().includes(b)))
    }
    return lista.sort((a,b) => (SEG_ORD[a._seg]??5) - (SEG_ORD[b._seg]??5))
  }, [ventasSegMes, filtroSeg, fsAsesor, fsSala, fsDistrito, fsPlan, fsDesde, fsHasta, fsBusqueda])

  function limpiarFiltrosSeg() {
    setFiltroSeg(''); try { sessionStorage.setItem(JEF_SEG_FILTRO_KEY, '') } catch {}
    setFsAsesor(''); setFsSala(''); setFsDistrito(''); setFsPlan('')
    setFsDesde(''); setFsHasta(''); setFsBusqueda('')
  }

  function exportarSeguimientoExcel() {
    const columnas = [
      ['ESTADO',           v => (SEG_BADGES[v._seg] || SEG_BADGES.ejecucion).label],
      ['OBS. SEGUIMIENTO', v => v.obs_seguimiento || '-'],
      ['OBS. PROGRAMACIÓN', v => `SOT: ${v.sot || '-'} | Fecha programada: ${formatF(v.fecha_programada)}`],
      ['FECHA',            v => formatF(v._fecha)],
      ['CLIENTE',          v => v.nombre || '-'],
      ['DNI',              v => v.dni || '-'],
      ['DISTRITO',         v => v.distrito || '-'],
      ['ASESOR',           v => v.asesor_nombre || '-'],
      ['SALA',             v => v.sala || '-'],
      ['PLAN',             v => v.paquete || '-'],
      ['TRAMO',            v => v.tramo_seguimiento || '-'],
      ['MOTIVO',           v => v.motivo_seguimiento || '-'],
    ]
    if (ventasSegFiltradas.some(v => v.comentario)) {
      columnas.push(['COMENTARIO', v => v.comentario || '-'])
    }
    descargarExcel(ventasSegFiltradas, columnas, `seguimiento_en_campo_${fechaHoy()}.xlsx`)
  }

  const kpisSeg = useMemo(() => ({
    ejecucion: ventasSegMes.filter(v=>v._seg==='ejecucion').length,
    instalado: ventasSegMes.filter(v=>v._seg==='instalado').length,
    rechazo:   ventasSegMes.filter(v=>v._seg==='rechazo').length,
    caida:     ventasSegMes.filter(v=>v._seg==='caida').length,
    tecnico:   ventasSegMes.filter(v=>v._seg==='tecnico').length,
  }), [ventasSegMes])

  /* ── flujo general de ventas ── */
  const ventasFlujoMes = useMemo(() => {
    const mes = mesReporte || mesActual()
    return ventasCache.filter(v => {
      const fecha = soloFecha(v._fecha || v.fecha_ingreso || v.fecha || v.created_at)
      return String(fecha || '').slice(0, 7) === mes
    })
  }, [ventasCache, mesReporte])

  const resumenFlujoVentas = useMemo(() => ({
    todas: ventasFlujoMes.length,
    validadas: ventasFlujoMes.filter(flujoValidada).length,
    noValidadas: ventasFlujoMes.filter(flujoNoValidada).length,
    grabadas: ventasFlujoMes.filter(flujoGrabada).length,
    noGrabadas: ventasFlujoMes.filter(flujoNoGrabada).length,
    seguimiento: ventasFlujoMes.filter(v => Boolean(estadoSeguimiento(v))).length,
  }), [ventasFlujoMes])

  const opcionesFlujo = useMemo(() => ({
    estados: opcionesUnicas(ventasCache.map(v => v.estado || v.estado_venta)),
  }), [ventasCache])

  // Union de la lista maestra de campañas con lo que realmente aparece en los
  // datos, igual que campanasFiltroBase en Backoffice.jsx — asi una campaña
  // vieja que ya no esta en utils/campanas.js pero sigue en ventas antiguas
  // no queda invisible para filtrar.
  const campanasFlujoOpciones = useMemo(() => [...new Set([
    ...CAMPANAS,
    ...ventasCache.map(v => String(v.campana || '').trim()).filter(Boolean),
  ])].sort((a, b) => a.localeCompare(b, 'es')), [ventasCache])

  const ventasFlujoFiltradas = useMemo(() => {
    let lista = fvTipoFecha === 'venta' ? [...ventasFlujoMes] : [...ventasCache]
    if (filtroFlujoVentas === 'validadas') lista = lista.filter(flujoValidada)
    if (filtroFlujoVentas === 'noValidadas') lista = lista.filter(flujoNoValidada)
    if (filtroFlujoVentas === 'grabadas') lista = lista.filter(flujoGrabada)
    if (filtroFlujoVentas === 'noGrabadas') lista = lista.filter(flujoNoGrabada)
    if (filtroFlujoVentas === 'seguimiento') {
      lista = lista.filter(v => Boolean(estadoSeguimiento(v)))
    }
    if (fvEstados.length) lista = lista.filter(v => fvEstados.includes(v.estado || v.estado_venta || ''))
    if (fvValidacion) lista = lista.filter(v => coincideFiltroValidacion(v, fvValidacion))
    if (fvGrabacion) lista = lista.filter(v => categoriaFiltroGrabacion(v) === fvGrabacion)
    if (fvCanal) lista = lista.filter(v => String(v.canal || '').toUpperCase() === fvCanal)
    if (fvCampana.length) lista = lista.filter(v => fvCampana.some(c => c.toUpperCase() === String(v.campana || '').trim().toUpperCase()))
    if (fvAsesor) lista = lista.filter(v => String(v.asesor_nombre || v.asesor || v.vendedor || '').toLowerCase().includes(fvAsesor.trim().toLowerCase()))
    if (fvSala) lista = lista.filter(v => String(v.sala || '').toLowerCase().includes(fvSala.trim().toLowerCase()))
    if (fvDistrito) lista = lista.filter(v => String(v.distrito || '').toLowerCase().includes(fvDistrito.trim().toLowerCase()))
    // Con solo "desde" puesto (un clic en el calendario) se filtra ese dia
    // exacto; con "desde" y "hasta" (dos clics) se filtra el rango completo.
    const enRangoOFecha = (f, desde, hasta) => {
      if (!f || (!desde && !hasta)) return !desde && !hasta
      if (desde && !hasta) return f === desde
      if (desde && f < desde) return false
      if (hasta && f > hasta) return false
      return true
    }
    if (fvTipoFecha === 'programacion' && (fvProgDesde || fvProgHasta)) {
      lista = lista.filter(v => {
        if (estadoProgramacionFlujo(v).key !== 'PROGRAMADO') return false
        const f = [v.fecha_programada, v.fecha_prog, v.fecha_programado].map(soloFecha).find(Boolean)
        return enRangoOFecha(f, fvProgDesde, fvProgHasta)
      })
    }
    if (fvTipoFecha === 'venta' && (fvDesde || fvHasta)) {
      lista = lista.filter(v => enRangoOFecha(soloFecha(v._fecha || v.fecha_ingreso || v.fecha || v.created_at), fvDesde, fvHasta))
    }
    const b = busqFlujoVentas.trim().toLowerCase()
    if (b) {
      lista = lista.filter(v => [
        v.nombre, v.nombre_apellidos, v.cliente, v.dni, v.documento, v.telefono, v.n1, v.n2,
        v.telefono1, v.telefono2, v.tel_contacto, v.tel_referencia,
        v.asesor_nombre, v.asesor, v.vendedor, v.sala, v.estado, v.estado_venta, v.distrito
      ].some(x => String(x || '').toLowerCase().includes(b)))
    }

    return lista.sort((a, b) => {
      const fb = String(b._fecha || b.fecha_ingreso || b.fecha || b.created_at || '')
      const fa = String(a._fecha || a.fecha_ingreso || a.fecha || a.created_at || '')
      return fb.localeCompare(fa) || Number(b.id || 0) - Number(a.id || 0)
    })
  }, [ventasCache, ventasFlujoMes, filtroFlujoVentas, busqFlujoVentas, fvEstados, fvValidacion, fvGrabacion, fvCanal, fvCampana, fvAsesor, fvSala, fvDistrito, fvTipoFecha, fvDesde, fvHasta, fvProgDesde, fvProgHasta])

  const totalPaginasFlujo = Math.max(1, Math.ceil(ventasFlujoFiltradas.length / porPaginaFlujo))
  const ventasFlujoPagina = useMemo(() => {
    const inicio = (paginaFlujo - 1) * porPaginaFlujo
    return ventasFlujoFiltradas.slice(inicio, inicio + porPaginaFlujo)
  }, [ventasFlujoFiltradas, paginaFlujo, porPaginaFlujo])

  useEffect(() => { setPaginaFlujo(1) }, [filtroFlujoVentas, busqFlujoVentas, fvEstados, fvValidacion, fvGrabacion, fvCanal, fvCampana, fvAsesor, fvSala, fvDistrito, fvTipoFecha, fvDesde, fvHasta, fvProgDesde, fvProgHasta, porPaginaFlujo])
  useEffect(() => { if (paginaFlujo > totalPaginasFlujo) setPaginaFlujo(totalPaginasFlujo) }, [paginaFlujo, totalPaginasFlujo])

  function limpiarFiltrosFlujo() {
    setFiltroFlujoVentas('todas')
    setBusqFlujoVentas('')
    setFvEstados([]); setFvValidacion(''); setFvGrabacion(''); setFvCanal(''); setFvCampana([])
    setFvAsesor(''); setFvSala(''); setFvDistrito('')
    setFvTipoFecha('venta')
    setFvDesde(''); setFvHasta('')
    setFvProgDesde(''); setFvProgHasta('')
  }

  // Pegado desde Excel/Sheets: cada línea trae 5 columnas separadas por TAB —
  // Nombres y apellidos, Número de doc, SOT, Fecha oficial, Código de pago.
  function parsearFilasCobCodigos(texto) {
    return texto.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim()).map(linea => {
      const cols = linea.split('\t')
      return {
        documento: (cols[0] || '').trim(),
        sot: (cols[1] || '').trim(),
        fecha_oficial: (cols[2] || '').trim(),
        codigo_pago: (cols[3] || '').trim(),
      }
    })
  }

  async function procesarCobCodigos() {
    const filas = parsearFilasCobCodigos(cobCodigosTexto)
    if (!filas.length) { setCobCodigosMensaje('Pega al menos una fila con datos.'); return }
    setCobCodigosProcesando(true)
    setCobCodigosMensaje('')
    setCobCodigosResultado(null)
    try {
      const res = await fetch(`${API}/ventas/cobranza-codigos-masivo`, {
        method: 'POST', headers: ncHeaders(), body: JSON.stringify({ filas }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo procesar el lote')
      setCobCodigosResultado(data)
    } catch (e) {
      setCobCodigosMensaje(e.message || 'Error conectando con el servidor')
    } finally {
      setCobCodigosProcesando(false)
    }
  }

  function limpiarCobCodigos() {
    setCobCodigosTexto(''); setCobCodigosResultado(null); setCobCodigosMensaje('')
  }

  function exportarVentasExcel() {
    descargarExcel(ventasFlujoFiltradas, [
      ['FECHA SUBIDA',      v => formatF(soloFecha(v._fecha || v.fecha_ingreso || v.fecha || v.created_at))],
      ['CLIENTE',           v => v.nombre || v.nombre_apellidos || v.cliente || '-'],
      ['DNI',               v => v.dni || v.documento || '-'],
      ['SOT',               v => v.sot || '-'],
      ['DISTRITO',          v => v.distrito || '-'],
      ['ASESOR',            v => v.asesor_nombre || v.asesor || v.vendedor || '-'],
      ['SALA',              v => v.sala || '-'],
      ['VALIDACIÓN',        v => estadoValidacion(v)],
      ['GRABACIÓN',         v => estadoGrabacion(v)],
      ['PROGRAMACIÓN',      v => estadoProgramacionFlujo(v).label + (v.usuario_prog ? ` (Por: ${v.usuario_prog})` : '')],
      ['FECHA PROGRAMACIÓN', v => soloFecha(v.fecha_programada || v.fecha_prog || v.fecha_programado) ? formatF(soloFecha(v.fecha_programada || v.fecha_prog || v.fecha_programado)) : '-'],
      ['SEGUIMIENTO',       v => estadoSeguimiento(v) ? flujoLabelEstado(estadoSeguimiento(v)) : '-'],
      ['FECHA DE INSTALACIÓN', v => soloFecha(v.fecha_instalado) ? formatF(soloFecha(v.fecha_instalado)) : '-'],
    ], `ventas_generales_${fechaHoy()}.xlsx`)
  }

  /* ── reportes ── */
  const { reporteData, repKpis } = useMemo(() => {
    const esMesReporte = valor => String(soloFecha(valor) || '').slice(0, 7) === mesReporte
    const ventasDelMes = mesReporte
      ? ventasCache.filter(v => {
          const fecha = soloFecha(v._fecha || v.fecha_ingreso || v.fecha || v.created_at)
          return fecha && String(fecha).slice(0, 7) === mesReporte
        })
      : ventasCache
    // Instaladas pertenecen al mes en que Seguimiento las marco como
    // instaladas. Asi coincide con el filtro "Fecha de instalacion" de
    // Ventas generales y no mezcla instalaciones reales con fecha programada.
    // El criterio de "instalada" (instalado/instalado no validado/reasignación)
    // debe coincidir con esVentaInstalada de Dashboard.jsx y con el ranking de
    // Supervisor.jsx: si solo se exige estado exacto "INSTALADO" aquí, una
    // reasignación o un "instalado no validado" cuenta en esos otros reportes
    // pero no en este, y el mismo asesor sale con dos totales distintos.
    const esInstaladaDelMes = v => {
      const estado = String(v.estado || '').trim().toUpperCase().replace(/_/g, ' ')
      return estado === 'INSTALADO' || estado === 'INSTALADO NO VALIDADO' || estado === 'REASIGNACION'
    }
    const instaladasDelMes = mesReporte
      ? ventasCache.filter(v => esMesReporte(v.fecha_instalado) && esInstaladaDelMes(v))
      : ventasCache.filter(ventaAlcanzoInstalacion)
    const caidasDelMes = mesReporte
      ? ventasCache.filter(v => esMesReporte(v.fecha_programada) && ['CAIDA', 'RECHAZO_CAMPO'].includes(String(v.estado || '').trim().toUpperCase()))
      : ventasCache.filter(v => String(v.estado || '').trim().toUpperCase() === 'CAIDA')
    let asesFilt = usuarios.filter(u=>usuarioTieneCargo(u,'asesor'))
    if (salaReporte !== 'todas') asesFilt = asesFilt.filter(u=>u.sala===salaReporte)
    // Al filtrar por sala, se agrupa por v.sala (sala ATRIBUIDA de la venta,
    // ver PATCH /ventas/:id/sala-atribucion) y no por la sala actual del
    // asesor en usuarios. Si un asesor vendio 4 de sus 20 instaladas para
    // otra sala y luego volvio a la suya, esas 4 deben contar para la sala
    // a la que se atribuyeron (con su nombre), no para la sala donde esta
    // hoy — si no, la sala actual se queda con ventas que no le tocan y la
    // sala atribuida pierde la cuota que sus supervisores si deben recibir.
    const ventasFilt       = salaReporte === 'todas' ? ventasDelMes       : ventasDelMes.filter(v=>String(v.sala||'').toUpperCase()===salaReporte)
    const instaladasFilt   = salaReporte === 'todas' ? instaladasDelMes   : instaladasDelMes.filter(v=>String(v.sala||'').toUpperCase()===salaReporte)
    const caidasFilt       = salaReporte === 'todas' ? caidasDelMes       : caidasDelMes.filter(v=>String(v.sala||'').toUpperCase()===salaReporte)
    const inst   = instaladasFilt.length
    const caidas = caidasFilt.length
    // Efectividad = Instaladas / (Instaladas + Caídas), igual que en el
    // Dashboard del asesor. No se divide entre el total de ventas del mes:
    // eso mezclaba ventas todavía en curso (en ejecución, técnico en casa,
    // etc.) en el denominador y hacía bajar la efectividad artificialmente.
    const efect  = (inst + caidas) ? Math.round(inst/(inst+caidas)*100) : 0
    // Filas del ranking: los asesores del roster actual de la sala (para que
    // se vean aunque tengan 0 ventas atribuidas) mas cualquier otro nombre
    // que sí tenga una venta atribuida a esta sala este mes (por ejemplo, un
    // asesor que ya se movio a otra sala pero dejo ventas atribuidas aqui).
    const nombresConVentaAqui = [...new Set(ventasFilt.map(v=>v.asesor_nombre).filter(Boolean))]
    const filasBase = salaReporte === 'todas'
      ? asesFilt
      : [...asesFilt, ...nombresConVentaAqui
          .filter(n=>!asesFilt.some(a=>a.nombre===n))
          .map(n=>{
            const u = usuarios.find(u=>u.nombre===n)
            return u ? { ...u, sala: salaReporte } : { nombre:n, sala:salaReporte, usuario:'' }
          })]
    const rendData = filasBase.map(a => {
      const mis   = ventasFilt.filter(v=>(v.asesor_nombre||'')===a.nombre)
      const inst2 = instaladasFilt.filter(v=>(v.asesor_nombre||'')===a.nombre).length
      const caid  = caidasFilt.filter(v=>(v.asesor_nombre||'')===a.nombre).length
      const ef    = (inst2 + caid) ? Math.round(inst2/(inst2+caid)*100) : 0
      return { ...a, totalVentas:mis.length, instaladas:inst2, caidas:caid, efectividad:ef }
    }).sort((a,b)=>
      b.instaladas-a.instaladas ||
      b.efectividad-a.efectividad ||
      b.totalVentas-a.totalVentas ||
      String(a.nombre||'').localeCompare(String(b.nombre||''))
    )
    return { reporteData:rendData, repKpis:{ total:ventasFilt.length, inst, caidas, efect:efect+'%' } }
  }, [usuarios, ventasCache, salaReporte, mesReporte])

  /* ── usuarios filtrados ── */
  const salasUsuariosDisponibles = useMemo(() => [...new Set(usuarios.map(u=>u.sala).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')), [usuarios])
  const usuariosFiltrados = useMemo(() => {
    const b = busqUsuarios.toLowerCase()
    return usuarios.filter(u => {
      if (b && !(u.nombre||'').toLowerCase().includes(b) && !(u.usuario||'').toLowerCase().includes(b) && !(u.sala||'').toLowerCase().includes(b)) return false
      if (filtroUsuarioCargo && !usuarioTieneCargo(u, filtroUsuarioCargo)) return false
      if (filtroUsuarioSala && (u.sala||'') !== filtroUsuarioSala) return false
      return true
    })
  }, [usuarios, busqUsuarios, filtroUsuarioCargo, filtroUsuarioSala])

  /* ── modal usuario ── */
  function abrirModalNuevo() {
    setEditandoId(null); setModForm(MOD_FORM_VACIO); setModErrores({}); setModalUsu(true)
  }
  function abrirModalEditar(u) {
    setEditandoId(u.id)
    const permisosExtra = permisosDeUsuario(u).filter(c => c !== u.cargo)
    const cargo2 = permisosExtra[0] || ''
    const cargo3 = permisosExtra[1] || ''
    const salaActual = String(u.sala || '').trim()
    setModForm({ nombre:u.nombre||'', usuario:u.usuario||'', cargo:u.cargo||'', cargo2, cargo3, sala:salaActual, salaManual:!salaActual || !SALAS.includes(salaActual), pass:'', pass2:'' })
    setModErrores({}); setModalUsu(true)
  }
  function cerrarModalUsu() { setModalUsu(false); setEditandoId(null); setModForm(MOD_FORM_VACIO); setModErrores({}) }
  function setField(k, v) { setModForm(f=>({...f,[k]:v})); setModErrores(e=>({...e,[k]:false})) }

  async function guardarUsuario() {
    const { nombre, usuario, cargo, cargo2, cargo3, sala, pass, pass2 } = modForm
    const errs = {}
    let primerError = ''
    if (!nombre.trim())              { errs.nombre = true; primerError ||= 'El nombre completo es obligatorio.' }
    if (!usuario.trim())             { errs.usuario = true; primerError ||= 'El usuario es obligatorio.' }
    if (!cargo)                      { errs.cargo  = true; primerError ||= 'Selecciona un cargo principal.' }
    if (cargo2 && cargo2 === cargo)  { errs.cargo2 = true; primerError ||= 'El cargo adicional debe ser diferente al principal.' }
    if (cargo3 && cargo3 === cargo)  { errs.cargo3 = true; primerError ||= 'El segundo cargo adicional debe ser diferente al principal.' }
    if (cargo3 && cargo3 === cargo2) { errs.cargo3 = true; primerError ||= 'El segundo cargo adicional debe ser diferente al primero.' }
    if (!editandoId && !pass)        { errs.pass   = true; primerError ||= 'La contraseña es obligatoria.' }
    if (pass && pass.length < 6)     { errs.pass   = true; primerError ||= 'La contraseña debe tener al menos 6 caracteres.' }
    if (pass && pass !== pass2)      { errs.pass2  = true; primerError ||= 'Las contraseñas no coinciden.' }
    if (Object.keys(errs).length) { setModErrores(errs); mostrarToast(primerError); return }

    const permisos = [cargo2, cargo3].filter(Boolean)
    setGuardandoUsu(true)
    try {
      const loginNorm = usuario.trim().toLowerCase().replace(/\s+/g, '.')
      let res
      if (editandoId) {
        const body = { nombre, usuario: loginNorm, cargo, sala: sala || null, permisos }
        if (pass) body.password = pass
        res = await fetch(`${API}/usuarios/${editandoId}`, { method: 'PATCH', headers: ncHeaders(), body: JSON.stringify(body) })
      } else {
        res = await fetch(`${API}/usuarios`, {
          method: 'POST', headers: ncHeaders(),
          body: JSON.stringify({ nombre, usuario: loginNorm, password: pass, cargo, sala: sala || null, activo: true, permisos })
        })
      }
      const ct   = res.headers.get('content-type') || ''
      const data = ct.includes('application/json') ? await res.json() : { ok: false, mensaje: (await res.text()) || `Error HTTP ${res.status}` }
      if (!res.ok || !data.ok) { mostrarToast(data.mensaje || `Error ${res.status}`); return }
      agregarLog(editandoId ? 'Usuario editado' : 'Usuario creado', editandoId ? nombre : `${nombre} — ${cargo}`)
      await cargarUsuarios()
      cerrarModalUsu()
    } catch { mostrarToast('Error conectando con el servidor') }
    finally { setGuardandoUsu(false) }
  }

  async function toggleActivo(u) {
    const nuevo = !u.activo
    try {
      const res  = await fetch(`${API}/usuarios/${u.id}/estado`,{method:'PATCH',headers:ncHeaders(),body:JSON.stringify({activo:nuevo})})
      const data = await res.json()
      if (!data.ok) { mostrarToast(data.mensaje); return }
      setUsuarios(list=>list.map(x=>x.id===u.id?{...x,activo:nuevo}:x))
      agregarLog(nuevo?'Activado':'Desactivado', u.nombre)
    } catch { mostrarToast('Error') }
  }

  async function desbloquearUsuario(u) {
    if (!u?.id) return
    try {
      const res = await fetch(`${API}/usuarios/${u.id}/desbloquear-login`, { method:'PATCH', headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) { mostrarToast(data.mensaje || 'No se pudo desbloquear'); return }
      mostrarToast(data.mensaje || `${u.nombre} fue desbloqueado`)
      agregarLog('Usuario desbloqueado', u.nombre)
    } catch { mostrarToast('Error conectando con el servidor') }
  }

  async function confirmarEliminarUsuario() {
    if (!modalEliminar || eliminandoUsu) return
    if (modalEliminar.cargo === 'jefatura') {
      const jefActivas = usuarios.filter(u => usuarioTieneCargo(u, 'jefatura') && u.activo)
      if (jefActivas.length <= 1) {
        mostrarToast('No puedes eliminar el último usuario de Jefatura')
        return
      }
    }
    setEliminandoUsu(true)
    try {
      const res = await fetch(`${API}/usuarios/${modalEliminar.id}`, { method:'DELETE', headers:ncHeaders() })
      const data = await res.json()
      if (!data.ok) { mostrarToast(data.mensaje||'No se pudo eliminar'); setEliminandoUsu(false); return }
      agregarLog('Usuario eliminado', modalEliminar.nombre)
      setModalEliminar(null)
      await cargarUsuarios()
    } catch {
      mostrarToast('Error conectando con el servidor')
    } finally {
      setEliminandoUsu(false)
    }
  }

  function limpiarLogs() {
    if (!window.confirm('¿Limpiar logs?')) return
    setLogs([])
    try { localStorage.removeItem('jef_logs') } catch {}
  }

  /* ── meses para select ── */
  const MESES_SALAS = useMemo(() => {
    const actual = mesActual()
    const inicioOperacion = '2026-08'
    const meses = new Set()
    const agregarMes = valor => {
      const fecha = soloFecha(valor)
      const mes = String(fecha || '').slice(0, 7)
      if (/^\d{4}-\d{2}$/.test(mes) && mes >= inicioOperacion && mes <= actual) meses.add(mes)
    }
    ventasCache.forEach(v => {
      agregarMes(v._fecha || v.fecha_ingreso || v.fecha || v.created_at)
    })
    meses.delete(actual)
    return [
      { value:'', label:'Mes actual' },
      ...[...meses].sort((a,b)=>b.localeCompare(a)).map(mes => {
        const [anio, numeroMes] = mes.split('-').map(Number)
        const label = new Date(anio, numeroMes - 1, 1).toLocaleString('es-PE',{month:'long',year:'numeric'})
        return { value:mes, label:label.charAt(0).toUpperCase()+label.slice(1) }
      }),
    ]
  }, [ventasCache])

  function salir() { logout(); navigate('/login') }

  /* ═══════════════════════════════════
     RENDER
  ═══════════════════════════════════ */
  return (
    <div className="jef-root">
      {/* TOPBAR */}
      <div className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="menu-toggle"
            aria-label={menuMovilAbierto ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuMovilAbierto}
            aria-controls="jefatura-sidebar"
            onClick={() => setMenuMovilAbierto(abierto => !abierto)}
          >
            <span></span><span></span><span></span>
          </button>
          <div className="brand">
          <div className="logo-circle"><img src="/assets/logo-futura.png" alt="NC" onError={e=>{e.target.parentNode.textContent='NC'}} /></div>
          <div className="brand-text">
            <img src="/assets/futura-wordmark.png" alt="FUTURA" style={{height:22,width:"auto",display:"block"}} />
            <span className="brand-sub">Panel de Jefatura</span>
          </div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="topbar-badge">JEFATURA</span>
          <span className="topbar-user">{usuarioNombre}</span>
          <CambiarAreaMenu />
          <button className="topbar-salir" onClick={salir}>Salir</button>
        </div>
      </div>

      <div className="app-layout">
        {/* SIDEBAR */}
        <aside id="jefatura-sidebar" className={`sidebar${menuMovilAbierto ? ' open' : ''}`}>
          <div className="sidebar-sep">General</div>
          <button className={`nav-btn${seccion==='dashboard'?'   active':''}`} onClick={()=>irSeccion('dashboard')}><span className="nav-dot"></span> Dashboard</button>
          <button className={`nav-btn${seccion==='accesos'?'     active':''}`} onClick={()=>irSeccion('accesos')}><span className="nav-dot"></span> Accesos directos</button>
          <div className="sidebar-sep">Operaciones</div>
          <button className={`nav-btn${seccion==='marketing-leads'?' active':''}`} onClick={()=>irSeccion('marketing-leads')}><span className="nav-dot"></span> Marketing · Leads</button>
          <button className={`nav-btn${seccion==='envio-masivo'?' active':''}`} onClick={()=>irSeccion('envio-masivo')}><span className="nav-dot"></span> Envío masivo</button>
          <button className={`nav-btn${seccion==='ventas-flujo'?' active':''}`} onClick={()=>irSeccion('ventas-flujo')}><span className="nav-dot"></span> Ventas generales</button>
          <button className={`nav-btn${seccion==='seguimiento'?' active':''}`} onClick={()=>irSeccion('seguimiento')}><span className="nav-dot"></span> Seguimiento en campo</button>
          <button className={`nav-btn${seccion==='reclutados-generales'?' active':''}`} onClick={()=>irSeccion('reclutados-generales')}><span className="nav-dot"></span> Reclutados generales</button>
          <div className="sidebar-sep">Gestión</div>
          <button className={`nav-btn${seccion==='usuarios'?'   active':''}`} onClick={()=>irSeccion('usuarios')}><span className="nav-dot"></span> Usuarios</button>
          <button className={`nav-btn${seccion==='reportes'?'   active':''}`} onClick={()=>irSeccion('reportes')}><span className="nav-dot"></span> Reportes</button>
          <div className="sidebar-sep">Sistema</div>
          <button className={`nav-btn${seccion==='logs'?'       active':''}`} onClick={()=>irSeccion('logs')}><span className="nav-dot"></span> Logs de actividad</button>
          <button className={`nav-btn${seccion==='eliminaciones'?' active':''}`} onClick={()=>irSeccion('eliminaciones')}><span className="nav-dot"></span> Eliminaciones generales</button>
        </aside>

        {menuMovilAbierto && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Cerrar menú"
            onClick={() => setMenuMovilAbierto(false)}
          />
        )}

        <main className="main" ref={mainRef}>

          {/* ===== DASHBOARD ===== */}
          <section className={`section${seccion==='dashboard'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Dashboard General</h2><p>Métricas del mes seleccionado</p></div>
              <select value={mesReporte} onChange={e=>setMesReporte(e.target.value)}
                aria-label="Mes de las métricas del dashboard"
                style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:'9px',fontSize:'12px',fontFamily:'inherit',outline:'none',color:'#374151',cursor:'pointer',background:'#fff'}}>
                {MESES_SALAS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div className="kpi-grid" style={{gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))'}}>
              <div className="kpi-card k-blue">  <div className="kpi-num">{kpis.ventasMes}</div>     <div className="kpi-label">Ventas del mes</div>     <div className="kpi-sub">altas del periodo</div></div>
              <div className="kpi-card k-purple"><div className="kpi-num">{kpis.validadas}</div>     <div className="kpi-label">Validadas</div>          <div className="kpi-sub">pasaron validación</div></div>
              <div className="kpi-card k-red">   <div className="kpi-num">{kpis.noValidadas}</div>   <div className="kpi-label">No validadas</div>       <div className="kpi-sub">rechazadas val.</div></div>
              <div className="kpi-card k-orange"><div className="kpi-num">{kpis.grabadas}</div>      <div className="kpi-label">Grabadas</div>           <div className="kpi-sub">con audio</div></div>
              <div className="kpi-card k-yellow"><div className="kpi-num">{kpis.noGrabadas}</div>    <div className="kpi-label">No grabadas</div>        <div className="kpi-sub">esperando audio</div></div>
              <div className="kpi-card k-teal">  <div className="kpi-num">{kpis.enEjecucion}</div>   <div className="kpi-label">En ejecución</div>       <div className="kpi-sub">programadas</div></div>
              <div className="kpi-card" style={{borderTopColor:'#94a3b8'}}><div className="kpi-num">{kpis.noProgramadas}</div><div className="kpi-label">No programadas</div><div className="kpi-sub">esperando prog.</div></div>
              <div className="kpi-card k-green"> <div className="kpi-num">{kpis.instaladas}</div>    <div className="kpi-label">Instaladas</div>         <div className="kpi-sub">completadas</div></div>
              <div className="kpi-card k-red">   <div className="kpi-num">{kpis.caidas}</div>        <div className="kpi-label">Caídas + Rechazos</div>  <div className="kpi-sub">fallidas</div></div>
              <div className="kpi-card k-purple"><div className="kpi-num">{kpis.conv}</div>          <div className="kpi-label">Efectividad mes</div>    <div className="kpi-sub">inst / (inst+caídas)</div></div>
              <div className="kpi-card k-teal">  <div className="kpi-num">{kpis.totalUs}</div>       <div className="kpi-label">Usuarios</div>           <div className="kpi-sub">registrados</div></div>
              <div className="kpi-card k-yellow"><div className="kpi-num">{kpis.activos}</div>       <div className="kpi-label">Activos</div>            <div className="kpi-sub">en el sistema</div></div>
              <div className="kpi-card k-blue">  <div className="kpi-num">{kpis.asesores}</div>      <div className="kpi-label">Asesores</div>           <div className="kpi-sub">activos</div></div>
              <div className="kpi-card k-orange"><div className="kpi-num">{kpis.supervisores}</div>  <div className="kpi-label">Supervisores</div>       <div className="kpi-sub">activos</div></div>
            </div>
            <div className="charts-grid">
              <div className="chart-card">
                <div className="chart-title">Ventas por estado</div>
                <div className="chart-wrap"><canvas ref={canvasEstados}></canvas></div>
              </div>
              <div className="chart-card">
                <div className="chart-title-row">
                  <span>Instaladas y Caídas por sala</span>
                  <select value={mesReporte} onChange={e=>setMesReporte(e.target.value)}
                    style={{padding:'4px 8px',border:'1px solid #e5e7eb',borderRadius:'7px',fontSize:'11px',fontFamily:'inherit',outline:'none',color:'#374151',cursor:'pointer'}}>
                    {MESES_SALAS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="chart-wrap"><canvas ref={canvasSalas}></canvas></div>
              </div>
              <div className="chart-card full">
                <div className="chart-title-row">
                  <span>Ventas diarias por sala — últimos 7 días</span>
                  <span style={{fontSize:'11px',color:'#9ca3af'}}>Se actualiza cada 60 seg.</span>
                </div>
                <div className="chart-wrap"><canvas ref={canvasDiario}></canvas></div>
              </div>
            </div>
          </section>

          {/* ===== ACCESOS ===== */}
          <section className={`section${seccion==='accesos'?' active':''}`}>
            <div className="sec-header"><div><h2>Accesos Directos</h2><p>Navega a cualquier módulo del sistema</p></div></div>
            <div className="accesos-grid">
              {ACCESOS_MODS.map(m => {
                const cantidad = usuarios.filter(u=>usuarioTieneCargo(u,m.cargo)).length
                return (
                  <button
                    key={m.path}
                    type="button"
                    className="acceso-card"
                    style={{'--mod-color':m.color,'--mod-soft':m.color+'12'}}
                    onClick={()=>abrirSelectorModulo(m)}
                  >
                    <div className="acceso-card-head">
                      <div className="acceso-icon"><ModuloIcon tipo={m.icon} size={24}/></div>
                      <span className="acceso-conteo">{cantidad} {cantidad===1?'usuario':'usuarios'}</span>
                    </div>
                    <div className="acceso-card-body">
                      <div className="acceso-nombre">{m.nombre}</div>
                      <div className="acceso-desc">{m.desc}</div>
                    </div>
                    <div className="acceso-card-foot">
                      <span>Seleccionar usuario</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* ===== SEGUIMIENTO ===== */}
          <section className={`section${seccion==='seguimiento'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Seguimiento en campo</h2><p>Estados correspondientes al mes seleccionado</p></div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <select value={mesReporte} onChange={e=>setMesReporte(e.target.value)} aria-label="Mes de seguimiento"
                  style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:'9px',fontSize:'12px',fontFamily:'inherit',outline:'none',color:'#374151',cursor:'pointer',background:'#fff'}}>
                  {MESES_SALAS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <button className="btn-nuevo" style={{background:'#0891b2'}} onClick={cargarSeguimiento}>↻ Actualizar</button>
              </div>
            </div>
            <div className="kpi-grid seguimiento-kpi-grid">
              <div className="kpi-card k-teal">  <div className="kpi-num">{kpisSeg.ejecucion}</div><div className="kpi-label">En ejecución</div></div>
              <div className="kpi-card k-green">  <div className="kpi-num">{kpisSeg.instalado}</div><div className="kpi-label">Instalados</div></div>
              <div className="kpi-card k-orange"> <div className="kpi-num">{kpisSeg.rechazo}</div>  <div className="kpi-label">Rechazo en campo</div></div>
              <div className="kpi-card k-red">    <div className="kpi-num">{kpisSeg.caida}</div>    <div className="kpi-label">Caídas</div></div>
              <div className="kpi-card k-purple"> <div className="kpi-num">{kpisSeg.tecnico}</div>  <div className="kpi-label">Técnicos en casa</div></div>
              <button type="button" className="kpi-card k-green export-kpi-card" onClick={exportarSeguimientoExcel}>
                <span className="export-kpi-icon" aria-hidden="true">⇩</span>
                <span className="kpi-label">Exportar Excel</span>
              </button>
            </div>
            <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
              {[['','Todos'], ...estadosSeg].map(([id, label]) => (
                <button key={id || 'todos'}
                  className={`seg-tab${filtroSeg===id?' active':''}`}
                  style={filtroSeg===id && SEG_BADGES[id] ? { background:SEG_BADGES[id].bg, color:SEG_BADGES[id].color, borderColor:SEG_BADGES[id].border } : undefined}
                  onClick={() => { setFiltroSeg(id); try{sessionStorage.setItem(JEF_SEG_FILTRO_KEY,id)}catch{} }}>
                  {label}
                </button>
              ))}
            </div>
            <div className="filtros-avanzados">
              <div className="filtros-titulo">Filtros avanzados</div>
              <div className="filtros-grid">
                <label><span>Asesor</span><input value={fsAsesor} onChange={e=>setFsAsesor(e.target.value)} placeholder="Escribir asesor..."/></label>
                <label><span>Sala</span><input value={fsSala} onChange={e=>setFsSala(e.target.value)} placeholder="Escribir sala..."/></label>
                <label><span>Distrito</span><input value={fsDistrito} onChange={e=>setFsDistrito(e.target.value)} placeholder="Escribir distrito..."/></label>
                <label><span>Plan</span><input value={fsPlan} onChange={e=>setFsPlan(e.target.value)} placeholder="Escribir plan..."/></label>
                <label><span>Fecha desde</span><input type="date" value={fsDesde} onChange={e=>setFsDesde(e.target.value)}/></label>
                <label><span>Fecha hasta</span><input type="date" value={fsHasta} onChange={e=>setFsHasta(e.target.value)}/></label>
                <label className="filtro-busqueda"><span>Búsqueda general</span><input value={fsBusqueda} onChange={e=>setFsBusqueda(e.target.value)} placeholder="Cliente, DNI, asesor, distrito, sala, plan"/></label>
                <button type="button" className="flujo-clear filtro-limpiar" onClick={limpiarFiltrosSeg}>Limpiar</button>
              </div>
            </div>
            <div className="tabla-wrap usuarios-pro-card">
              <div className="tabla-header">
                <span className="tabla-title">Ventas en seguimiento</span>
                <span className="tabla-count">{ventasSegFiltradas.length} registros</span>
              </div>
              <div className="flujo-tabla-scroll">
                <table className="tabla seguimiento-tabla">
                  <colgroup>
                    <col style={{width:'145px'}} />
                    <col style={{width:'240px'}} />
                    <col style={{width:'200px'}} />
                    <col style={{width:'110px'}} />
                    <col style={{width:'160px'}} />
                    <col style={{width:'110px'}} />
                    <col style={{width:'120px'}} />
                    <col style={{width:'110px'}} />
                    <col style={{width:'90px'}} />
                    <col style={{width:'180px'}} />
                    <col style={{width:'330px'}} />
                  </colgroup>
                  <thead><tr>
                    <th>Estado</th><th>Obs. Seguimiento</th><th>Obs. Programación</th><th>Fecha</th><th>Cliente</th><th>DNI</th>
                    <th>Distrito</th><th>Asesor</th><th>Sala</th><th>Plan</th><th>Acciones</th>
                  </tr></thead>
                  <tbody>
                    {ventasSegFiltradas.length === 0
                      ? <tr><td colSpan="11" className="tabla-empty">Sin registros.</td></tr>
                      : ventasSegFiltradas.map((v, i) => {
                          const b = SEG_BADGES[v._seg] || SEG_BADGES.ejecucion
                          return (
                            <tr key={v.id != null ? `seg-${v.id}` : `seg-i-${i}`}>
                              <td><span style={{display:'inline-block',padding:'4px 12px',borderRadius:'99px',fontSize:'10px',fontWeight:700,letterSpacing:'.3px',background:b.bg,color:b.color,border:`1px solid ${b.border}`,whiteSpace:'nowrap'}}>{b.label}</span></td>
                              <td><ObsSeguimientoCell tramo={v.tramo_seguimiento} comentario={v.obs_seguimiento} motivo={v.motivo_seguimiento} /></td>
                              <td><ProgramacionInfoCell sot={v.sot} fecha={v.fecha_programada} /></td>
                              <td style={{fontSize:'11px',color:'#185FA5',fontWeight:700,whiteSpace:'nowrap'}}>{formatF(v._fecha)}</td>
                              <td style={{fontWeight:600,fontSize:'12px'}}>{v.nombre||'—'}</td>
                              <td style={{fontFamily:'monospace',fontSize:'11px'}}>{v.dni||'—'}</td>
                              <td style={{fontSize:'11px'}}>{v.distrito||'—'}</td>
                              <td style={{fontWeight:600,color:'#7C3AED',fontSize:'11px'}}>{v.asesor_nombre||'—'}</td>
                              <td style={{fontSize:'11px',color:'#9ca3af'}}>{v.sala||'—'}</td>
                              <td style={{fontSize:'10px',maxWidth:'120px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v.paquete||'—'}</td>
                              <td style={{minWidth:'310px'}}>
                                <div className="venta-actions">
                                  <button type="button" className="venta-action-btn" onClick={()=>setMediaVenta(v)}>Archivos</button>
                                  <button type="button" className="venta-action-btn" onClick={()=>setVentaEditar(v)}>Editar</button>
                                  <button type="button" className="venta-action-btn reassign" onClick={()=>setVentaReasignar(v)}>Reasignar</button>
                                  <button type="button" className="venta-action-btn" onClick={()=>setVentaHistorial(v)}>Historial</button>
                                  <button type="button" className="venta-action-btn delete" onClick={()=>eliminarVenta(v)}>Eliminar</button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== DASHBOARD DE LEADS PARA MARKETING (SOLO JEFATURA) ===== */}
          <section className={`section${seccion==='marketing-leads'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Dashboard de Leads por Campaña</h2><p>Información de altas y resultados para las áreas de Marketing y Reclutamiento</p></div>
              <div style={{display:'flex',gap:8}}>
                {marketingVista==='ventas' && <button className="btn-nuevo" style={{background:'#0f766e'}} onClick={exportarMarketingExcel} disabled={!marketingData.length}>Exportar Excel</button>}
                {marketingVista==='reclutamiento' && <button className="btn-nuevo" style={{background:'#0f766e'}} onClick={exportarMarketingReclExcel} disabled={!marketingReclData.length}>Exportar Excel</button>}
                {marketingVista==='costos' && <button className="btn-nuevo" style={{background:'#0f766e'}} onClick={exportarCostosExcel} disabled={!costosPorCampana.filas.length}>Exportar Excel</button>}
                {marketingVista==='ventas' && <button className="btn-nuevo" onClick={()=>cargarMarketing(marketingFiltros)}>Actualizar</button>}
                {marketingVista==='reclutamiento' && <button className="btn-nuevo" onClick={()=>cargarMarketingRecl(marketingReclFiltros)}>Actualizar</button>}
                {marketingVista==='costos' && <button className="btn-nuevo" onClick={()=>{ cargarMarketing(marketingFiltros); cargarGastos(marketingFiltros) }}>Actualizar</button>}
              </div>
            </div>

            <div className="nav-tabs" style={{display:'flex',gap:8,marginBottom:14}}>
              <button type="button" className={`btn-nuevo${marketingVista==='ventas'?'':' btn-tab-inactivo'}`}
                style={marketingVista==='ventas'?{}:{background:'#e5e7eb',color:'#374151'}}
                onClick={()=>setMarketingVista('ventas')}>Ventas</button>
              <button type="button" className={`btn-nuevo${marketingVista==='reclutamiento'?'':' btn-tab-inactivo'}`}
                style={marketingVista==='reclutamiento'?{}:{background:'#e5e7eb',color:'#374151'}}
                onClick={()=>setMarketingVista('reclutamiento')}>Reclutamiento</button>
              <button type="button" className={`btn-nuevo${marketingVista==='costos'?'':' btn-tab-inactivo'}`}
                style={marketingVista==='costos'?{}:{background:'#e5e7eb',color:'#374151'}}
                onClick={()=>setMarketingVista('costos')}>Costos</button>
            </div>

            {(marketingVista==='ventas'||marketingVista==='costos') && <>
            {marketingVista==='ventas' && <>
            <div className="filtros-avanzados marketing-filtros">
              <div className="filtros-titulo">Filtros del reporte</div>
              <div className="filtros-grid">
                <label><span>Rango de fechas</span><RangoFechasPicker desde={marketingFiltros.desde} hasta={marketingFiltros.hasta} onChange={v=>setMarketingFiltros(p=>({...p,...v}))} /></label>
                <label><span>Campaña</span><select value={marketingFiltros.campana} onChange={e=>setMarketingFiltros(p=>({...p,campana:e.target.value}))}><option value="">Todas las campañas</option>{marketingCatalogos.campanas.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
                <label><span>Tipificación</span><select value={marketingFiltros.tipificacion} onChange={e=>setMarketingFiltros(p=>({...p,tipificacion:e.target.value}))}><option value="">Todas las tipificaciones</option>{TIPIF_VEND_VENTAS_ACTUALES.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
                <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>setMarketingFiltros({desde:'',hasta:'',campana:'',tipificacion:''})}>Limpiar</button>
              </div>
            </div>

            {marketingCarga.error && <div className="marketing-error">{marketingCarga.error}</div>}
            <div className="kpi-grid marketing-kpis">
              <div className="kpi-card k-blue"><div className="kpi-num">{resumenMarketing.total}</div><div className="kpi-label">Total de leads</div><div className="kpi-sub">según filtros</div></div>
              <div className="kpi-card k-purple"><div className="kpi-num">{resumenMarketing.campanas.length}</div><div className="kpi-label">Campañas</div><div className="kpi-sub">con registros</div></div>
              <div className="kpi-card k-green"><div className="kpi-num">{resumenMarketing.tipificados}</div><div className="kpi-label">Tipificados</div><div className="kpi-sub">con resultado</div></div>
              <div className="kpi-card k-yellow"><div className="kpi-num">{resumenMarketing.sinTipificar}</div><div className="kpi-label">Sin tipificar</div><div className="kpi-sub">pendientes</div></div>
              <div className="kpi-card k-orange"><div className="kpi-num">S/ {costosPorCampana.gastoTotalPeriodo.toFixed(2)}</div><div className="kpi-label">Gasto total</div><div className="kpi-sub">publicidad, según filtros</div></div>
              <div className="kpi-card k-red"><div className="kpi-num">{costosPorCampana.ventasTotalPeriodo>0?`S/ ${(costosPorCampana.gastoTotalPeriodo/costosPorCampana.ventasTotalPeriodo).toFixed(2)}`:'—'}</div><div className="kpi-label">Costo por venta</div><div className="kpi-sub">promedio del período</div></div>
            </div>

            <div className="marketing-grid">
              <div className="chart-card marketing-ranking">
                <div className="chart-title-row">
                  <span>Volumen de leads por campaña</span>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{display:'flex',gap:2}}>
                      <button type="button" onClick={()=>setOrdenCampanas('total')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='total'?'#0f172a':'#fff',color:ordenCampanas==='total'?'#fff':'#374151',cursor:'pointer'}}>Leads</button>
                      <button type="button" onClick={()=>setOrdenCampanas('ventas')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='ventas'?'#0f172a':'#fff',color:ordenCampanas==='ventas'?'#fff':'#374151',cursor:'pointer'}}>Ventas</button>
                      <button type="button" onClick={()=>setOrdenCampanas('instaladas')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='instaladas'?'#0f172a':'#fff',color:ordenCampanas==='instaladas'?'#fff':'#374151',cursor:'pointer'}}>Instaladas</button>
                    </div>
                    {marketingCarga.cargando&&<small>Actualizando…</small>}
                  </div>
                </div>
                <div className="marketing-barras">
                  {resumenMarketing.campanas.length===0 && !marketingCarga.cargando
                    ? <div className="marketing-vacio">No hay leads para los filtros seleccionados.</div>
                    : resumenMarketing.campanas.map((c,i)=><div className="marketing-barra" key={c.campana}>
                        <div className="marketing-barra-top"><strong>{c.campana}</strong><span>{c.total} leads</span></div>
                        <div className="marketing-barra-track"><i style={{width:`${Math.max(3,c.total/resumenMarketing.max*100)}%`,background:['#2563eb','#7c3aed','#0f766e','#ea580c','#db2777'][i%5]}} /></div>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                          <div style={{flex:1,height:3,borderRadius:99,background:'#eef2f7',overflow:'hidden'}}><i style={{display:'block',height:'100%',borderRadius:99,width:`${Math.max(3,c.ventas/resumenMarketing.maxVentas*100)}%`,background:'#86efac'}} /></div>
                          <span style={{fontSize:9,color:'#94a3b8',fontWeight:600,flexShrink:0}}>{c.ventas} venta{c.ventas===1?'':'s'}</span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                          <div style={{flex:1,height:3,borderRadius:99,background:'#eef2f7',overflow:'hidden'}}><i style={{display:'block',height:'100%',borderRadius:99,width:c.instaladas?`${Math.max(3,c.instaladas/resumenMarketing.maxInstaladas*100)}%`:'0%',background:'#38bdf8'}} /></div>
                          <span style={{fontSize:9,color:'#0284c7',fontWeight:700,flexShrink:0}}>{c.instaladas} instalada{c.instaladas===1?'':'s'}</span>
                        </div>
                      </div>)}
                </div>
              </div>

              <div className="tabla-wrap marketing-tabla-card">
                <div className="tabla-header"><span className="tabla-title">Detalle para Marketing</span><span className="tabla-count">{marketingData.length} grupos</span></div>
                <div style={{overflowX:'auto'}}><table className="tabla marketing-tabla">
                  <thead><tr><th>Campaña</th><th>Tipificación</th><th>Leads</th><th>Primera alta</th><th>Última alta</th></tr></thead>
                  <tbody>{marketingData.length===0
                    ? <tr><td colSpan="5" className="tabla-empty">{marketingCarga.cargando?'Cargando información…':'Sin resultados.'}</td></tr>
                    : marketingData.map((f,i)=><tr key={`${f.campana}-${f.tipificacion}-${i}`}><td><strong>{f.campana}</strong></td><td><span className="marketing-tipif">{f.tipificacion}</span></td><td><strong>{f.cantidad}</strong></td><td>{f.primera_alta?new Date(f.primera_alta).toLocaleString('es-PE',{timeZone:'America/Lima'}):'—'}</td><td>{f.ultima_alta?new Date(f.ultima_alta).toLocaleString('es-PE',{timeZone:'America/Lima'}):'—'}</td></tr>)}</tbody>
                </table></div>
              </div>
            </div>
            </>}

            {marketingVista==='costos' && <div className="tabla-wrap marketing-tabla-card">
                <div className="tabla-header"><span className="tabla-title">Costos por campaña</span><span className="tabla-count">{costosPorCampana.filas.length} campañas</span></div>
                {gastosCarga.error && <div className="marketing-error">{gastosCarga.error}</div>}
                <div style={{overflowX:'auto'}}><table className="tabla marketing-tabla">
                  <thead><tr><th>Campaña</th><th>Leads</th><th>Ventas</th><th>Gasto</th><th>Costo por lead</th><th>Costo por venta</th><th>Acciones</th></tr></thead>
                  <tbody>{costosPorCampana.filas.length===0
                    ? <tr><td colSpan="7" className="tabla-empty">Sin datos para los filtros seleccionados.</td></tr>
                    : costosPorCampana.filas.flatMap(f => {
                        const filas = [
                          <tr key={f.campana}>
                            <td><strong>{f.campana}</strong></td>
                            <td>{f.leads}</td>
                            <td>{f.ventas}</td>
                            <td>S/ {f.gasto.toFixed(2)}</td>
                            <td>{f.cpl!=null?`S/ ${f.cpl.toFixed(2)}`:'—'}</td>
                            <td>{f.cpv!=null?`S/ ${f.cpv.toFixed(2)}`:'—'}</td>
                            <td style={{display:'flex',gap:10}}>
                              <button type="button" title="Editar monto" onClick={()=>abrirPanelCampana(f.campana,'editar')} style={{border:'none',background:'none',cursor:'pointer',color:filaAbierta===f.campana?'#0f172a':'#64748b',padding:2}}><IconLapiz /></button>
                              <button type="button" title="Ver historial" onClick={()=>abrirPanelCampana(f.campana,'historial')} style={{border:'none',background:'none',cursor:'pointer',color:filaAbierta===f.campana?'#0f172a':'#64748b',padding:2}}><IconHoja /></button>
                            </td>
                          </tr>
                        ]
                        if (filaAbierta === f.campana) {
                          const entradas = gastosData.filter(g => g.campana === f.campana)
                          filas.push(
                            <tr key={`${f.campana}-panel`}>
                              <td colSpan="7" style={{background:'#f8fafc',padding:'12px 16px'}}>
                                <div className="filtros-grid" style={{marginBottom:entradas.length?12:0}}>
                                  <label><span>Fecha</span><input type="date" value={gastoForm.fecha} onChange={e=>setGastoForm(p=>({...p,fecha:e.target.value}))} /></label>
                                  <label><span>Monto (S/)</span><input type="number" min="0" step="0.01" value={gastoForm.monto} onChange={e=>setGastoForm(p=>({...p,monto:e.target.value}))} /></label>
                                  <label><span>Notas (opcional)</span><input type="text" value={gastoForm.notas} onChange={e=>setGastoForm(p=>({...p,notas:e.target.value}))} /></label>
                                  <button type="button" className="btn-nuevo" disabled={gastoGuardando} onClick={guardarGasto}>{gastoGuardando?'Guardando…':(gastoEditandoId?'Actualizar':'Guardar')}</button>
                                  {gastoEditandoId && <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>{ setGastoEditandoId(null); setGastoForm(p=>({...p,monto:'',notas:''})) }}>Cancelar edición</button>}
                                </div>
                                {entradas.length>0 && <div style={{overflowX:'auto'}}><table className="tabla marketing-tabla">
                                  <thead><tr><th>Fecha</th><th>Monto</th><th>Notas</th><th>Registrado por</th><th></th></tr></thead>
                                  <tbody>{entradas.map(g=><tr key={g.id}><td>{formatF(soloFecha(g.fecha))}</td><td>S/ {Number(g.monto||0).toFixed(2)}</td><td>{g.notas||'—'}</td><td>{g.registrado_por_nombre||'—'}</td><td style={{display:'flex',gap:6}}><button type="button" className="flujo-clear filtro-limpiar" onClick={()=>editarGasto(g)}>Editar</button><button type="button" className="flujo-clear filtro-limpiar" onClick={()=>eliminarGasto(g.id)}>Eliminar</button></td></tr>)}</tbody>
                                </table></div>}
                              </td>
                            </tr>
                          )
                        }
                        return filas
                      })}</tbody>
                </table></div>
              </div>}
            </>}

            {marketingVista==='reclutamiento' && <>
            <div className="filtros-avanzados marketing-filtros">
              <div className="filtros-titulo">Filtros del reporte</div>
              <div className="filtros-grid">
                <label><span>Rango de fechas</span><RangoFechasPicker desde={marketingReclFiltros.desde} hasta={marketingReclFiltros.hasta} onChange={v=>setMarketingReclFiltros(p=>({...p,...v}))} /></label>
                <label><span>Campaña</span><select value={marketingReclFiltros.campana} onChange={e=>setMarketingReclFiltros(p=>({...p,campana:e.target.value}))}><option value="">Todas las campañas</option>{marketingReclCatalogos.campanas.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
                <label><span>Tipificación</span><select value={marketingReclFiltros.tipificacion} onChange={e=>setMarketingReclFiltros(p=>({...p,tipificacion:e.target.value}))}><option value="">Todas las tipificaciones</option>{marketingReclCatalogos.tipificaciones.map(v=><option key={v} value={v}>{labelTipifVendRecl(v)}</option>)}</select></label>
                <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>setMarketingReclFiltros({desde:'',hasta:'',campana:'',tipificacion:''})}>Limpiar</button>
              </div>
            </div>

            {marketingReclCarga.error && <div className="marketing-error">{marketingReclCarga.error}</div>}
            <div className="kpi-grid marketing-kpis">
              <div className="kpi-card k-blue"><div className="kpi-num">{resumenMarketingRecl.total}</div><div className="kpi-label">Total de leads</div><div className="kpi-sub">según filtros</div></div>
              <div className="kpi-card k-purple"><div className="kpi-num">{resumenMarketingRecl.campanas.length}</div><div className="kpi-label">Campañas</div><div className="kpi-sub">con registros</div></div>
              <div className="kpi-card k-green"><div className="kpi-num">{resumenMarketingRecl.tipificados}</div><div className="kpi-label">Tipificados</div><div className="kpi-sub">con resultado</div></div>
              <div className="kpi-card k-yellow"><div className="kpi-num">{resumenMarketingRecl.sinTipificar}</div><div className="kpi-label">Sin tipificar</div><div className="kpi-sub">pendientes</div></div>
              <div className="kpi-card k-orange"><div className="kpi-num">S/ {costosPorCampanaRecl.gastoTotalPeriodo.toFixed(2)}</div><div className="kpi-label">Gasto total</div><div className="kpi-sub">publicidad, según filtros</div></div>
              <div className="kpi-card k-red"><div className="kpi-num">{costosPorCampanaRecl.aceptacionesTotalPeriodo>0?`S/ ${(costosPorCampanaRecl.gastoTotalPeriodo/costosPorCampanaRecl.aceptacionesTotalPeriodo).toFixed(2)}`:'—'}</div><div className="kpi-label">Costo por aceptación</div><div className="kpi-sub">promedio del período</div></div>
            </div>

            <div className="marketing-grid">
              <div className="chart-card marketing-ranking">
                <div className="chart-title-row">
                  <span>Volumen de leads por campaña</span>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{display:'flex',gap:2}}>
                      <button type="button" onClick={()=>setOrdenCampanas('total')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='total'?'#0f172a':'#fff',color:ordenCampanas==='total'?'#fff':'#374151',cursor:'pointer'}}>Leads</button>
                      <button type="button" onClick={()=>setOrdenCampanas('ventas')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='ventas'?'#0f172a':'#fff',color:ordenCampanas==='ventas'?'#fff':'#374151',cursor:'pointer'}}>Ventas</button>
                    </div>
                    {marketingReclCarga.cargando&&<small>Actualizando…</small>}
                  </div>
                </div>
                <div className="marketing-barras">
                  {resumenMarketingRecl.campanas.length===0 && !marketingReclCarga.cargando
                    ? <div className="marketing-vacio">No hay leads para los filtros seleccionados.</div>
                    : resumenMarketingRecl.campanas.map((c,i)=><div className="marketing-barra" key={c.campana}>
                        <div className="marketing-barra-top"><strong>{c.campana}</strong><span>{c.total} leads</span></div>
                        <div className="marketing-barra-track"><i style={{width:`${Math.max(3,c.total/resumenMarketingRecl.max*100)}%`,background:['#2563eb','#7c3aed','#0f766e','#ea580c','#db2777'][i%5]}} /></div>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                          <div style={{flex:1,height:3,borderRadius:99,background:'#eef2f7',overflow:'hidden'}}><i style={{display:'block',height:'100%',borderRadius:99,width:`${Math.max(3,c.ventas/resumenMarketingRecl.maxVentas*100)}%`,background:'#86efac'}} /></div>
                          <span style={{fontSize:9,color:'#94a3b8',fontWeight:600,flexShrink:0}}>{c.ventas} acepta{c.ventas===1?'':'n'} propuesta</span>
                        </div>
                      </div>)}
                </div>
              </div>

              <div className="tabla-wrap marketing-tabla-card">
                <div className="tabla-header"><span className="tabla-title">Costos por campaña</span><span className="tabla-count">{costosPorCampanaRecl.filas.length} campañas</span></div>
                {gastosReclCarga.error && <div className="marketing-error">{gastosReclCarga.error}</div>}
                <div style={{overflowX:'auto'}}><table className="tabla marketing-tabla">
                  <thead><tr><th>Campaña</th><th>Leads</th><th>Aceptaciones</th><th>Gasto</th><th>Costo por lead</th><th>Costo por aceptación</th><th>Acciones</th></tr></thead>
                  <tbody>{costosPorCampanaRecl.filas.length===0
                    ? <tr><td colSpan="7" className="tabla-empty">Sin datos para los filtros seleccionados.</td></tr>
                    : costosPorCampanaRecl.filas.flatMap(f => {
                        const filas = [
                          <tr key={f.campana}>
                            <td><strong>{f.campana}</strong></td>
                            <td>{f.leads}</td>
                            <td>{f.aceptaciones}</td>
                            <td>S/ {f.gasto.toFixed(2)}</td>
                            <td>{f.cpl!=null?`S/ ${f.cpl.toFixed(2)}`:'—'}</td>
                            <td>{f.cpa!=null?`S/ ${f.cpa.toFixed(2)}`:'—'}</td>
                            <td style={{display:'flex',gap:10}}>
                              <button type="button" title="Editar monto" onClick={()=>abrirPanelCampanaRecl(f.campana,'editar')} style={{border:'none',background:'none',cursor:'pointer',color:filaReclAbierta===f.campana?'#0f172a':'#64748b',padding:2}}><IconLapiz /></button>
                              <button type="button" title="Ver historial" onClick={()=>abrirPanelCampanaRecl(f.campana,'historial')} style={{border:'none',background:'none',cursor:'pointer',color:filaReclAbierta===f.campana?'#0f172a':'#64748b',padding:2}}><IconHoja /></button>
                            </td>
                          </tr>
                        ]
                        if (filaReclAbierta === f.campana) {
                          const entradas = gastosReclData.filter(g => g.campana === f.campana)
                          filas.push(
                            <tr key={`${f.campana}-panel`}>
                              <td colSpan="7" style={{background:'#f8fafc',padding:'12px 16px'}}>
                                <div className="filtros-grid" style={{marginBottom:entradas.length?12:0}}>
                                  <label><span>Fecha</span><input type="date" value={gastoReclForm.fecha} onChange={e=>setGastoReclForm(p=>({...p,fecha:e.target.value}))} /></label>
                                  <label><span>Monto (S/)</span><input type="number" min="0" step="0.01" value={gastoReclForm.monto} onChange={e=>setGastoReclForm(p=>({...p,monto:e.target.value}))} /></label>
                                  <label><span>Notas (opcional)</span><input type="text" value={gastoReclForm.notas} onChange={e=>setGastoReclForm(p=>({...p,notas:e.target.value}))} /></label>
                                  <button type="button" className="btn-nuevo" disabled={gastoReclGuardando} onClick={guardarGastoRecl}>{gastoReclGuardando?'Guardando…':(gastoReclEditandoId?'Actualizar':'Guardar')}</button>
                                  {gastoReclEditandoId && <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>{ setGastoReclEditandoId(null); setGastoReclForm(p=>({...p,monto:'',notas:''})) }}>Cancelar edición</button>}
                                </div>
                                {entradas.length>0 && <div style={{overflowX:'auto'}}><table className="tabla marketing-tabla">
                                  <thead><tr><th>Fecha</th><th>Monto</th><th>Notas</th><th>Registrado por</th><th></th></tr></thead>
                                  <tbody>{entradas.map(g=><tr key={g.id}><td>{formatF(soloFecha(g.fecha))}</td><td>S/ {Number(g.monto||0).toFixed(2)}</td><td>{g.notas||'—'}</td><td>{g.registrado_por_nombre||'—'}</td><td style={{display:'flex',gap:6}}><button type="button" className="flujo-clear filtro-limpiar" onClick={()=>editarGastoRecl(g)}>Editar</button><button type="button" className="flujo-clear filtro-limpiar" onClick={()=>eliminarGastoRecl(g.id)}>Eliminar</button></td></tr>)}</tbody>
                                </table></div>}
                              </td>
                            </tr>
                          )
                        }
                        return filas
                      })}</tbody>
                </table></div>
              </div>
            </div>
            </>}
          </section>

          {/* ===== GRABACIONES: RENDIMIENTO ===== */}
          <section className={`section${seccion==='grab-rendimiento'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Rendimiento de Grabaciones</h2><p>Ranking de ventas grabadas por cada asesor de Grabaciones: hoy, esta semana y este mes</p></div>
              <button className="btn-nuevo" onClick={cargarGrabRendimiento}>Actualizar</button>
            </div>

            {grabCarga.error && <div className="marketing-error">{grabCarga.error}</div>}

            <div className="kpi-grid marketing-kpis">
              <div className="kpi-card k-blue"><div className="kpi-num">{grabResumen.hoy}</div><div className="kpi-label">Grabadas hoy</div><div className="kpi-sub">todo el equipo</div></div>
              <div className="kpi-card k-purple"><div className="kpi-num">{grabResumen.semana}</div><div className="kpi-label">Esta semana</div><div className="kpi-sub">todo el equipo</div></div>
              <div className="kpi-card k-green"><div className="kpi-num">{grabResumen.mes}</div><div className="kpi-label">Este mes</div><div className="kpi-sub">todo el equipo</div></div>
              <div className="kpi-card k-yellow"><div className="kpi-num">{grabRanking.length}</div><div className="kpi-label">Personas activas</div><div className="kpi-sub">con grabaciones este mes</div></div>
            </div>

            <div className="marketing-grid">
              <div className="chart-card marketing-ranking">
                <div className="chart-title-row"><span>Grabadas hoy por asesor</span>{grabCarga.cargando&&<small>Actualizando…</small>}</div>
                <div className="marketing-barras">
                  {grabRanking.length===0 && !grabCarga.cargando
                    ? <div className="marketing-vacio">Todavía no hay grabaciones registradas.</div>
                    : grabRanking.map((f,i)=><div className="marketing-barra" key={f.id}>
                        <div className="marketing-barra-top"><strong>{f.nombre}</strong><span>{f.hoy} hoy</span></div>
                        <div className="marketing-barra-track"><i style={{width:`${Math.max(3,f.hoy/Math.max(1,...grabRanking.map(x=>x.hoy))*100)}%`,background:['#2563eb','#7c3aed','#0f766e','#ea580c','#db2777'][i%5]}} /></div>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                          <div style={{flex:1,height:3,borderRadius:99,background:'#eef2f7',overflow:'hidden'}}><i style={{display:'block',height:'100%',borderRadius:99,width:`${Math.max(3,f.mes/Math.max(1,...grabRanking.map(x=>x.mes))*100)}%`,background:'#86efac'}} /></div>
                          <span style={{fontSize:9,color:'#94a3b8',fontWeight:600,flexShrink:0}}>{f.mes} en el mes</span>
                        </div>
                      </div>)}
                </div>
              </div>

              <div className="tabla-wrap marketing-tabla-card">
                <div className="tabla-header"><span className="tabla-title">Detalle por asesor</span><span className="tabla-count">{grabRanking.length} personas</span></div>
                <div style={{overflowX:'auto'}}><table className="tabla marketing-tabla">
                  <thead><tr><th>#</th><th>Asesor</th><th>Hoy</th><th>Semana</th><th>Mes</th></tr></thead>
                  <tbody>{grabRanking.length===0
                    ? <tr><td colSpan="5" className="tabla-empty">{grabCarga.cargando?'Cargando información…':'Sin resultados.'}</td></tr>
                    : grabRanking.map((f,i)=><tr key={f.id}><td>{i+1}</td><td><strong>{f.nombre}</strong></td><td>{f.hoy}</td><td>{f.semana}</td><td>{f.mes}</td></tr>)}</tbody>
                </table></div>
              </div>
            </div>
          </section>

          {/* ===== ENVIO MASIVO ===== */}
          <section className={`section${seccion==='envio-masivo'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Envío masivo</h2><p>Arma un lote de números para pegar en una plataforma externa de envío masivo. Excluye leads SIN COBERTURA y VENTA CERRADA.</p></div>
              <button className="btn-nuevo" onClick={()=>cargarMasivo()} disabled={masivoCargando}>{masivoCargando ? 'Cargando…' : '↻ Actualizar'}</button>
            </div>

            <div className="filtros-avanzados">
              <div className="filtros-titulo">Filtros</div>
              <div className="filtros-grid">
                <label><span>Fecha</span>
                  <div style={{display:'flex',gap:4,marginBottom:5}}>
                    <button type="button" onClick={()=>setMasivoModoFecha('rango')} style={{flex:1,height:26,border:'1px solid #e5e7eb',borderRadius:6,background:masivoModoFecha==='rango'?'#1f2937':'#fff',color:masivoModoFecha==='rango'?'#fff':'#475569',fontSize:10,fontWeight:700,cursor:'pointer'}}>Rango</button>
                    <button type="button" onClick={()=>{ setMasivoModoFecha('exacta'); setMasivoFiltros(p=>({...p,hasta:p.desde})) }} style={{flex:1,height:26,border:'1px solid #e5e7eb',borderRadius:6,background:masivoModoFecha==='exacta'?'#1f2937':'#fff',color:masivoModoFecha==='exacta'?'#fff':'#475569',fontSize:10,fontWeight:700,cursor:'pointer'}}>Fecha exacta</button>
                  </div>
                  <input type="date" value={masivoFiltros.desde} onChange={e=>setMasivoFiltros(p=>({...p, desde:e.target.value, hasta: masivoModoFecha==='exacta' ? e.target.value : p.hasta}))} />
                </label>
                {masivoModoFecha === 'rango' && (
                  <label><span>Fecha hasta</span><input type="date" value={masivoFiltros.hasta} onChange={e=>setMasivoFiltros(p=>({...p,hasta:e.target.value}))} /></label>
                )}
                <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>{ const vacio={campana:'',distrito:'',desde:'',hasta:''}; setMasivoFiltros(vacio); setFiltroMasivoCampanas(null); setFiltroMasivoTipificaciones(null); setMasivoModoFecha('rango'); cargarMasivo(vacio) }}>Limpiar</button>
                <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>cargarMasivo(masivoFiltros)}>Buscar</button>
              </div>
            </div>

            <div className="filtros-avanzados">
              <div className="filtros-titulo">Filtrar lo ya cargado (como Excel)</div>
              <div className="filtros-grid">
                <MasivoFiltroColumna titulo="CAMPAÑA" opciones={masivoCatalogos.campanas} seleccionados={filtroMasivoCampanas} onChange={setFiltroMasivoCampanas} buscable />
                <MasivoFiltroColumna titulo="TIPIFICACIÓN DEL VENDEDOR" opciones={masivoCatalogos.tipificaciones} seleccionados={filtroMasivoTipificaciones} onChange={setFiltroMasivoTipificaciones} buscable />
              </div>
            </div>

            {masivoMensaje && <div className="marketing-error">{masivoMensaje}</div>}

            <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',margin:'0 0 14px'}}>
              <label style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#475569'}}>
                Seleccionar los primeros
                <input type="number" min="1" value={masivoCantidadInput} onChange={e=>setMasivoCantidadInput(e.target.value)} placeholder="Ej. 200" style={{width:90,padding:'6px 8px',border:'1px solid #e5e7eb',borderRadius:7,fontFamily:'inherit',fontSize:12}} />
              </label>
              <button type="button" className="flujo-clear filtro-limpiar" onClick={masivoSeleccionarPrimerosN}>Seleccionar</button>
              <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>setMasivoSeleccion(new Set())}>Limpiar selección</button>
              <span style={{fontSize:12,fontWeight:700,color:'#334155'}}>{masivoSeleccion.size} seleccionados</span>
              <button className="btn-nuevo" style={{marginLeft:'auto'}} disabled={!masivoSeleccion.size || masivoCopiando} onClick={masivoCopiarNumeros}>
                {masivoCopiando ? 'Copiando…' : `Copiar números (${masivoSeleccion.size})`}
              </button>
            </div>

            <div className="tabla-wrap">
              <div className="tabla-header"><span className="tabla-title">Leads elegibles</span><span className="tabla-count">{masivoLeadsFiltrados.length} registros</span></div>
              <div style={{overflowX:'auto'}}><table className="tabla">
                <thead><tr>
                  <th><input type="checkbox" aria-label="Seleccionar leads de esta página" checked={masivoLeadsPagina.length>0 && masivoLeadsPagina.every(l=>masivoSeleccion.has(l.id))} onChange={e=>setMasivoSeleccion(actual=>{ const nuevo=new Set(actual); masivoLeadsPagina.forEach(l=>e.target.checked?nuevo.add(l.id):nuevo.delete(l.id)); return nuevo })} /></th>
                  <th>N1</th><th>N2</th><th>Campaña</th><th>Distrito</th><th>Asesor</th><th>Fecha</th><th>Estado</th>
                </tr></thead>
                <tbody>
                  {!masivoCargando && masivoLeadsPagina.map(l => (
                    <tr key={l.id}>
                      <td><input type="checkbox" checked={masivoSeleccion.has(l.id)} onChange={()=>masivoAlternarUno(l.id)} /></td>
                      <td>{l.n1 || (l.usuario_whatsapp ? <span title="Sin número — usuario de WhatsApp">@{l.usuario_whatsapp}</span> : '—')}</td>
                      <td>{l.n2 || '—'}</td>
                      <td>{l.campana || '—'}</td>
                      <td>{l.distrito || '—'}</td>
                      <td>{l.asesor_nombre || '—'}</td>
                      <td>{l.fecha ? new Date(l.fecha).toLocaleDateString('es-PE',{timeZone:'America/Lima'}) : '—'}</td>
                      <td>{l.masivo_lote_id
                        ? <span style={{display:'inline-block',padding:'3px 8px',borderRadius:6,background:'#fef3c7',color:'#92400e',fontSize:10,fontWeight:700}}>Lote #{l.masivo_lote_id}{l.masivo_fecha ? ` · ${new Date(l.masivo_fecha).toLocaleDateString('es-PE',{timeZone:'America/Lima'})}` : ''}</span>
                        : <span style={{color:'#94a3b8',fontSize:10}}>Sin enviar</span>}
                      </td>
                    </tr>
                  ))}
                  {!masivoCargando && !masivoLeadsFiltrados.length && <tr><td colSpan="8" className="tabla-empty">Sin registros para los filtros seleccionados.</td></tr>}
                  {masivoCargando && <tr><td colSpan="8" className="tabla-empty">Cargando leads…</td></tr>}
                </tbody>
              </table></div>
              {!masivoCargando && masivoLeadsFiltrados.length > 0 && (
                <div className="masivo-paginacion">
                  <span>Mostrando {(masivoPaginaSegura - 1) * masivoPorPagina + 1}–{Math.min(masivoPaginaSegura * masivoPorPagina, masivoLeadsFiltrados.length)} de {masivoLeadsFiltrados.length}</span>
                  <div className="masivo-paginacion-controles">
                    <select aria-label="Leads por página" value={masivoPorPagina} onChange={e=>setMasivoPorPagina(Number(e.target.value))}>
                      <option value={25}>25 / pág.</option><option value={50}>50 / pág.</option><option value={100}>100 / pág.</option>
                    </select>
                    <button type="button" disabled={masivoPaginaSegura===1} onClick={()=>setMasivoPagina(p=>Math.max(1,p-1))}>‹</button>
                    <strong>Página {masivoPaginaSegura} de {masivoTotalPaginas}</strong>
                    <button type="button" disabled={masivoPaginaSegura===masivoTotalPaginas} onClick={()=>setMasivoPagina(p=>Math.min(masivoTotalPaginas,p+1))}>›</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ===== COBRANZA · CÓDIGOS ===== */}
          <section className={`section${seccion==='cobranza-codigos'?' active':''}`}>
            <div className="sec-header">
              <div>
                <h2>Cobranza · Códigos de pago</h2>
                <p>Pega el reporte de facturación (Nombres y apellidos, Número de doc, SOT, Fecha oficial, Código de pago). Se cruza por SOT contra las ventas y solo actualiza el código de pago en Cobranza — el ciclo de facturación y los recibos siguen siendo 100% manuales.</p>
              </div>
            </div>

            <div className="filtros-avanzados">
              <div className="filtros-titulo">Pegar datos (copiados desde Excel/Sheets)</div>
              <textarea
                value={cobCodigosTexto}
                onChange={e=>setCobCodigosTexto(e.target.value)}
                placeholder={'Pega aquí las filas copiadas de la hoja de cálculo (Número de doc, SOT, Fecha oficial, Código de pago)'}
                rows={8}
                style={{width:'100%',boxSizing:'border-box',padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontFamily:'monospace',fontSize:11.5,resize:'vertical'}}
              />
              <div style={{display:'flex',gap:10,marginTop:10}}>
                <button className="btn-nuevo" onClick={procesarCobCodigos} disabled={cobCodigosProcesando}>
                  {cobCodigosProcesando ? 'Procesando…' : 'Procesar lote'}
                </button>
                <button type="button" className="flujo-clear filtro-limpiar" onClick={limpiarCobCodigos}>Limpiar</button>
              </div>
            </div>

            {cobCodigosMensaje && <div className="marketing-error">{cobCodigosMensaje}</div>}

            {cobCodigosResultado && (
              <>
                <div className="flujo-kpi-grid">
                  <div className="kpi-card flujo-kpi k-blue"><div className="kpi-num">{cobCodigosResultado.resumen.total}</div><div className="kpi-label">Filas procesadas</div></div>
                  <div className="kpi-card flujo-kpi k-green"><div className="kpi-num">{cobCodigosResultado.resumen.actualizados}</div><div className="kpi-label">Actualizados</div></div>
                  <div className="kpi-card flujo-kpi k-yellow"><div className="kpi-num">{cobCodigosResultado.resumen.sin_cambios}</div><div className="kpi-label">Sin cambios</div></div>
                  <div className="kpi-card flujo-kpi k-red"><div className="kpi-num">{cobCodigosResultado.resumen.no_encontrados}</div><div className="kpi-label">SOT no encontrado</div></div>
                </div>

                <div className="tabla-wrap">
                  <div className="tabla-header"><span className="tabla-title">Resultado del cruce</span><span className="tabla-count">{cobCodigosResultado.resultados.length} filas</span></div>
                  <div style={{overflowX:'auto'}}><table className="tabla">
                    <thead><tr>
                      <th>Nombre (sistema)</th><th>Documento</th><th>SOT</th><th>Código de pago</th>
                      <th>Vendedor</th><th>Sala</th><th>Tel. 1</th><th>Tel. 2</th><th>Estado</th>
                    </tr></thead>
                    <tbody>
                      {cobCodigosResultado.resultados.map((r, i) => (
                        <tr key={i}>
                          <td>{r.nombre_sistema || '—'}</td>
                          <td>{r.documento || '—'}</td>
                          <td>{r.sot || '—'}</td>
                          <td>{r.codigo_pago || '—'}</td>
                          <td>{r.vendedor || '—'}</td>
                          <td>{r.sala || '—'}</td>
                          <td>{r.telefono1 || '—'}</td>
                          <td>{r.telefono2 || '—'}</td>
                          <td>
                            {r.estado === 'actualizado' && <span style={{color:'#047857',fontWeight:700}}>Actualizado</span>}
                            {r.estado === 'sin_cambios' && <span style={{color:'#94a3b8',fontWeight:700}}>Sin cambios</span>}
                            {r.estado === 'no_encontrado' && <span style={{color:'#dc2626',fontWeight:700}}>SOT no encontrado</span>}
                            {r.estado === 'sin_sot' && <span style={{color:'#dc2626',fontWeight:700}}>Fila sin SOT</span>}
                            {r.estado === 'sin_codigo' && <span style={{color:'#dc2626',fontWeight:700}}>Sin código de pago</span>}
                            {r.estado === 'codigo_muy_largo' && <span style={{color:'#dc2626',fontWeight:700}}>Código muy largo</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              </>
            )}
          </section>

          {/* ===== VENTAS GENERALES ===== */}
          <section className={`section${seccion==='ventas-flujo'?' active':''}`}>
            <div className="sec-header">
              <div>
                <h2>Ventas generales</h2>
                <p>Ventas ingresadas en el mes seleccionado</p>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}>
                <select value={mesReporte} onChange={e=>setMesReporte(e.target.value)} aria-label="Mes de ventas generales"
                  style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:'9px',fontSize:'12px',fontFamily:'inherit',outline:'none',color:'#374151',cursor:'pointer',background:'#fff'}}>
                  {MESES_SALAS.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <button className="btn-nuevo" onClick={cargarVentasCache}>Actualizar</button>
              </div>
            </div>

            <div className="flujo-kpi-grid">
              {[
                { id:'todas', label:'Ventas generales', value:resumenFlujoVentas.todas, cls:'k-magenta' },
                { id:'validadas', label:'Validadas', value:resumenFlujoVentas.validadas, cls:'k-yellow' },
                { id:'noValidadas', label:'No validadas', value:resumenFlujoVentas.noValidadas, cls:'k-red' },
                { id:'grabadas', label:'Grabadas', value:resumenFlujoVentas.grabadas, cls:'k-green' },
                { id:'noGrabadas', label:'No grabadas', value:resumenFlujoVentas.noGrabadas, cls:'k-blue' },
                { id:'seguimiento', label:'En seguimiento', value:resumenFlujoVentas.seguimiento, cls:'k-purple' },
              ].map(card => (
                <button
                  type="button"
                  key={card.id}
                  className={`kpi-card flujo-kpi ${card.cls} ${filtroFlujoVentas===card.id?'active':''}`}
                  onClick={()=>setFiltroFlujoVentas(card.id)}
                >
                  <div className="kpi-num">{card.value}</div>
                  <div className="kpi-label">{card.label}</div>
                </button>
              ))}
              <button type="button" className="kpi-card flujo-kpi k-green export-kpi-card" onClick={exportarVentasExcel}>
                <span className="export-kpi-icon" aria-hidden="true">⇩</span>
                <span className="kpi-label">Exportar Excel</span>
              </button>
            </div>

            <div className="flujo-panel">
              <div>
                <h3>Vista completa del flujo</h3>
              </div>
              <input
                className="tabla-search flujo-search"
                value={busqFlujoVentas}
                onChange={e=>setBusqFlujoVentas(e.target.value)}
                placeholder="Buscar cliente, DNI, teléfono, asesor, sala..."
              />
            </div>
            <div className="filtros-avanzados">
              <div className="filtros-titulo">Filtros avanzados</div>
              <div className="filtros-grid filtros-grid-ventas">
                <label><span>Estado actual</span><FiltroEstadoMultiple opciones={opcionesFlujo.estados} seleccionados={fvEstados} onChange={setFvEstados} /></label>
                <label><span>Validación</span><select value={fvValidacion} onChange={e=>setFvValidacion(e.target.value)}><option value="">TODAS</option><option value="validado">VALIDADO</option><option value="no_validado">NO VALIDADO</option><option value="ventas">VENTAS</option></select></label>
                <label><span>Grabación</span><select value={fvGrabacion} onChange={e=>setFvGrabacion(e.target.value)}><option value="">TODAS</option><option value="GRABADO">GRABADO</option><option value="GRABANDO">GRABANDO</option><option value="NO GRABADO">NO GRABADO</option></select></label>
                <label><span>Canal</span><select value={fvCanal} onChange={e=>setFvCanal(e.target.value)}><option value="">TODOS</option><option value="NETCONTACT">NETCONTACT</option><option value="KELS">KELS</option></select></label>
                <label><span>Campaña</span><FiltroEstadoMultiple opciones={campanasFlujoOpciones} seleccionados={fvCampana} onChange={setFvCampana} /></label>
                <label><span>Asesor</span><input value={fvAsesor} onChange={e=>setFvAsesor(e.target.value)} placeholder="Escribir asesor..."/></label>
                <label><span>Sala</span><input value={fvSala} onChange={e=>setFvSala(e.target.value)} placeholder="Escribir sala..."/></label>
                <label><span>Distrito</span><input value={fvDistrito} onChange={e=>setFvDistrito(e.target.value)} placeholder="Escribir distrito..."/></label>
                <label className="fv-operativo"><span>Filtrar por</span>
                  <select value={fvTipoFecha} onChange={e=>setFvTipoFecha(e.target.value)}>
                    <option value="venta">Venta</option>
                    <option value="programacion">Programados</option>
                  </select>
                </label>
                <label className="fv-rango"><span>{fvTipoFecha==='programacion' ? 'Día(s) de programación' : 'Día(s) de venta'}</span>
                  <RangoFechasPicker
                    desde={fvTipoFecha==='programacion' ? fvProgDesde : fvDesde}
                    hasta={fvTipoFecha==='programacion' ? fvProgHasta : fvHasta}
                    onChange={({desde,hasta})=>{
                      if (fvTipoFecha==='programacion') { setFvProgDesde(desde); setFvProgHasta(hasta) }
                      else { setFvDesde(desde); setFvHasta(hasta) }
                    }}
                  />
                </label>
                <button type="button" className="flujo-clear filtro-limpiar" onClick={limpiarFiltrosFlujo}>Limpiar</button>
              </div>
            </div>

            <div className="tabla-wrap usuarios-pro-card flujo-tabla">
              <div className="tabla-header">
                <div className="tabla-header-left">
                  <span className="tabla-title">Ventas desde carga del asesor</span>
                  <span className="tabla-count">{ventasFlujoFiltradas.length} registros</span>
                </div>
                <button
                  type="button"
                  className="flujo-clear"
                  onClick={limpiarFiltrosFlujo}
                >
                  Limpiar filtros
                </button>
              </div>
              <div className="flujo-tabla-scroll">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Fecha subida</th>
                      <th>Cliente</th>
                      <th>DNI</th>
                      <th>Asesor</th>
                      <th>Sala</th>
                      <th>Canal</th>
                      <th>Validación</th>
                      <th>Grabación</th>
                      <th>Programación</th>
                      <th>Seguimiento</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ventasFlujoFiltradas.length === 0 ? (
                      <tr><td colSpan="12" className="tabla-empty">No hay ventas registradas.</td></tr>
                    ) : ventasFlujoPagina.map((v, i) => {
                      const estadoSeg = estadoSeguimiento(v)
                      const pInfo = estadoProgramacionFlujo(v)
                      const pSt   = PROG_STYLES[pInfo.key] || PROG_STYLES.PENDIENTE
                      const fpParts = (v.fecha_prog || '').split(' ')
                      const fpStr = fpParts[0] ? formatF(fpParts[0]) + (fpParts[1] ? ' ' + fpParts[1].slice(0,5) : '') : ''
                      const pTip = [v.obs_programacion && `Obs: ${v.obs_programacion}`, fpStr && `Fecha: ${fpStr}`].filter(Boolean).join('\n') || undefined
                      return (
                        <tr key={v.id || `${v.dni || v.documento || 'venta'}-${i}`}>
                          <td>{(paginaFlujo - 1) * porPaginaFlujo + i + 1}</td>
                          <td>{formatF(v._fecha || v.fecha_ingreso || v.fecha || v.created_at)}</td>
                          <td className="flujo-cliente">{v.nombre || v.nombre_apellidos || v.cliente || '—'}</td>
                          <td>{v.dni || v.documento || '—'}</td>
                          <td>{String(v.asesor_nombre || v.asesor || v.vendedor || '—').toLocaleUpperCase('es-PE')}</td>
                          <td>{v.sala || '—'}</td>
                          <td><CanalBadge canal={v.canal} /></td>
                          <td><span className={flujoValidada(v) ? 'flujo-ok' : 'flujo-warn'}>{estadoValidacion(v)}</span></td>
                          <td><span className={flujoGrabada(v) ? 'flujo-ok' : 'flujo-warn'}>{estadoGrabacion(v)}</span></td>
                          <td>
                            <div title={pTip}>
                              <span style={{display:'inline-block',padding:'2px 8px',borderRadius:'99px',fontSize:'10px',fontWeight:700,letterSpacing:'.3px',background:pSt.bg,color:pSt.color,border:`1px solid ${pSt.border}`,whiteSpace:'nowrap'}}>{pInfo.label}</span>
                              {v.usuario_prog && <div style={{fontSize:'10px',color:'#6b7280',marginTop:'2px',whiteSpace:'nowrap'}}>Por: {v.usuario_prog.split(' ').slice(0,2).join(' ').toLocaleUpperCase('es-PE')}</div>}
                            </div>
                          </td>
                          <td>{estadoSeg ? <span className="flujo-info">{flujoLabelEstado(estadoSeg)}</span> : '—'}</td>
                          <td>
                            <div className="venta-actions">
                              <button type="button" className="venta-action-btn" onClick={()=>setMediaVenta(v)}>Archivos</button>
                              <button type="button" className="venta-action-btn" onClick={()=>setVentaEditar(v)}>Editar</button>
                              <button type="button" className="venta-action-btn" onClick={()=>setVentaProgramar(v)}>Programación</button>
                              <button type="button" className="venta-action-btn reassign" onClick={()=>setVentaReasignar(v)}>Reasignar</button>
                              <button type="button" className="venta-action-btn" onClick={()=>setVentaHistorial(v)}>Historial</button>
                              <button type="button" className="venta-action-btn delete" onClick={()=>eliminarVenta(v)}>Eliminar</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flujo-paginacion">
                <span>Mostrando {ventasFlujoFiltradas.length ? (paginaFlujo - 1) * porPaginaFlujo + 1 : 0}–{Math.min(paginaFlujo * porPaginaFlujo, ventasFlujoFiltradas.length)} de {ventasFlujoFiltradas.length}</span>
                <div>
                  <select value={porPaginaFlujo} onChange={e=>setPorPaginaFlujo(Number(e.target.value))} aria-label="Registros por página">
                    {[18,25,50,100].map(n=><option key={n} value={n}>{n} / pág.</option>)}
                  </select>
                  <button type="button" onClick={()=>setPaginaFlujo(p=>Math.max(1,p-1))} disabled={paginaFlujo<=1}>‹</button>
                  <strong>Página {paginaFlujo} de {totalPaginasFlujo}</strong>
                  <button type="button" onClick={()=>setPaginaFlujo(p=>Math.min(totalPaginasFlujo,p+1))} disabled={paginaFlujo>=totalPaginasFlujo}>›</button>
                </div>
              </div>
            </div>
          </section>

          {/* ===== USUARIOS ===== */}
          <section className={`section${seccion==='usuarios'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Gestión de Usuarios</h2><p>Crea, edita y gestiona todos los usuarios</p></div>
              <button className="btn-nuevo" onClick={abrirModalNuevo}>+ Nuevo usuario</button>
            </div>
            <div className="tabla-wrap">
              <div className="tabla-header">
                <div className="tabla-header-left">
                  <span className="tabla-title">Usuarios del sistema</span>
                  <span className="tabla-count">
                    {usuariosCarga.cargando ? 'Cargando...' : usuariosCarga.error ? 'Sin conexión' : `${usuariosFiltrados.length} usuarios`}
                  </span>
                </div>
                <input type="text" className="tabla-search" value={busqUsuarios}
                  onChange={e=>setBusqUsuarios(e.target.value)} placeholder="Buscar usuario..." />
                <select className="select-filtro" value={filtroUsuarioCargo} onChange={e=>setFiltroUsuarioCargo(e.target.value)}>
                  <option value="">Todos los cargos</option>
                  {CARGOS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <select className="select-filtro" value={filtroUsuarioSala} onChange={e=>setFiltroUsuarioSala(e.target.value)}>
                  <option value="">Todas las salas</option>
                  {salasUsuariosDisponibles.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {(filtroUsuarioCargo || filtroUsuarioSala) && <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>{setFiltroUsuarioCargo(''); setFiltroUsuarioSala('')}}>Limpiar</button>}
              </div>
              <table className="tabla tabla-usuarios-pro">
                <colgroup>
                  <col style={{width:'290px'}} />
                  <col style={{width:'290px'}} />
                  <col style={{width:'115px'}} />
                  <col style={{width:'135px'}} />
                  <col style={{width:'120px'}} />
                  <col style={{width:'110px'}} />
                  <col style={{width:'350px'}} />
                </colgroup>
                <thead><tr><th>Usuario</th><th>Cargo</th><th>Sala</th><th>Login</th><th>Creado</th><th>Estado</th><th>Acciones</th></tr></thead>
                <tbody>
                  {usuariosCarga.cargando
                    ? <tr><td colSpan="7" className="tabla-empty">Cargando usuarios del sistema...</td></tr>
                    : usuariosCarga.error
                    ? <tr><td colSpan="7" className="tabla-empty">
                        <div style={{display:'grid',justifyItems:'center',gap:9}}>
                          <strong style={{color:'#dc2626'}}>No se pudo consultar la lista</strong>
                          <span>{usuariosCarga.error}</span>
                          <button type="button" className="btn-nuevo" onClick={cargarUsuarios}>Reintentar</button>
                        </div>
                      </td></tr>
                    : usuariosFiltrados.length === 0
                    ? <tr><td colSpan="7" className="tabla-empty">No hay usuarios que coincidan con la búsqueda.</td></tr>
                    : usuariosFiltrados.map(u => {
                        const c    = cargoObj(u.cargo)
                        const permisosExtra = permisosDeUsuario(u).filter(rol => rol !== u.cargo)
                        const col  = colorAvatar(u.nombre)
                        const fecha= u.created_at ? u.created_at.split(' ')[0] : ''
                        const protegido = String(u.id) === String(sesion?.id)
                        return (
                          <tr key={u.id}>
                            <td>
                              <div style={{display:'flex',alignItems:'center',gap:'9px'}}>
                                <div style={{width:'32px',height:'32px',borderRadius:'50%',background:col,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,color:'#fff',flexShrink:0}}>{iniciales(u.nombre)}</div>
                                <div><div style={{fontWeight:700,fontSize:'13px'}}>{u.nombre}</div><div style={{fontSize:'11px',color:'#9ca3af'}}>{u.usuario}</div></div>
                              </div>
                            </td>
                            <td>
                              <div className="usuario-cargos">
                                <span className={`badge-cargo ${c.cls}`}>{c.label}</span>
                                {permisosExtra.map(rol => <span key={rol} className={`badge-cargo ${cargoObj(rol).cls}`}>{cargoObj(rol).label}</span>)}
                              </div>
                            </td>
                            <td style={{fontSize:'12px'}}>{u.sala||'—'}</td>
                            <td style={{fontFamily:'monospace',fontSize:'12px',color:'#6b7280'}}>{u.usuario}</td>
                            <td style={{fontSize:'11px',color:'#9ca3af'}}>{formatF(fecha)}</td>
                            <td><span className={`badge-estado-user ${u.activo?'bu-activo':'bu-inactivo'}`}>{u.activo?'Activo':'Inactivo'}</span></td>
                            <td>
                              <div className="acc-cell">
                                <button className="btn-edit" onClick={()=>abrirModalEditar(u)}>Editar</button>
                                <button className={`btn-toggle-activo ${u.activo?'btn-desactivar':'btn-activar'}`} onClick={()=>toggleActivo(u)}>
                                  {u.activo?'Desactivar':'Activar'}
                                </button>
                                <button className="btn-edit" onClick={()=>desbloquearUsuario(u)} title="Reiniciar intentos fallidos de inicio de sesión">
                                  Desbloquear
                                </button>
                                <button className="btn-eliminar-usuario" onClick={()=>setModalEliminar(u)} disabled={protegido}
                                  title={protegido?'Esta cuenta está protegida':'Eliminar usuario'}>
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                  }
                </tbody>
              </table>
            </div>
          </section>

          {/* ===== REPORTES ===== */}
          <section className={`section${seccion==='reportes'?' active':''}`}>
            <div className="sec-header reportes-header">
              <div><h2>Reportes Globales</h2><p>Rendimiento por sala y asesor — solo asesores</p></div>
              <div className="reporte-periodo">
                <label htmlFor="mes-reporte">Periodo</label>
                <div className="reporte-periodo-controls">
                  <input
                    id="mes-reporte"
                    type="month"
                    value={mesReporte}
                    onChange={e=>setMesReporte(e.target.value)}
                    aria-label="Filtrar reportes por mes"
                  />
                  {mesReporte && <button type="button" onClick={()=>setMesReporte('')}>Ver todos</button>}
                </div>
              </div>
            </div>
            <div className="sala-tabs sala-tabs-pro">
              {[
                { id:'todas', label:'Todas las salas' },
                { id:'SALA 1', label:'Sala 1' },
                { id:'SALA 2', label:'Sala 2' },
                { id:'SALA 3', label:'Sala 3' },
                { id:'SALA 4', label:'Sala 4' },
                { id:'SALA CHANCAY', label:'Sala Chancay' },
                { id:'SALA 5', label:'Sala 5' },
                { id:'SALA 6', label:'Sala 6' },
              ].map(tab => (
                <button key={tab.id}
                  className={`sala-tab${salaReporte===tab.id?' active':''}`}
                  onClick={() => { setSalaReporte(tab.id); try{sessionStorage.setItem(JEF_SALA_REPORTE_KEY,tab.id)}catch{} }}>
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="kpi-grid reportes-kpis" style={{gridTemplateColumns:'repeat(4,1fr)',margin:'16px 0'}}>
              <div className="kpi-card k-blue"> <div className="kpi-num">{repKpis.total}</div>  <div className="kpi-label">Total ventas</div></div>
              <div className="kpi-card k-green"><div className="kpi-num">{repKpis.inst}</div>   <div className="kpi-label">Instaladas</div></div>
              <div className="kpi-card k-red">  <div className="kpi-num">{repKpis.caidas}</div> <div className="kpi-label">Caídas</div></div>
              <div className="kpi-card k-purple"><div className="kpi-num">{repKpis.efect}</div> <div className="kpi-label">Efectividad</div></div>
            </div>
            <div className="tabla-wrap ranking-pro-card">
              <div className="tabla-header ranking-pro-header">
                <div>
                  <span className="tabla-title">Ranking de Asesores</span>
                  <span className="ranking-periodo-label">{mesReporte ? `Periodo ${mesReporte.split('-').reverse().join('/')}` : 'Histórico completo'}</span>
                </div>
                <span className="tabla-count">{reporteData.length} asesores</span>
              </div>
              <div style={{overflowX:'auto'}}>
                <table className="tabla tabla-ranking-pro">
                  <thead><tr><th style={{width:'60px'}}>RANK</th><th>ASESOR</th><th>SALA</th><th>VENTAS INSTALADAS</th><th>TOTAL VENTAS</th><th>CAÍDAS</th><th>EFECTIVIDAD</th></tr></thead>
                  <tbody>
                    {reporteData.length === 0
                      ? <tr><td colSpan="7" className="tabla-empty">Sin datos.</td></tr>
                      : reporteData.map((r, i) => (
                          <tr className={i < 3 ? `ranking-top ranking-top-${i+1}` : ''} key={r.id != null ? `rep-${r.id}` : `rep-i-${i}`}>
                            <td className="ranking-pos-cell">
                              <span className={`ranking-pos ranking-pos-${Math.min(i+1,4)}`}>{i < 3 ? ['1°','2°','3°'][i] : i+1}</span>
                            </td>
                            <td>
                              <div className="ranking-asesor">
                                <div className="ranking-avatar" style={{background:colorAvatar(r.nombre)}}>{iniciales(r.nombre)}</div>
                                <div><div className="ranking-nombre">{r.nombre}</div><div className="ranking-usuario">@{r.usuario||'sin-usuario'}</div></div>
                              </div>
                            </td>
                            <td><span className="ranking-sala">{r.sala||'—'}</span></td>
                            <td className="ranking-number"><span className="ranking-stat ranking-stat-installed">{r.instaladas}</span></td>
                            <td className="ranking-number"><span className="ranking-stat ranking-stat-total">{r.totalVentas}</span></td>
                            <td className="ranking-number"><span className="ranking-stat ranking-stat-falls">{r.caidas}</span></td>
                            <td className="ranking-effect-cell">
                              <div className="ranking-effect">
                                <div className="ranking-effect-meta">
                                  <span>Efectividad</span>
                                  <strong style={{color:efColor(r.efectividad)}}>{r.efectividad}%</strong>
                                </div>
                                <div className="ranking-effect-track">
                                  <div style={{background:efColor(r.efectividad),width:r.efectividad+'%'}}></div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== RECLUTADOS GENERALES ===== */}
          <section className={`section${seccion==='reclutados-generales'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Reclutados generales</h2><p>Postulantes registrados y entrevistas agendadas por todos los asesores de reclutamiento</p></div>
              <button className="btn-nuevo" onClick={()=>{ cargarReclutados(); cargarEntrevistados() }}>Actualizar</button>
            </div>

            <div className="nav-tabs" style={{display:'flex',gap:8,marginBottom:14}}>
              <button type="button" className={`btn-nuevo${reclutadosVista==='reclutados'?'':' btn-tab-inactivo'}`}
                style={reclutadosVista==='reclutados'?{}:{background:'#e5e7eb',color:'#374151'}}
                onClick={()=>setReclutadosVista('reclutados')}>Reclutados</button>
              <button type="button" className={`btn-nuevo${reclutadosVista==='entrevistados'?'':' btn-tab-inactivo'}`}
                style={reclutadosVista==='entrevistados'?{}:{background:'#e5e7eb',color:'#374151'}}
                onClick={()=>setReclutadosVista('entrevistados')}>Entrevistados</button>
            </div>

            {reclutadosVista==='reclutados' && (
            <div className="tabla-wrap">
              <div className="tabla-header">
                <span className="tabla-title">Postulantes generales</span>
                <span className="tabla-count">{reclutados.length} registros</span>
              </div>
              <div className="tabla-scroll">
                <table className="tabla reclutados-generales-tabla">
                  <thead><tr><th>#</th><th>Fecha</th><th>Nombre y apellidos</th><th>Documento</th><th>Teléfono</th><th>Distrito</th><th>Puesto</th><th>Campaña</th><th>Empresa</th><th>Reclutador</th><th>Estado</th><th>Acción</th></tr></thead>
                  <tbody>
                    {cargandoReclutados ? (
                      <tr className="tabla-empty"><td colSpan="12">Cargando reclutados...</td></tr>
                    ) : reclutados.length === 0 ? (
                      <tr className="tabla-empty"><td colSpan="12">Sin postulantes registrados.</td></tr>
                    ) : reclutados.map((v, i) => (
                      <tr key={v.id}>
                        <td>{i + 1}</td>
                        <td>{formatF(soloFecha(v.created_at))}</td>
                        <td style={{fontWeight:700}}>{v.nombre || '—'}</td>
                        <td>{v.dni || '—'}</td>
                        <td>{v.telefono1 || '—'}</td>
                        <td>{v.distrito || '—'}</td>
                        <td>{v.puesto || '—'}</td>
                        <td>{v.fuente || v.campana || '—'}</td>
                        <td>{v.empresa || '—'}</td>
                        <td>{v.usuario_nombre || '—'}</td>
                        <td><span className="flujo-ok">{v.estado_reclutamiento || 'NUEVO'}</span></td>
                        <td><button type="button" className="venta-action-btn delete" onClick={()=>eliminarReclutado(v)}>Eliminar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {reclutadosVista==='entrevistados' && (
            <div className="tabla-wrap">
              <div className="tabla-header">
                <span className="tabla-title">Entrevistas agendadas</span>
                <span className="tabla-count">{entrevistados.length} registros</span>
              </div>
              <div className="tabla-scroll">
                <table className="tabla reclutados-generales-tabla">
                  <thead><tr><th>#</th><th>Fecha agendamiento</th><th>Nombre postulante</th><th>Número</th><th>Turno</th><th>Campaña</th><th>Agendado por</th><th>Tipificación</th><th>Observación</th><th>Acción</th></tr></thead>
                  <tbody>
                    {cargandoEntrevistados ? (
                      <tr className="tabla-empty"><td colSpan="10">Cargando entrevistas...</td></tr>
                    ) : entrevistados.length === 0 ? (
                      <tr className="tabla-empty"><td colSpan="10">Sin entrevistas agendadas.</td></tr>
                    ) : entrevistados.map((e, i) => (
                      <tr key={e.id}>
                        <td>{i + 1}</td>
                        <td>{formatF(soloFecha(e.fecha_agendamiento))}</td>
                        <td style={{fontWeight:700}}>{e.nombre_postulante || '—'}</td>
                        <td>{e.numero || e.numero_ref || '—'}</td>
                        <td>{e.turno || '—'}</td>
                        <td>{e.campana || '—'}</td>
                        <td>{e.creado_por_nombre || '—'}</td>
                        <td>{e.tipificacion ? <span className="flujo-ok">{e.tipificacion}</span> : '—'}</td>
                        <td>{e.observacion || '—'}</td>
                        <td style={{display:'flex',gap:6}}>
                          <button type="button" className="venta-action-btn" onClick={()=>abrirEditarEntrevista(e)}>Editar</button>
                          <button type="button" className="venta-action-btn delete" onClick={()=>eliminarEntrevista(e)}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}
          </section>

          {/* ===== ELIMINACIONES GENERALES ===== */}
          <section className={`section${seccion==='eliminaciones'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Eliminaciones generales</h2><p>Auditoría de ventas, postulantes y números eliminados desde todos los módulos</p></div>
              <button className="btn-nuevo" onClick={cargarEliminaciones} disabled={cargandoEliminaciones}>Actualizar</button>
            </div>
            <div className="tabla-wrap">
              <div className="tabla-header">
                <span className="tabla-title">Registro general de eliminaciones</span>
                <span className="tabla-count">{eliminaciones.length} registros</span>
              </div>
              <div className="tabla-scroll">
                <table className="tabla eliminaciones-tabla">
                  <thead><tr><th>#</th><th>Fecha</th><th>Hora</th><th>Usuario</th><th>Cargo</th><th>Tipo</th><th>ID</th><th>Detalle eliminado</th><th>Acción</th></tr></thead>
                  <tbody>
                    {cargandoEliminaciones ? (
                      <tr className="tabla-empty"><td colSpan="9">Cargando eliminaciones...</td></tr>
                    ) : eliminaciones.length === 0 ? (
                      <tr className="tabla-empty"><td colSpan="9">Todavía no hay eliminaciones registradas.</td></tr>
                    ) : eliminaciones.map((item, i) => {
                      const fechaHora = String(item.created_at || '').replace('T', ' ').split('.')[0]
                      const partes = fechaHora.split(' ')
                      return (
                        <tr key={item.id}>
                          <td>{i + 1}</td>
                          <td>{formatF(partes[0])}</td>
                          <td>{partes[1] || '—'}</td>
                          <td style={{fontWeight:700}}>{item.actor_nombre || '—'}</td>
                          <td>{cargoObj(item.actor_cargo).label || item.actor_cargo || '—'}</td>
                          <td><span className="flujo-warn">{etiquetaTipoEliminacion(item.tipo)}</span></td>
                          <td>{item.registro_id || '—'}</td>
                          <td>{item.detalle || '—'}</td>
                          <td><div className="venta-actions">
                            <button
                              type="button"
                              className="venta-action-btn history"
                              disabled={!snapshotEliminado(item)}
                              onClick={()=>setDetalleEliminacion(item)}
                            >
                              Ver detalle
                            </button>
                            {item.tipo === 'VENTA' && (
                              <button
                                type="button"
                                className="venta-action-btn edit"
                                disabled={Boolean(item.restored_at) || eliminacionRestaurandoId !== null}
                                onClick={()=>restablecerRegistroEliminacion(item)}
                              >
                                {item.restored_at ? 'Restablecida' : eliminacionRestaurandoId === item.id ? 'Restableciendo...' : 'Restablecer'}
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-eliminar-usuario"
                              disabled={eliminacionBorrandoId !== null}
                              onClick={()=>eliminarRegistroEliminacion(item)}
                            >
                              {eliminacionBorrandoId === item.id ? 'Eliminando...' : 'Eliminar'}
                            </button>
                          </div></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ===== LOGS ===== */}
          <section className={`section${seccion==='logs'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Logs de Actividad</h2><p>Registro de acciones en el sistema</p></div>
              <button className="btn-nuevo" style={{background:'#ef4444'}} onClick={limpiarLogs}>Limpiar</button>
            </div>
            <div className="tabla-wrap" style={{padding:'16px 20px'}}>
              {logs.length === 0
                ? <div style={{textAlign:'center',color:'#9ca3af',padding:'32px',fontSize:'13px'}}>Sin actividad.</div>
                : logs.slice(0,50).map((l, i) => (
                    <div key={`log-${String(l.id)}-${i}`} className="log-item">
                      <div className="log-dot" style={{background:l.color||'#7C3AED'}}></div>
                      <div className="log-content">
                        <div className="log-accion">
                          {l.accion}
                          {l.detalle && <span style={{color:'#6b7280',fontWeight:400}}> — {l.detalle}</span>}
                        </div>
                        <div className="log-meta"><span className="log-user">{l.usuario}</span> · {formatF(l.fecha)} {l.hora}</div>
                      </div>
                    </div>
                  ))
              }
            </div>
          </section>

        </main>
      </div>

      {/* MODAL USUARIO */}
      {detalleEliminacion && (() => {
        const snapshot = snapshotEliminado(detalleEliminacion) || {}
        return (
          <div className="modal-bg open" onClick={e=>{if(e.target===e.currentTarget)setDetalleEliminacion(null)}}>
            <div className="modal-box eliminacion-detalle-modal">
              <div className="modal-head">
                <span className="modal-head-title">Detalle completo: {etiquetaTipoEliminacion(detalleEliminacion.tipo)}</span>
                <button className="modal-close" onClick={()=>setDetalleEliminacion(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="eliminacion-resumen">
                  Eliminado por <strong>{detalleEliminacion.actor_nombre}</strong> · ID {detalleEliminacion.registro_id}
                </div>
                {detalleEliminacion.restored_at && (
                  <div className="eliminacion-resumen" style={{marginTop:8,borderColor:'#86efac',background:'#f0fdf4',color:'#166534'}}>
                    Restablecida por <strong>{detalleEliminacion.restored_by_nombre || 'Jefatura'}</strong>
                  </div>
                )}
                <div className="eliminacion-campos">
                  {Object.entries(snapshot).map(([campo, valor]) => (
                    <div className="eliminacion-campo" key={campo}>
                      <span>{campo.replaceAll('_', ' ')}</span>
                      <strong>{valor === null || valor === '' ? '—' : typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-cancelar-m" onClick={()=>setDetalleEliminacion(null)}>Cerrar</button>
                {detalleEliminacion.tipo === 'VENTA' && (
                  <button
                    className="btn-guardar-m"
                    disabled={Boolean(detalleEliminacion.restored_at) || eliminacionRestaurandoId !== null}
                    onClick={()=>restablecerRegistroEliminacion(detalleEliminacion)}
                  >
                    {detalleEliminacion.restored_at ? 'Venta restablecida' : eliminacionRestaurandoId === detalleEliminacion.id ? 'Restableciendo...' : 'Restablecer venta'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {modalUsu && (
        <div className="modal-bg open" onClick={e=>{if(e.target===e.currentTarget)cerrarModalUsu()}}>
          <div className="modal-box">
            <div className="modal-title">{editandoId?'Editar usuario':'Nuevo usuario'}</div>
            <div className="modal-sub">{editandoId?`Editando: ${modForm.nombre}`:'Completa todos los campos.'}</div>
            <div className="modal-grid">
              <div className="modal-sep">Datos personales</div>
              <div className={`modal-campo span2${modErrores.nombre?' error':''}`}>
                <label>Nombre completo *</label>
                <input value={modForm.nombre} onChange={e=>setField('nombre',e.target.value)} placeholder="Nombre y apellidos" className={modErrores.nombre?'error':''} />
              </div>
              <div className={`modal-campo${modErrores.usuario?' error':''}`}>
                <label>Usuario (login) *</label>
                <input value={modForm.usuario} onChange={e=>setField('usuario',e.target.value)} placeholder="nombre.apellido" style={{fontFamily:'monospace'}} className={modErrores.usuario?'error':''} />
              </div>
              <div className={`modal-campo${modErrores.cargo?' error':''}`}>
                <label>Cargo principal *</label>
                <select value={modForm.cargo} onChange={e=>setField('cargo',e.target.value)} className={modErrores.cargo?'error':''}>
                  <option value="">— Seleccionar cargo —</option>
                  {CARGOS.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className={`modal-campo${modErrores.cargo2?' error':''}`}>
                <label>Cargo adicional (opcional)</label>
                <select value={modForm.cargo2} onChange={e=>setField('cargo2',e.target.value)} className={modErrores.cargo2?'error':''}>
                  <option value="">— Sin cargo adicional —</option>
                  {CARGOS.filter(c=>c.id!==modForm.cargo && c.id!=='jefatura').map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className={`modal-campo${modErrores.cargo3?' error':''}`}>
                <label>Segundo cargo adicional (opcional)</label>
                <select value={modForm.cargo3} onChange={e=>setField('cargo3',e.target.value)} className={modErrores.cargo3?'error':''}>
                  <option value="">— Sin cargo adicional —</option>
                  {CARGOS.filter(c=>c.id!==modForm.cargo && c.id!==modForm.cargo2 && c.id!=='jefatura').map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="modal-campo">
                <label>Sala / Equipo</label>
                <select value={modForm.sala} onChange={e=>setField('sala',e.target.value)}>
                  <option value="">— Seleccionar sala —</option>
                  {SALAS.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="modal-sep">Contraseña</div>
              <div className={`modal-campo${modErrores.pass?' error':''}`}>
                <label>Contraseña *</label>
                <input type="password" value={modForm.pass} onChange={e=>setField('pass',e.target.value)} placeholder="Mínimo 6 caracteres" className={modErrores.pass?'error':''} />
              </div>
              <div className={`modal-campo${modErrores.pass2?' error':''}`}>
                <label>Confirmar contraseña *</label>
                <input type="password" value={modForm.pass2} onChange={e=>setField('pass2',e.target.value)} placeholder="Repite la contraseña" className={modErrores.pass2?'error':''} />
              </div>
            </div>
            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:'8px',padding:'10px 14px',fontSize:'12px',color:'#14532d',marginBottom:'16px'}}>
              Al crear un usuario con cargo <strong>Asesor</strong>, estará disponible en Back Data para asignar leads.
            </div>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={cerrarModalUsu}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarUsuario} disabled={guardandoUsu}>
                {guardandoUsu ? 'Guardando...' : 'Guardar usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      <MediaViewer
        open={!!mediaVenta}
        onClose={()=>setMediaVenta(null)}
        ventaId={mediaVenta?.id}
        title={`Archivos de ${mediaVenta?.nombre || 'la venta'}`}
        subtitle={`DNI: ${mediaVenta?.dni || '—'} · Tel: ${mediaVenta?.telefono1 || '—'}`}
        audioPath={mediaVenta?.audio_path}
        audioName={mediaVenta?.audio_path ? mediaVenta.audio_path.split('/').pop() : ''}
      />

      {ventaReasignar && (
        <ReasignarVentaModal
          venta={ventaReasignar}
          asesores={usuarios.filter(usuario => usuarioTieneCargo(usuario, 'asesor') && usuario.activo)}
          salas={salasUsuariosDisponibles}
          alcance="global"
          onClose={()=>setVentaReasignar(null)}
          onSuccess={completarReasignacion}
        />
      )}

      {ventaHistorial && (
        <HistorialVentaModal
          venta={ventaHistorial}
          onClose={()=>setVentaHistorial(null)}
        />
      )}

      {ventaEditar && (
        <VentaEditarModal
          venta={ventaEditar}
          onClose={()=>setVentaEditar(null)}
          onSuccess={()=>{ setVentaEditar(null); Promise.all([cargarSeguimiento(), cargarVentasCache()]); mostrarToast('Datos actualizados') }}
        />
      )}

      {ventaProgramar && (
        <VentaProgramarModal
          venta={ventaProgramar}
          onClose={()=>setVentaProgramar(null)}
          onSuccess={()=>{ setVentaProgramar(null); Promise.all([cargarSeguimiento(), cargarVentasCache()]); mostrarToast('Programación actualizada') }}
        />
      )}

      {/* MODAL ELIMINAR USUARIO */}
      {modalEliminar && (
        <div className="modal-bg open" onClick={e=>{if(e.target===e.currentTarget&&!eliminandoUsu)setModalEliminar(null)}}>
          <div className="modal-box modal-eliminar-box" role="dialog" aria-modal="true" aria-labelledby="titulo-eliminar-usuario">
            <div id="titulo-eliminar-usuario" className="modal-title">Eliminar usuario</div>
            <p className="modal-eliminar-texto">
              ¿Estás seguro de eliminar a <strong>{modalEliminar.nombre}</strong>?
              <span>Esta acción no se puede deshacer.</span>
            </p>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={()=>setModalEliminar(null)} disabled={eliminandoUsu}>Cancelar</button>
              <button className="btn-confirmar-eliminar" onClick={confirmarEliminarUsuario} disabled={eliminandoUsu}>
                {eliminandoUsu?'Eliminando...':'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDITAR ENTREVISTA (Reclutados generales → Entrevistados) */}
      {entrevistaEditar && (
        <div className="modal-bg open" onClick={e=>{if(e.target===e.currentTarget && !guardandoEntrevista)setEntrevistaEditar(null)}}>
          <div className="modal-box">
            <div className="modal-title">Editar entrevista</div>
            <div className="modal-sub">{entrevistaEditar.nombre_postulante || 'Postulante'}</div>
            <div className="modal-grid">
              <div className="modal-campo">
                <label>Tipificación</label>
                <select value={entrevistaForm.tipificacion} onChange={e=>setEntrevistaForm(f=>({...f,tipificacion:e.target.value}))}>
                  <option value="">— Sin tipificar —</option>
                  {TIPIFICACIONES_ENTREVISTA.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="modal-campo">
                <label>Turno</label>
                <select value={entrevistaForm.turno} onChange={e=>setEntrevistaForm(f=>({...f,turno:e.target.value}))}>
                  {TURNOS_ENTREVISTA.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="modal-campo">
                <label>Fecha de agendamiento</label>
                <input type="date" value={entrevistaForm.fecha_agendamiento} onChange={e=>setEntrevistaForm(f=>({...f,fecha_agendamiento:e.target.value}))} />
              </div>
              <div className="modal-campo span2">
                <label>Observación</label>
                <textarea rows={3} value={entrevistaForm.observacion} onChange={e=>setEntrevistaForm(f=>({...f,observacion:e.target.value}))} placeholder="Notas de la entrevista" />
              </div>
            </div>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={()=>setEntrevistaEditar(null)} disabled={guardandoEntrevista}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarEntrevista} disabled={guardandoEntrevista}>
                {guardandoEntrevista ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELECTOR DE USUARIO POR MÓDULO */}
      {selectorModulo.open && selectorModulo.modulo && (
        <div className="selector-modulo-overlay" onClick={e=>{ if(e.target===e.currentTarget) cerrarSelectorModulo() }}>
          <div className="selector-modulo-box">
            <div className="selector-modulo-head">
              <div className="selector-modulo-titulo">
                <span className="selector-modulo-icon" style={{background:selectorModulo.modulo.color+'12',color:selectorModulo.modulo.color}}><ModuloIcon tipo={selectorModulo.modulo.icon} size={24}/></span>
                <div>
                  <strong>Entrar a {selectorModulo.modulo.nombre}</strong>
                  <span>Selecciona un usuario para abrir el módulo con acceso de Jefatura</span>
                </div>
              </div>
              <button type="button" className="selector-modulo-cerrar" onClick={cerrarSelectorModulo} aria-label="Cerrar">×</button>
            </div>
            <div className="selector-modulo-busqueda">
              <div className="selector-busqueda-campo">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
                <input
                  autoFocus
                  type="search"
                  value={selectorModulo.buscar}
                  onChange={e=>setSelectorModulo(prev=>({...prev,buscar:e.target.value}))}
                  placeholder="Buscar por nombre, usuario o sala..."
                />
              </div>
              <span className="selector-resultados">{usuariosModulo.length} resultado{usuariosModulo.length===1?'':'s'}</span>
            </div>
            <div className="selector-modulo-lista">
              {usuariosModulo.length === 0 ? (
                <div className="selector-modulo-vacio">
                  No hay usuarios registrados con el cargo {cargoObj(selectorModulo.modulo.cargo).label}.
                </div>
              ) : usuariosModulo.map(u => (
                <div className={`selector-usuario${u.activo?'':' inactivo'}`} key={u.id}>
                  <div className="selector-usuario-avatar" style={{background:colorAvatar(u.nombre||u.usuario||'U')}}>{iniciales(u.nombre||u.usuario||'U')}</div>
                  <div className="selector-usuario-info">
                    <strong>{u.nombre || u.usuario}</strong>
                    <span>@{u.usuario || 'sin usuario'} · {u.sala || 'Sin sala'}</span>
                  </div>
                  <span className={`selector-usuario-estado ${u.activo?'activo':'inactivo'}`}>{u.activo?'Activo':'Inactivo'}</span>
                  <button type="button" onClick={()=>entrarModulo(selectorModulo.modulo,u)} disabled={!u.activo}>
                    <span>Entrar</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="selector-modulo-nota">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>
              <span>La sesión conservará todos los permisos de Jefatura.</span>
            </div>
          </div>
        </div>
      )}

      {toastMsg && <div className="toast show">{toastMsg}</div>}

    </div>
  )
}
