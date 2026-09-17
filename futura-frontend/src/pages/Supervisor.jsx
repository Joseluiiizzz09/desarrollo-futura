import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import JefaturaViewControls from '../components/JefaturaViewControls'
import { ReasignarVentaModal } from '../components/VentaAssignmentModal'
import { VentaEditarModal } from '../components/VentaEditarModal'
import ObsSeguimientoCell from '../components/ObsSeguimientoCell'
import ProgramacionInfoCell from '../components/ProgramacionInfoCell'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import CanalBadge from '../components/CanalBadge'
import { API, NC_API, ncHeaders, ncHeadersFile } from '../services/api'
import { responseChanged, setVisibleInterval, clearVisibleInterval } from '../utils/polling'
import { usuarioTieneCargo } from '../utils/roles'
import '../styles/supervisor.css'

// â”€â”€ Constantes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ESTADOS_VENTA = [
  { id:'venta',         label:'Venta',           cls:'be-venta',      dot:'#2563eb' },
  { id:'validado',      label:'Validado',         cls:'be-validado',   dot:'#7c3aed' },
  { id:'no_validado',   label:'No Validado',      cls:'be-caida',      dot:'#dc2626' },
  { id:'en_revision',   label:'En Revisión',      cls:'be-revision',   dot:'#2563eb' },
  { id:'grabado',       label:'Grabado',          cls:'be-grabado',    dot:'#d97706' },
  { id:'no_grabado',    label:'No Grabado',       cls:'be-pendiente',  dot:'#9ca3af' },
  { id:'en_ejecucion',  label:'En Ejecución',     cls:'be-ejecucion',  dot:'#0891b2' },
  { id:'instalado',     label:'Instalado',        cls:'be-instalado',  dot:'#2563eb', bg:'#eff6ff', border:'1px solid rgba(96,165,250,.35)' },
  { id:'caida',         label:'Caída',            cls:'be-caida',      dot:'#b91c1c', bg:'#fee2e2', border:'1px solid rgba(248,113,113,.35)' },
  { id:'rechazo_campo', label:'Rechazo Campo',    cls:'be-rechazocampo', dot:'#c2410c', bg:'#fff7ed', border:'1px solid rgba(251,146,60,.38)' },
  { id:'rechazo_mesa',  label:'Rechazo en Mesa',  cls:'be-rechazocampo', dot:'#c2410c', bg:'#fff7ed', border:'1px solid rgba(251,146,60,.38)' },
  { id:'tecnico_casa',  label:'Técnico en Casa',  cls:'be-observado',  dot:'#be185d', bg:'#fce7f3', border:'1px solid rgba(244,114,182,.45)' },
  { id:'levantar_sot', label:'Levantar SOT', cls:'be-rechazocampo', dot:'#c2410c' },
  { id:'tecnicos_camino', label:'Técnicos en Camino', cls:'be-observado', dot:'#be185d' },
  { id:'instalado_no_validado', label:'Instalado No Validado', cls:'be-instalado', dot:'#2563eb' },
  { id:'reasignacion', label:'Reasignación', cls:'be-ejecucion', dot:'#0891b2' },
  { id:'derivado_planta_externa', label:'Derivado a Planta Externa', cls:'be-rechazocampo', dot:'#c2410c' },
  { id:'servicio_activo_seguimiento', label:'Servicio Activo', cls:'be-servicio', dot:'#1f2937' },
  { id:'no_instalado',   label:'No Instalado',    cls:'be-caida',      dot:'#991b1b' },
  { id:'fraude',         label:'Fraude',          cls:'be-fraude',     dot:'#7f1d1d', bg:'#fecaca', border:'1px solid #ef4444' },
  { id:'no_desea',       label:'No Desea',        cls:'be-nodesea',    dot:'#5c2e0a', bg:'#e9d5b8', border:'1px solid #b45309' },
  { id:'no_contesta',    label:'No Contesta',     cls:'be-nocontesta', dot:'#78350f', bg:'#fde68a', border:'1px solid #f59e0b' },
  { id:'buzon_voz',      label:'Buzón de Voz',    cls:'be-buzon',      dot:'#0e4a5e', bg:'#a5f3fc', border:'1px solid #06b6d4' },
  { id:'corta_llamada',  label:'Corta Llamada',   cls:'be-corta',      dot:'#1e3a8a', bg:'#bfdbfe', border:'1px solid #3b82f6' },
  { id:'servicio_activo',label:'Servicio Activo', cls:'be-servicio',   dot:'#1f2937', bg:'#e5e7eb', border:'1px solid #9ca3af' },
  { id:'grabando',       label:'Grabando',        cls:'be-grabando',   dot:'#9a3412', bg:'#fed7aa', border:'1px solid rgba(234,88,12,.45)' },
  { id:'suplantacion',   label:'Suplantación',    cls:'be-suplantacion',dot:'#9d174d', bg:'#fce7f3', border:'1px solid rgba(219,39,119,.45)' },
  { id:'corregir',       label:'Corregir',        cls:'be-observado',  dot:'#78350f', bg:'#fef3c7', border:'1px solid #fcd34d' },
  { id:'mala_oferta',    label:'Mala Oferta',     cls:'be-nodesea',    dot:'#9a3412', bg:'#ffedd5', border:'1px solid #fdba74' },
  { id:'programado',        label:'Programado',        cls:'be-prog-programado',  dot:'#047857', bg:'#dcfce7', border:'1px solid rgba(52,211,153,.45)' },
  { id:'bloqueado',         label:'Bloqueado',         cls:'be-prog-bloqueado',   dot:'#b91c1c', bg:'#fee2e2', border:'1px solid rgba(248,113,113,.5)' },
  { id:'sin_agenda',        label:'Sin Agenda',        cls:'be-prog-sinagenda',   dot:'#a16207', bg:'#fef9c3', border:'1px solid rgba(250,204,21,.55)' },
  { id:'caracter_especial', label:'Carácter Especial', cls:'be-prog-caracter',    dot:'#6d28d9', bg:'#f5f3ff', border:'1px solid rgba(167,139,250,.55)' },
  { id:'zona_restringida',  label:'Zona Restringida',  cls:'be-prog-zona',        dot:'#c2410c', bg:'#ffedd5', border:'1px solid rgba(251,146,60,.52)' },
]
const TIPIF_COLORS = {
  'VENTA CERRADA':'#16a34a','PREVENTA':'#2563eb','AGENDADO':'#c2410c',
  'NO CONTESTA':'#854d0e','CORTA LLAMADA':'#c2410c','NO DESEA':'#92400e',
  'BUZON DE VOZ':'#78350f','SERVICIO ACTIVO':'#4b5563','SIN COBERTURA':'#b91c1c','NO CALIFICA':'#9a3412',
  'CONTACTO CON TERCEROS':'#047857','EDIFICIO NO LIBERADO':'#991b1b','DESEA MOVIL':'#92400e','EN EJECUCION':'#4b5563','NO ROTAR':'#980000',
}
const COLORES_AV = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#ef4444','#06b6d4','#ec4899','#f59e0b']
const NV_DEFAULT = { n1:'', n2:'', campana:'', asesor:'', estado:'', fecha:'', obs:'' }

// â”€â”€ Utilidades â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function colorFor(n) { let s=0; for(const c of (n||'')) s+=c.charCodeAt(0); return COLORES_AV[s%COLORES_AV.length] }
function iniciales(n) { return (n||'?').trim().split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase() }
function primerNombre(n) { return String(n||'').trim().split(/\s+/)[0] || '' }
function normalizarSala(s) { return String(s||'').trim().toUpperCase() }
const TIPIFICACIONES_VALIDACION = new Set(['CORTA LLAMADA','FRAUDE','NO DESEA','NO CONTESTA','BUZÓN DE VOZ','BUZON DE VOZ','SERVICIO ACTIVO','CORREGIR','MALA OFERTA','VENTA','VALIDADO'])
const ESTADO_POR_TIPIFICACION_VALIDACION = {
  'CORTA LLAMADA':'corta_llamada', FRAUDE:'fraude', 'NO DESEA':'no_desea',
  'NO CONTESTA':'no_contesta', 'BUZÓN DE VOZ':'buzon_voz', 'BUZON DE VOZ':'buzon_voz',
  'SERVICIO ACTIVO':'servicio_activo', CORREGIR:'corregir', 'MALA OFERTA':'mala_oferta',
}
function getTipificacionValidacion(obs) {
  const lineas = String(obs||'').split('\n').map(l=>l.trim()).filter(Boolean)
  for (let i=lineas.length-1; i>=0; i--) {
    const mensaje = ((lineas[i].match(/^\[.+?\]\s*(.*)$/)||[])[1] || lineas[i]).trim().toUpperCase()
    if (TIPIFICACIONES_VALIDACION.has(mensaje)) return ESTADO_POR_TIPIFICACION_VALIDACION[mensaje] || ''
  }
  return ''
}
function getObsValidacion(obs) {
  const lineas = String(obs||'').split('\n').map(l=>l.trim()).filter(Boolean)
  for (let i=lineas.length-1; i>=0; i--) {
    const mensaje = ((lineas[i].match(/^\[.+?\]\s*(.*)$/)||[])[1] || lineas[i]).trim()
    if (mensaje && !TIPIFICACIONES_VALIDACION.has(mensaje.toUpperCase())) return mensaje
  }
  return '—'
}
function fechaHoy() {
  const a=new Date(), u=a.getTime()+a.getTimezoneOffset()*60000, p=new Date(u-5*3600000)
  return p.getFullYear()+'-'+String(p.getMonth()+1).padStart(2,'0')+'-'+String(p.getDate()).padStart(2,'0')
}
function mesActual() { return fechaHoy().slice(0,7) }
function getMesLabel(o=0) { const d=new Date(); d.setMonth(d.getMonth()-o); return d.toLocaleString('es-PE',{month:'long',year:'numeric'}) }
function getMesClave(o=0) { const d=new Date(); d.setMonth(d.getMonth()-o); return d.toISOString().slice(0,7) }
function formatF(f) { if(!f)return'—'; const p=f.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }
function etiquetaFlujo(valor, fallback='PENDIENTE') {
  const texto = String(valor || '').trim()
  return (texto || fallback).replace(/_/g,' ').toUpperCase()
}
function estadoValidacionFlujo(v) {
  const estado = String(v?.estado || '').trim().toUpperCase()
  if (!estado || estado === 'VENTA') return 'PENDIENTE'
  return etiquetaFlujo(v?.estado_validacion && String(v.estado_validacion).toUpperCase() !== 'VENTA' ? v.estado_validacion : estado)
}
function claseFlujo(valor) {
  const e = String(valor || '').trim().toLowerCase().replace(/_/g,' ')
  if (['validado','validada','grabado','grabada','aprobado','programado','instalado'].includes(e)) return 'ok'
  if (['grabando','en revision','en revisión','observado'].includes(e)) return 'warn'
  if (['no validado','rechazado','caida','caída','bloqueado','fraude'].includes(e)) return 'danger'
  return 'pending'
}
function ventaAlcanzoInstalacion(venta) {
  const estado = String(venta?._estado || venta?.estado || '').trim().toLowerCase().replace(/_/g, ' ')
  return Boolean(venta?.fecha_instalado) || ['instalado', 'instalado no validado', 'reasignacion'].includes(estado)
}
function mapearEstado(e, sup = '', eg = '', obsValidacion = '') {
  const s=(e||'').toLowerCase().trim()
  const sr=(sup||'').toLowerCase().trim()
  const g=(eg||'').toLowerCase().trim()
  // Seguimiento puede devolver una venta a PENDIENTE. En ese caso Supervisor
  // conserva la tipificación final que Validación dejó registrada en su historial.
  if (s==='pendiente') {
    const tipificacionValidacion = getTipificacionValidacion(obsValidacion)
    if (tipificacionValidacion) return tipificacionValidacion
  }
  // Estado de Grabaciones ? independiente de `estado` (Validaci?n no cambia).
  // Mientras Super de Grabaciones no corrobore, se conserva GRABANDO.
  // Condicionado a s==='validado': en cuanto Programaci?n avanza `estado`
  // (PROGRAMADO/BLOQUEADO/etc), esa etapa manda sobre el historial de
  // Grabaciones, que ya qued? fijo y no debe seguir tapando el estado real.
  if (s==='validado') {
    if (g==='grabando' || (g==='grabado' && sr!=='aprobado')) return 'grabando'
    if (g==='grabado' && sr==='aprobado') return 'grabado'
    if (['corta_llamada','suplantacion','no_desea','no_contesta','buzon_voz'].includes(g)) return g
  }
  // â”€â”€ Comportamiento previo (compatibilidad con filas viejas donde el flujo
  // de Grabaciones todav?a escrib?a en el campo compartido `estado`). â”€â”€
  if(s==='grabado' && (sr==='sin_revisar' || sr==='en_revision')) return 'en_revision'
  if(s==='grabado' && sr==='aprobado') return 'grabado'
  if(s===''||s==='venta') return 'venta'
  if(s==='validado')      return 'validado'
  if(s==='no_validado'||s==='observado') return 'no_validado'
  if(s==='grabado')       return 'grabado'
  if(s==='pendiente')     return 'no_grabado'
  // PROGRAMADO permanece pendiente de la decisión de Sup. Grabaciones.
  // Solo CONFORME habilita el flujo de ejecución/seguimiento.
  if(s==='programado')        return sr === 'conforme' ? 'en_ejecucion' : 'programado'
  if(s==='bloqueado')         return 'bloqueado'
  if(s==='sin_agenda')        return 'sin_agenda'
  if(s==='caracter_especial') return 'caracter_especial'
  if(s==='zona_restringida')  return 'zona_restringida'
  if(['aprobado','en_ejecucion','en ejecucion'].includes(s)) return 'en_ejecucion'
  if(s==='instalado')     return 'instalado'
  if(s==='caida')         return 'caida'
  if(s==='rechazo_campo') return 'rechazo_campo'
  if(s==='rechazo_mesa') return 'rechazo_mesa'
  if(s==='tecnico_casa')  return 'tecnico_casa'
  if(s==='levantar_sot') return 'levantar_sot'
  if(s==='tecnicos_camino') return 'tecnicos_camino'
  if(s==='instalado_no_validado') return 'instalado_no_validado'
  if(s==='reasignacion') return 'reasignacion'
  if(s==='derivado_planta_externa') return 'derivado_planta_externa'
  if(s==='servicio_activo' && sr==='conforme') return 'servicio_activo_seguimiento'
  if(s==='no_instalado')  return 'no_instalado'
  if(['fraude','no_desea','no_contesta','buzon_voz','corta_llamada','servicio_activo','corregir','mala_oferta'].includes(s)) return s
  return 'venta'
}
function estadoObj(id) { return ESTADOS_VENTA.find(e=>e.id===id)||ESTADOS_VENTA[0] }
function getUltimos7Dias() {
  const dias=[]; for(let i=6;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); dias.push(d.toISOString().split('T')[0]) }
  return dias
}

function BadgeEstado({ id, grabandoPorNombre, fraudeProgramacion }) {
  const e = estadoObj(id)
  // FRAUDE es ambiguo entre Validaci?n y Programaci?n (mismo valor de
  // `estado`); solo llega a Programaci?n tras estado_supgrab='aprobado',
  // as? que ese dato distingue cu?l lo marc?, sin necesitar campo nuevo.
  const progFraude = id === 'fraude' && fraudeProgramacion
  const bg = progFraude ? '#111827' : (e.bg || `${e.dot}22`)
  const border = progFraude ? '1px solid #111827' : (e.border || `1px solid ${e.dot}44`)
  const color = progFraude ? '#fff' : e.dot
  // El nombre es solo visual (resuelto por el backend desde grabando_por_id);
  // el estado interno sigue siendo ?nicamente "grabando".
  const label = (id === 'grabando' && grabandoPorNombre) ? `${e.label} ${primerNombre(grabandoPorNombre)}` : e.label
  return <span style={{display:'inline-flex',padding:'3px 10px',borderRadius:99,fontSize:10,fontWeight:700,background:bg,color:color,border:border}}>{label}</span>
}

// â”€â”€ Componente principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function Supervisor() {
  const navigate   = useNavigate()
  const { sesion, logout } = useAuth()
  const toastTimer = useRef(null)

  // Charts
  const ch1Ref = useRef(null), ch2Ref = useRef(null), ch3Ref = useRef(null), ch4Ref = useRef(null)
  const chartInst = useRef({})

  // â”€â”€ Session â”€â”€
  const salaActual    = sesion?.sala || 'SALA 1'
  const supervisorNom = sesion?.nombre || 'Supervisor'

  // â”€â”€ Section / period â”€â”€
  const [seccion, setSeccion] = useState(() => sessionStorage.getItem('nc_supervisor_apartado') || 'dashboard')
  const [periodo, setPeriodoState] = useState(() => sessionStorage.getItem('nc_supervisor_periodo') || 'mes')
  const [sidebarAbierto, setSidebarAbierto] = useState(() => sessionStorage.getItem('nc_supervisor_sidebar') !== 'cerrado')

  // â”€â”€ Data â”€â”€
  const [asesores, setAsesores] = useState([])
  const [ventas,   setVentas]   = useState([])
  const [frases,   setFrases]   = useState([])

  // â”€â”€ Filtros ventas â”€â”€
  const [filtroAsesor,  setFiltroAsesor]  = useState('')
  const [filtroEstado,  setFiltroEstado]  = useState('')
  const [filtroFecha,   setFiltroFecha]   = useState('')
  const [tablaSearch,   setTablaSearch]   = useState('')
  const [ventasPagina,  setVentasPagina]  = useState(1)
  const ventasPorPagina = 15

  // â”€â”€ Equipo â”€â”€
  const [equipoBuscar,      setEquipoBuscar]      = useState('')
  const [equipoFiltroEstado,setEquipoFiltroEstado] = useState('')

  // â”€â”€ Panel agregar venta â”€â”€
  const [panelNV, setPanelNV] = useState(false)
  const [nvForm,  setNvForm]  = useState(NV_DEFAULT)

  // â”€â”€ Modal detalle asesor â”€â”€
  const [modalAsesor, setModalAsesor] = useState({ open:false, nombre:'' })

  // â”€â”€ Modal base de llamadas â”€â”€
  const [blModal,    setBlModal]    = useState({ open:false, nombre:'', asesorId:null })
  const [blLeads,    setBlLeads]    = useState([])
  const [blFecha,    setBlFecha]    = useState(fechaHoy())
  const [blCargando, setBlCargando] = useState(false)

  // â”€â”€ Frases â”€â”€
  const [fraseTexto, setFraseTexto] = useState('')
  const [fraseEliminandoId, setFraseEliminandoId] = useState(null)

  // â”€â”€ Toast â”€â”€
  const [toast, setToast] = useState('')
  const [ventaReasignar, setVentaReasignar] = useState(null)
  const [ventaEditar, setVentaEditar] = useState(null)
  const [obsValidacionDetalle, setObsValidacionDetalle] = useState('')
  const [modalFotos, setModalFotos] = useState({ open:false, ventaId:null, nombre:'' })
  const [fotos, setFotos] = useState([])

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // â”€â”€ Fotos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function abrirFotos(v) {
    if (!v) return
    setModalFotos({ open:true, ventaId:v.id, nombre:v.nombre||'--' })
    await recargarFotos(v.id)
  }

  async function recargarFotos(ventaId) {
    try {
      const res  = await fetch(`${API}/ventas/${ventaId}/fotos`, { headers:ncHeaders() })
      const data = await res.json()
      setFotos(data.ok ? data.data : [])
    } catch(e) { setFotos([]) }
  }

  async function adjuntarFotos(files, ventaId) {
    for (const file of Array.from(files)) {
      const fd = new FormData(); fd.append('foto', file)
      try {
        const res  = await fetch(`${API}/ventas/${ventaId}/fotos`, {
          method:'POST', headers:ncHeadersFile(), body:fd,
        })
        const data = await res.json()
        if (!data.ok) mostrarToast('Error subiendo: ' + (data.mensaje || ''))
      } catch(e) { mostrarToast('Error de conexión al subir foto') }
    }
    await recargarFotos(ventaId)
  }

  async function eliminarFoto(fotoId, ventaId) {
    if (!confirm('¿Eliminar esta foto?')) return
    try {
      await fetch(`${API}/ventas/${ventaId}/fotos/${fotoId}`, { method:'DELETE', headers:ncHeaders() })
      await recargarFotos(ventaId)
    } catch(e) { mostrarToast('Error eliminando foto') }
  }

  function mostrarToast(msg) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }

  function setPeriodo(p) {
    sessionStorage.setItem('nc_supervisor_periodo', p)
    setPeriodoState(p)
  }

  function irSeccion(id) {
    sessionStorage.setItem('nc_supervisor_apartado', id)
    setSeccion(id)
    if (id === 'frases') cargarFrases()
  }

  // â”€â”€ Computed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const asesoresSala = useMemo(() =>
    asesores.filter(a => !salaActual || normalizarSala(a.sala) === normalizarSala(salaActual)),
  [asesores, salaActual])

  const todasVentas = useMemo(() => {
    if (!salaActual) return ventas
    const idsASala = new Set(asesoresSala.map(a => Number(a.id)))
    // v.sala ya resuelve la sala ATRIBUIDA de la venta (ver PATCH
    // /ventas/:id/sala-atribucion) — se confia en ella cuando existe. Antes
    // se aceptaba la venta con solo que el asesor perteneciera hoy a esta
    // sala, sin mirar v.sala: una venta que el asesor hizo para otra sala y
    // que luego volvio a la suya seguia contando (con instaladas y todo)
    // para la sala nueva en vez de la sala a la que se atribuyo, inflando
    // la cuota de un supervisor y quitandole la suya al otro. El fallback
    // por roster solo aplica cuando la venta no trae sala resuelta.
    return ventas.filter(v => {
      const sala = normalizarSala(v.sala)
      if (sala) return sala === normalizarSala(salaActual)
      return idsASala.has(Number(v.asesor_id))
    })
  }, [ventas, asesoresSala, salaActual])

  const dashVentas = useMemo(() => {
    const hoy = fechaHoy(), mes = mesActual()
    const lun = (() => { const d=new Date(),day=d.getDay(),diff=d.getDate()-day+(day===0?-6:1); return new Date(d.setDate(diff)).toISOString().split('T')[0] })()
    return todasVentas.filter(v => {
      const f = v._fecha || ''
      if (periodo==='dia')    return f===hoy
      if (periodo==='semana') return f>=lun && f<=hoy
      if (periodo==='mes')    return f.startsWith(mes)
      return true
    })
  }, [todasVentas, periodo])

  // Estados de la etapa de campo/instalación: su mes de reporte lo determina
  // la fecha PROGRAMADA, no la fecha de venta — una venta vendida en agosto
  // pero programada para septiembre debe aparecer en el reporte de septiembre
  // (mismo criterio que el Dashboard de Jefatura, ver cicloDashboardMes en
  // Jefatura.jsx). El resto de estados (Validado, No Validado, Grabado, etc.)
  // sigue contando por fecha de venta.
  const ESTADOS_POR_PROGRAMACION = ['en_ejecucion', 'instalado', 'caida', 'tecnico_casa', 'tecnicos_camino']
  const conteoPorProgramacion = useMemo(() => {
    const hoy = fechaHoy(), mes = mesActual()
    const lun = (() => { const d=new Date(),day=d.getDay(),diff=d.getDate()-day+(day===0?-6:1); return new Date(d.setDate(diff)).toISOString().split('T')[0] })()
    const conteo = Object.fromEntries(ESTADOS_POR_PROGRAMACION.map(id => [id, 0]))
    for (const v of todasVentas) {
      if (!ESTADOS_POR_PROGRAMACION.includes(v._estado)) continue
      const f = (v.fecha_programada || '').slice(0, 10)
      if (!f) continue
      const enPeriodo = periodo==='dia' ? f===hoy : periodo==='semana' ? (f>=lun && f<=hoy) : periodo==='mes' ? f.startsWith(mes) : true
      if (enPeriodo) conteo[v._estado]++
    }
    return conteo
  }, [todasVentas, periodo])

  const ventasTabla = useMemo(() => {
    let vv = [...todasVentas]
    if (filtroAsesor) vv = vv.filter(v=>v.asesor===filtroAsesor)
    if (filtroEstado) vv = vv.filter(v=>v._estado===filtroEstado)
    if (filtroFecha) vv = vv.filter(v=>v._fecha===filtroFecha)
    if (!filtroFecha&&!filtroAsesor&&!filtroEstado&&!tablaSearch)
      vv = vv.filter(v=>v._fecha&&v._fecha.startsWith(mesActual()))
    if (tablaSearch) {
      const q = tablaSearch.toLowerCase()
      vv = vv.filter(v=>v.n1?.includes(tablaSearch)||(v.asesor||'').toLowerCase().includes(q)||(v.nombre||'').toLowerCase().includes(q)||(v.dni||'').includes(tablaSearch))
    }
    return vv.sort((a,b)=>(b._fecha+b._hora).localeCompare(a._fecha+a._hora))
  }, [todasVentas, filtroAsesor, filtroEstado, filtroFecha, tablaSearch])

  // Sigue la fecha elegida en la tabla; sin fecha seleccionada representa hoy.
  // `cargarDatos` se ejecuta cada segundo, por lo que el valor se actualiza en
  // tiempo real cuando otro usuario registra una venta.
  const fechaContadorVentas = filtroFecha || fechaHoy()
  const ventasFechaSala = useMemo(
    () => todasVentas.filter(v => v._fecha === fechaContadorVentas).length,
    [todasVentas, fechaContadorVentas]
  )

  const ventasTotalPaginas = Math.max(1, Math.ceil(ventasTabla.length / ventasPorPagina))
  const ventasPaginaSegura = Math.min(ventasPagina, ventasTotalPaginas)
  const ventasPaginaData = ventasTabla.slice((ventasPaginaSegura-1)*ventasPorPagina, ventasPaginaSegura*ventasPorPagina)
  useEffect(() => { setVentasPagina(1) }, [filtroAsesor, filtroEstado, filtroFecha, tablaSearch])

  // Igual que conteoPorProgramacion: una instalada pertenece al mes de su
  // fecha PROGRAMADA, no al mes en que se vendió, si no el ranking del
  // supervisor no coincide con "Instaladas" del propio dashboard del asesor.
  // Usa el mismo criterio de "instalada" que Dashboard.jsx (esVentaInstalada)
  // y el reporte de Jefatura: estado ACTUAL instalado/instalado no
  // validado/reasignación. A diferencia de ventaAlcanzoInstalacion (usada en
  // las tarjetas históricas de este archivo), no cuenta ventas que llegaron a
  // instalarse pero cuyo estado actual ya cambió a caída — si no, este
  // ranking mensual no coincidiría con esos otros dos reportes.
  const instaladasPorAsesor = useMemo(() => {
    const hoy = fechaHoy(), mes = mesActual()
    const lun = (() => { const d=new Date(),day=d.getDay(),diff=d.getDate()-day+(day===0?-6:1); return new Date(d.setDate(diff)).toISOString().split('T')[0] })()
    const mapa = new Map()
    for (const v of todasVentas) {
      if (!['instalado','instalado_no_validado','reasignacion'].includes(v._estado)) continue
      const f = (v.fecha_programada || '').slice(0, 10)
      if (!f) continue
      const enPeriodo = periodo==='dia' ? f===hoy : periodo==='semana' ? (f>=lun && f<=hoy) : periodo==='mes' ? f.startsWith(mes) : true
      if (enPeriodo) mapa.set(v.asesor, (mapa.get(v.asesor)||0) + 1)
    }
    return mapa
  }, [todasVentas, periodo])

  const dashRendData = useMemo(() => {
    // Ademas del roster actual de la sala, incluye a cualquier asesor que ya
    // no esta en esta sala pero que tiene ventas o instaladas atribuidas
    // aqui este periodo (ver todasVentas) — si no, esas ventas suman en el
    // KPI general de la sala pero desaparecen del ranking por asesor.
    const nombresExtra = [...new Set([
      ...dashVentas.map(v=>v.asesor),
      ...instaladasPorAsesor.keys(),
    ])].filter(n => n && !asesoresSala.some(a=>a.nombre===n))
    const filas = [
      ...asesoresSala,
      ...nombresExtra.map(n => asesores.find(a=>a.nombre===n) || { nombre:n, usuario:'' }),
    ]
    return filas.map(a => {
      const mis = dashVentas.filter(v=>v.asesor===a.nombre)
      const inst = instaladasPorAsesor.get(a.nombre) || 0
      return { nombre:a.nombre, usuario:a.usuario||'', total:mis.length, inst, conv:mis.length?Math.round(inst/mis.length*100):0 }
    }).sort((a,b)=>b.total-a.total)
  }, [dashVentas, asesoresSala, asesores, instaladasPorAsesor])

  // â”€â”€ API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const cargandoDatosRef = useRef(false)
  const firmaAsesoresRef = useRef('')
  const firmaVentasRef = useRef('')
  const cargarDatos = useCallback(async () => {
    if (cargandoDatosRef.current) return  // evita polls solapados (respuestas fuera de orden que causan parpadeo)
    cargandoDatosRef.current = true
    try {
      const [rU, rV] = await Promise.all([
        fetch(`${API}/usuarios`, { headers: ncHeaders() }),
        fetch(`${API}/ventas?alcance=sala`, { headers: ncHeaders() }),
      ])
      const [dU, dV] = await Promise.all([rU.json(), rV.json()])
      if (dU.ok && responseChanged(firmaAsesoresRef, dU.data)) setAsesores(dU.data.filter(u=>usuarioTieneCargo(u,'asesor')&&u.activo))
      if (dV.ok && responseChanged(firmaVentasRef, dV.data)) setVentas(dV.data.map(v => ({
        ...v,
        asesor:   v.asesor_nombre || '',
        n1:       v.telefono1 || '',
        n2:       v.telefono2 || '',
        campana:  v.claro_hogar || v.paquete || '',
        distrito: v.distrito || '',
        _fecha:   (v.created_at||'').split(' ')[0],
        _hora:    (v.created_at||'').split(' ')[1] || '',
        _estado:  mapearEstado(v.estado, v.estado_supgrab || v.estado_grab, v.estado_grab, v.obs_validacion),
      })))
    } catch(e) { console.error(e) }
    finally { cargandoDatosRef.current = false }
  }, [])

  const cargarFrases = useCallback(async () => {
    try {
      const url = salaActual ? `${API}/frases?sala=${encodeURIComponent(salaActual)}` : `${API}/frases`
      const res  = await fetch(url, { headers: ncHeaders() })
      const data = await res.json()
      if (data.ok) {
        setFrases((data.data || []).map(f => ({ id:f.id, texto:f.texto, hora:(f.created_at||'').split(' ')[1]||'', sala:f.sala||salaActual })))
      }
    } catch(e) {}
  }, [salaActual])

  async function enviarFrase() {
    const texto = fraseTexto.trim()
    if (!texto) { mostrarToast('Escribe una frase primero'); return }
    try {
      const res  = await fetch(`${API}/frases`, { method:'POST', headers:ncHeaders(), body:JSON.stringify({ texto, sala:salaActual }) })
      const data = await res.json()
      if (data.ok) {
        setFraseTexto('')
        const hora = new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})
        setFrases(prev => [{ id:data.id, texto, hora, sala:salaActual }, ...prev])
      } else mostrarToast('Error: ' + data.mensaje)
    } catch(e) { mostrarToast('Error conectando') }
  }

  async function eliminarFrase(frase) {
    if (!frase?.id || fraseEliminandoId !== null) return
    if (!window.confirm('¿Eliminar esta frase publicada?')) return
    setFraseEliminandoId(frase.id)
    try {
      const res = await fetch(`${API}/frases/${frase.id}`, { method:'DELETE', headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo eliminar la frase')
      setFrases(prev => prev.filter(item => item.id !== frase.id))
      mostrarToast(data.mensaje || 'Frase eliminada')
    } catch(e) {
      mostrarToast(e.message || 'Error de conexión')
    } finally {
      setFraseEliminandoId(null)
    }
  }

  async function eliminarVenta(id) {
    if (!confirm('?Seguro que deseas eliminar esta venta?')) return
    try {
      const res  = await fetch(`${API}/ventas/${id}`, { method:'DELETE', headers:ncHeaders() })
      const data = await res.json()
      if (data.ok) { setVentas(prev=>prev.filter(v=>v.id!==id)) }
      else mostrarToast('Error: ' + (data.mensaje||'no se pudo eliminar'))
    } catch(e) { mostrarToast('Error de conexión') }
  }

  async function completarReasignacion(data) {
    await cargarDatos()
    setVentaReasignar(null)
  }

  async function agregarVentaManual() {
    if (!nvForm.n1.trim()) { mostrarToast('N1 es obligatorio'); return }
    if (!nvForm.asesor)    { mostrarToast('Asesor es obligatorio'); return }
    try {
      const res  = await fetch(`${API}/ventas`, {
        method:'POST', headers:ncHeaders(),
        body: JSON.stringify({ telefono1:nvForm.n1.trim(), telefono2:nvForm.n2.trim(), claro_hogar:nvForm.campana.trim(), asesor_nombre:nvForm.asesor, estado:nvForm.estado||'venta', observacion:nvForm.obs }),
      })
      const data = await res.json()
      if (data.ok) { await cargarDatos(); setPanelNV(false); setNvForm(NV_DEFAULT) }
      else mostrarToast('Error: ' + (data.mensaje||'no se pudo guardar'))
    } catch(e) { mostrarToast('Error de conexión') }
  }

  // â”€â”€ BL Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function abrirBaseLlamadas(nombre, asesorId) {
    setBlModal({ open:true, nombre, asesorId })
    setBlFecha(fechaHoy())
  }

  useEffect(() => {
    if (!blModal.open || blModal.asesorId == null) return
    setBlCargando(true); setBlLeads([])
    let url = `${API}/leads?asesor_id=${blModal.asesorId}`
    if (blFecha) url += `&fecha=${blFecha}`
    fetch(url, { headers: ncHeaders() })
      .then(r=>r.json())
      .then(data => { setBlLeads(data.ok ? data.data : null); setBlCargando(false) })
      .catch(() => { setBlLeads(null); setBlCargando(false) })
  }, [blFecha, blModal.open, blModal.asesorId])

  // â”€â”€ Charts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (seccion !== 'dashboard') return
    let cancelled = false
    const t = setTimeout(async () => {
      if (cancelled) return
      const { default: Chart } = await import('chart.js/auto')
      if (cancelled) return

      const destroyChart = (key) => { if(chartInst.current[key]){ chartInst.current[key].destroy(); delete chartInst.current[key] } }

      const nombres  = dashRendData.map(r=>r.nombre.split(' ')[0])
      const colores  = dashRendData.map(r=>colorFor(r.nombre))
      const dias7    = getUltimos7Dias()

      // ch1: Ventas por asesor (bar)
      destroyChart('ch1')
      if (ch1Ref.current) {
        chartInst.current.ch1 = new Chart(ch1Ref.current, {
          type:'bar',
          data:{ labels:nombres, datasets:[{ label:'Ventas', data:dashRendData.map(r=>r.total), backgroundColor:colores, borderRadius:6 }] },
          options:{ responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1}},x:{grid:{display:false}}} }
        })
      }

      // ch2: Distribuci?n por estado (doughnut)
      destroyChart('ch2')
      if (ch2Ref.current) {
        const ed = ESTADOS_VENTA.map(e=>({ label:e.label, cnt:dashVentas.filter(v=>v._estado===e.id).length, color:e.dot }))
        const edConDatos = ed.filter(e=>e.cnt>0)
        if (edConDatos.length) {
          chartInst.current.ch2 = new Chart(ch2Ref.current, {
            type:'doughnut',
            data:{ labels:edConDatos.map(e=>e.label), datasets:[{ data:edConDatos.map(e=>e.cnt), backgroundColor:edConDatos.map(e=>e.color), borderWidth:2, borderColor:'#fff', hoverOffset:8 }] },
            options:{
              responsive:true,maintainAspectRatio:false,cutout:'65%',
              plugins:{ legend:{ position:'right', labels:{ font:{size:11}, boxWidth:10, padding:10,
                generateLabels: function(chart){
                  return ed.map(e=>({ text:e.label+' ('+e.cnt+')', fillStyle:e.cnt>0?e.color:'#e5e7eb', strokeStyle:'#fff', fontColor:e.cnt>0?'#374151':'#9ca3af', hidden:false, index:edConDatos.findIndex(x=>x.label===e.label) }))
                }
              }}}
            }
          })
        } else {
          const ctx = ch2Ref.current.getContext('2d')
          ctx.clearRect(0,0,ch2Ref.current.width,ch2Ref.current.height)
          ctx.fillStyle='#f3f4f6'; ctx.beginPath(); ctx.arc(ctx.canvas.width/2,ctx.canvas.height/2,80,0,Math.PI*2); ctx.fill()
          ctx.fillStyle='#9ca3af'; ctx.font='12px DM Sans,sans-serif'; ctx.textAlign='center'
          ctx.fillText('Sin datos',ctx.canvas.width/2,ctx.canvas.height/2+4)
        }
      }

      // ch3: Ventas diarias ?ltimos 7 d?as (line)
      destroyChart('ch3')
      if (ch3Ref.current) {
        const datasets = asesoresSala.map(a=>({
          label: a.nombre.split(' ')[0],
          data: dias7.map(d=>todasVentas.filter(v=>v.asesor===a.nombre&&v._fecha===d).length),
          borderColor: colorFor(a.nombre), backgroundColor: colorFor(a.nombre)+'22',
          fill:true, tension:0.4, borderWidth:2, pointRadius:4,
        }))
        chartInst.current.ch3 = new Chart(ch3Ref.current, {
          type:'line',
          data:{ labels:dias7.map(d=>formatF(d)), datasets },
          options:{ responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{size:11},boxWidth:12}}},scales:{y:{beginAtZero:true,ticks:{stepSize:1}},x:{grid:{display:false}}} }
        })
      }

      // ch4: Conversi?n por asesor (horizontal bar)
      destroyChart('ch4')
      if (ch4Ref.current && dashRendData.length) {
        chartInst.current.ch4 = new Chart(ch4Ref.current, {
          type:'bar',
          data:{ labels:nombres, datasets:[{ label:'Conversión %', data:dashRendData.map(r=>r.conv), backgroundColor:colores.map(c=>c+'aa'), borderRadius:6 }] },
          options:{ indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}},y:{grid:{display:false}}} }
        })
      }
    }, 80)
    return () => { cancelled = true; clearTimeout(t) }
  }, [seccion, ventas, asesores, periodo])

  // Cleanup charts on unmount
  useEffect(() => {
    return () => { Object.values(chartInst.current).forEach(c=>c.destroy()) }
  }, [])

  // â”€â”€ Load & poll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    cargarDatos()
    if (seccion === 'frases') cargarFrases()
    const t = setVisibleInterval(cargarDatos, 1000)
    return () => clearVisibleInterval(t)
  }, [cargarDatos])

  // â”€â”€ Computed helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const cntEst = (id) => dashVentas.filter(v=>v._estado===id).length
  const periodoLabel = () => {
    if(periodo==='dia')return'hoy'; if(periodo==='semana')return'semana'
    if(periodo==='mes')return'mes actual'; return'histórico'
  }

  // â”€â”€ JSX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="sup-root">
      {/* TOPBAR */}
      <div className="topbar module-topbar-standard">
        <div className="topbar-brand">
          <div className="logo-circle">
            <img src="/assets/logo-futura.png" alt="NC" style={{width:26,height:26,objectFit:'contain'}} />
          </div>
          <div className="topbar-brand-text">
            <img src="/assets/futura-wordmark.png" alt="FUTURA" style={{height:22,width:"auto",display:"block"}} />
            <span className="brand-sub">Supervisor</span>
          </div>
          <button
            type="button"
            className={`sup-sidebar-toggle${sidebarAbierto ? ' abierto' : ''}`}
            aria-label={sidebarAbierto ? 'Ocultar men?' : 'Mostrar men?'}
            title={sidebarAbierto ? 'Ocultar men?' : 'Mostrar men?'}
            onClick={() => setSidebarAbierto(valor => {
              const nuevo = !valor
              sessionStorage.setItem('nc_supervisor_sidebar', nuevo ? 'abierto' : 'cerrado')
              return nuevo
            })}
          >
            <svg viewBox="0 0 18 18" aria-hidden="true"><rect x="2.5" y="2.5" width="13" height="13" rx="2.5"/><path d="M7 3v12"/></svg>
          </button>
        </div>
        <div className="topbar-right">
          <JefaturaViewControls>
            <span className="topbar-sala">{salaActual}</span>
            <span className="topbar-user">{supervisorNom}</span>
          </JefaturaViewControls>
          <CambiarAreaMenu />
          <button className="topbar-salir" onClick={()=>{ logout(); navigate('/') }}>Salir</button>
        </div>
      </div>

      <div className={`app-layout${sidebarAbierto ? '' : ' sidebar-cerrado'}`}>
        {/* SIDEBAR */}
        <aside className={`sidebar${sidebarAbierto ? '' : ' cerrado'}`} aria-hidden={!sidebarAbierto}>
          <div className="sidebar-sep">Mi Sala</div>
          <button className={`nav-btn${seccion==='dashboard'?' active':''}`} onClick={()=>irSeccion('dashboard')}><span className="nav-dot" /> Dashboard</button>
          <button className={`nav-btn${seccion==='ventas'?' active':''}`} onClick={()=>irSeccion('ventas')}><span className="nav-dot" /> Ventas</button>
          <button className={`nav-btn${seccion==='equipo'?' active':''}`} onClick={()=>irSeccion('equipo')}><span className="nav-dot" /> Mi Equipo</button>
          <div className="sidebar-sep">ANÁLISIS</div>
          <button className={`nav-btn${seccion==='rendimiento'?' active':''}`} onClick={()=>irSeccion('rendimiento')}><span className="nav-dot" /> Rendimiento</button>
          <div className="sidebar-sep">COMUNICACIÓN</div>
          <button className={`nav-btn${seccion==='frases'?' active':''}`} onClick={()=>irSeccion('frases')}><span className="nav-dot" /> Frases del día</button>
        </aside>

        <main className="main">

          {/* â•â• DASHBOARD â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <section className={`section${seccion==='dashboard'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Dashboard</h2><p>Resumen general de tu sala</p></div>
              <div className="periodo-tabs">
                {[['dia','Hoy'],['semana','Semana'],['mes','Mes actual'],['global','Global']].map(([p,l])=>(
                  <button key={p} className={`periodo-btn${periodo===p?' active':''}`} onClick={()=>setPeriodo(p)}>{l}</button>
                ))}
              </div>
            </div>

            {/* KPIs */}
            <div className="kpi-grid">
              {[
                { label:'Total ventas',   val:dashVentas.length,       cls:'k-blue',   sub:periodoLabel() },
                { label:'Validadas',      val:cntEst('validado'),       cls:'k-purple', sub:'pasaron validación' },
                { label:'No Validadas',   val:cntEst('no_validado'),    cls:'k-red',    sub:'rechazadas' },
                { label:'Grabadas',       val:cntEst('grabado'),        cls:'k-orange', sub:'con audio' },
                { label:'En Ejecución',   val:conteoPorProgramacion.en_ejecucion, cls:'k-teal',   sub:'programadas' },
                { label:'Instaladas',     val:conteoPorProgramacion.instalado,    cls:'k-green',  sub:'completadas' },
                { label:'Caídas',         val:conteoPorProgramacion.caida,        cls:'k-red',    sub:'fallidas' },
                { label:'Asesores',       val:asesoresSala.length,      cls:'k-blue',   sub:salaActual },
              ].map(k=>(
                <div key={k.label} className={`kpi-card ${k.cls}`}>
                  <div className="kpi-label">{k.label}</div>
                  <div className="kpi-value">{k.val}</div>
                  <div className="kpi-sub">{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Estados chips */}
            <div className="estados-grid">
              {ESTADOS_VENTA.map(e=>(
                <div key={e.id} className="estado-chip">
                  <div className="chip-dot" style={{background:e.dot}} />
                  <span>{e.label}</span>
                  <span className="chip-num" style={{color:e.dot}}>{ESTADOS_POR_PROGRAMACION.includes(e.id) ? conteoPorProgramacion[e.id] : dashVentas.filter(v=>v._estado===e.id).length}</span>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="charts-grid">
              <div className="chart-card"><div className="chart-title">Ventas por asesor</div><div className="chart-wrap"><canvas ref={ch1Ref} /></div></div>
              <div className="chart-card"><div className="chart-title">Distribución por estado</div><div className="chart-wrap"><canvas ref={ch2Ref} /></div></div>
              <div className="chart-card"><div className="chart-title">Ventas diarias — últimos 7 días</div><div className="chart-wrap"><canvas ref={ch3Ref} /></div></div>
              <div className="chart-card"><div className="chart-title">Conversión por asesor (%)</div><div className="chart-wrap"><canvas ref={ch4Ref} /></div></div>
            </div>

            {/* Ranking */}
            <div className="tabla-wrap">
              <div className="tabla-header"><span className="tabla-title">Ranking de asesores</span></div>
              <table className="tabla">
                <thead><tr><th>#</th><th>Asesor</th><th>Total ventas</th><th>Instaladas</th><th>Avance</th></tr></thead>
                <tbody>
                  {dashRendData.length === 0
                    ? <tr className="tabla-empty"><td colSpan={5}>Sin asesores en {salaActual}</td></tr>
                    : dashRendData.map((r,i)=>(
                        <tr key={r.nombre}>
                          <td><div className={`pos-badge${i<3?' '+['p1','p2','p3'][i]:''}`}>{i+1}</div></td>
                          <td><div className="asesor-cell"><div className="av-circle" style={{background:colorFor(r.nombre)}}>{iniciales(r.nombre)}</div><div><div style={{fontWeight:700,fontSize:12}}>{r.nombre}</div><div style={{fontSize:10,color:'#9ca3af'}}>{r.usuario}</div></div></div></td>
                          <td style={{fontWeight:700}}>{r.total}</td>
                          <td style={{color:'#16a34a',fontWeight:700}}>{r.inst}</td>
                          <td><div className="bar-mini-wrap"><div className="bar-mini"><div className="bar-mini-fill" style={{width:`${r.conv}%`}} /></div><span style={{fontSize:11,color:'#9ca3af'}}>{r.conv}%</span></div></td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>

          </section>

          {/* â•â• VENTAS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <section className={`section${seccion==='ventas'?' active':''}`}>
            <div className="sec-header">
              <div><h2>Ventas de mi Sala</h2><p>Mes actual por defecto ? usa filtros para ver otros periodos</p></div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <div aria-label={`${ventasFechaSala} ventas registradas el ${formatF(fechaContadorVentas)}`} style={{display:'flex',alignItems:'center',gap:10,background:'#fff',border:'1px solid #fecaca',borderRadius:12,padding:'8px 14px',boxShadow:'0 4px 14px rgba(220,38,38,.08)'}}>
                  <span style={{fontSize:11,fontWeight:800,color:'#991b1b',textTransform:'uppercase',letterSpacing:.5}}>{filtroFecha ? `Ventas del ${formatF(filtroFecha)}` : 'Ventas de hoy'}</span>
                  <strong style={{minWidth:30,textAlign:'center',fontSize:18,lineHeight:1,color:'#fff',background:'#dc2626',borderRadius:9,padding:'7px 9px'}}>{ventasFechaSala}</strong>
                </div>
              </div>
            </div>

            {/* Panel agregar venta */}
            {panelNV && (
              <div style={{background:'#fff',border:'1.5px dashed #e5e7eb',borderRadius:14,padding:'18px 20px',marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#ff2d2d',textTransform:'uppercase',letterSpacing:.7,marginBottom:14}}>+ Registrar nueva venta</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10,marginBottom:12}}>
                  <div className="filtro-group"><label>N1 *</label><input className="filtro-input" value={nvForm.n1} onChange={e=>setNvForm(p=>({...p,n1:e.target.value}))} placeholder="Número principal" style={{fontFamily:'monospace'}} /></div>
                  <div className="filtro-group"><label>N2</label><input className="filtro-input" value={nvForm.n2} onChange={e=>setNvForm(p=>({...p,n2:e.target.value}))} placeholder="Secundario" style={{fontFamily:'monospace'}} /></div>
                  <div className="filtro-group"><label>Campaña</label><input className="filtro-input" value={nvForm.campana} onChange={e=>setNvForm(p=>({...p,campana:e.target.value}))} placeholder="Ej: NKT" /></div>
                  <div className="filtro-group"><label>Asesor *</label>
                    <select className="filtro-select" value={nvForm.asesor} onChange={e=>setNvForm(p=>({...p,asesor:e.target.value}))}>
                      <option value="">? Asesor ?</option>
                      {asesoresSala.map(a=><option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                    </select>
                  </div>
                  <div className="filtro-group"><label>Estado *</label>
                    <select className="filtro-select" value={nvForm.estado} onChange={e=>setNvForm(p=>({...p,estado:e.target.value}))}>
                      <option value="">? Estado ?</option>
                      {ESTADOS_VENTA.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}
                    </select>
                  </div>
                  <div className="filtro-group"><label>Fecha</label><input type="date" className="filtro-input" value={nvForm.fecha} onChange={e=>setNvForm(p=>({...p,fecha:e.target.value}))} /></div>
                </div>
                <div className="filtro-group" style={{marginBottom:12}}><label>Observación</label><input className="filtro-input" value={nvForm.obs} onChange={e=>setNvForm(p=>({...p,obs:e.target.value}))} placeholder="Notas adicionales..." /></div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                  <button className="btn-limpiar" onClick={()=>setPanelNV(false)}>Cancelar</button>
                  <button className="btn-filtrar" onClick={agregarVentaManual}>Guardar venta</button>
                </div>
              </div>
            )}

            {/* Filtros */}
            <div className="filtros-panel">
              <div className="filtros-row">
                <div className="filtro-group"><label>Asesor</label>
                  <select className="filtro-select" value={filtroAsesor} onChange={e=>setFiltroAsesor(e.target.value)}>
                    <option value="">Todos</option>
                    {asesoresSala.map(a=><option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                  </select>
                </div>
                <div className="filtro-group"><label>Estado de venta</label>
                  <select className="filtro-select" value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}>
                    <option value="">Todos</option>
                    {ESTADOS_VENTA.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </div>
                <div className="filtro-group"><label>Fecha</label><input type="date" className="filtro-input" value={filtroFecha} onChange={e=>setFiltroFecha(e.target.value)} /></div>
                <div className="filtros-acciones"><button className="btn-limpiar" onClick={()=>{ setFiltroAsesor(''); setFiltroEstado(''); setFiltroFecha(''); setTablaSearch('') }}>Limpiar</button></div>
              </div>
            </div>

            {/* Tabla ventas */}
            <div className="tabla-wrap">
              <div className="tabla-header">
                <span className="tabla-title">Lista de ventas</span>
                <span className="tabla-count">{ventasTabla.length} registros</span>
                <input type="text" className="tabla-search" value={tablaSearch} onChange={e=>setTablaSearch(e.target.value)} placeholder="Buscar por N1, asesor..." />
              </div>
              <div className="tabla-scroll tabla-scroll-ventas">
              <table className="tabla tabla-sup-ventas" style={{minWidth:2250}}>
                <thead><tr><th>#</th><th>Estado actual</th><th>Canal</th><th>Validación</th><th>Grabación</th><th>Programación</th><th>Obs. Seguimiento</th><th>Obs. Validación</th><th>Fecha Programada</th><th>Fecha</th><th>Nombre</th><th>DNI</th><th>N1</th><th>N2</th><th>Depto.</th><th>Distrito</th><th>Paquete</th><th>Asesor</th><th>Hora</th><th>Obs.</th><th>Acción</th></tr></thead>
                <tbody>
                  {ventasTabla.length === 0
                    ? <tr className="tabla-empty"><td colSpan={21}>Sin ventas con esos filtros.</td></tr>
                    : ventasPaginaData.map((v,i)=>(
                        <tr key={v.id}>
                          <td style={{color:'#9ca3af',fontSize:10}}>{(ventasPaginaSegura-1)*ventasPorPagina+i+1}</td>
                          <td><BadgeEstado id={mapearEstado(v.estado)} /></td>
                          <td><CanalBadge canal={v.canal} /></td>
                          <td><span className={`sup-flujo-badge ${claseFlujo(estadoValidacionFlujo(v))}`}>{estadoValidacionFlujo(v)}</span></td>
                          <td><span className={`sup-flujo-badge ${claseFlujo(v.estado_grab)}`}>{etiquetaFlujo(v.estado_grab)}</span></td>
                          <td><span className={`sup-flujo-badge ${claseFlujo(v.estado_prog)}`}>{etiquetaFlujo(v.estado_prog)}</span></td>
                          <td><ObsSeguimientoCell
                            tramo={(v.estado_supgrab||'').toLowerCase()==='conforme' ? v.tramo_seguimiento : ''}
                            comentario={(v.estado_supgrab||'').toLowerCase()==='conforme' ? v.obs_seguimiento : ''}
                            motivo={(v.estado_supgrab||'').toLowerCase()==='conforme' ? v.motivo_seguimiento : ''}
                          /></td>
                          <td
                            role="button"
                            tabIndex={0}
                            onClick={()=>{ const mensaje=getObsValidacion(v.obs_validacion); if(mensaje!=='—') setObsValidacionDetalle(mensaje) }}
                            onKeyDown={e=>{ if((e.key==='Enter'||e.key===' ') && getObsValidacion(v.obs_validacion)!=='—') setObsValidacionDetalle(getObsValidacion(v.obs_validacion)) }}
                            style={{fontSize:11,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:getObsValidacion(v.obs_validacion)==='—'?'default':'pointer',color:getObsValidacion(v.obs_validacion)==='—'?'#9ca3af':'#374151'}}
                            title={getObsValidacion(v.obs_validacion)==='—'?'':'Presiona para ver el mensaje completo'}
                          >{getObsValidacion(v.obs_validacion)}</td>
                          <td><ProgramacionInfoCell fecha={(v.estado_supgrab||'').toLowerCase()==='conforme' ? v.fecha_programada : ''} soloFecha /></td>
                          <td style={{fontWeight:700,color:'#185FA5',fontSize:11}}>{formatF(v._fecha)}</td>
                          <td style={{fontWeight:600,minWidth:140}}>{v.nombre||'—'}</td>
                          <td style={{fontFamily:'monospace',fontSize:11}}>{v.dni||'—'}</td>
                          <td style={{fontFamily:'monospace',fontWeight:700,color:'#111827'}}>{v.n1||'—'}</td>
                          <td style={{fontFamily:'monospace',color:'#6b7280'}}>{v.n2||'—'}</td>
                          <td style={{fontSize:11}}>{v.departamento||'—'}</td>
                          <td style={{fontSize:11}}>{v.distrito||'—'}</td>
                          <td style={{fontSize:11,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis'}}>{v.paquete||'—'}</td>
                          <td>
                            <div className="asesor-cell">
                              <div className="av-circle" style={{background:colorFor(v.asesor||'X'),width:24,height:24,fontSize:9}}>{iniciales(v.asesor||'?')}</div>
                              <span style={{fontSize:11,fontWeight:600}} title={v.asesor||''}>{primerNombre(v.asesor)||'—'}</span>
                            </div>
                          </td>
                          <td style={{fontSize:11,color:'#6b7280'}}>{v._hora||'—'}</td>
                          <td style={{fontSize:11,color:'#6b7280',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis'}}>{v.observacion||v.obs_backoffice||'—'}</td>
                          <td>
                            <div className="venta-actions">
                              <button type="button" className="btn-fotos" onClick={()=>abrirFotos(v)}>Fotos</button>
                              <button type="button" className="venta-action-btn" onClick={()=>setVentaEditar(v)}>Editar</button>
                              <button type="button" className="venta-action-btn reassign" onClick={()=>setVentaReasignar(v)}>Reasignar</button>
                              <button type="button" className="venta-action-btn delete" onClick={()=>eliminarVenta(v.id)}>Eliminar</button>
                            </div>
                          </td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
              </div>
              {ventasTabla.length > 0 && (
                <div className="paginacion">
                  <span className="pag-info">
                    Mostrando {(ventasPaginaSegura-1)*ventasPorPagina+1}–{Math.min(ventasPaginaSegura*ventasPorPagina,ventasTabla.length)} de {ventasTabla.length} · orden por día (más reciente primero)
                  </span>
                  <div className="pag-btns">
                    <button className="pag-btn" disabled={ventasPaginaSegura===1} onClick={()=>setVentasPagina(p=>Math.max(1,p-1))}>‹</button>
                    {Array.from({length:ventasTotalPaginas},(_,i)=>i+1).filter(p=>p===1||p===ventasTotalPaginas||Math.abs(p-ventasPaginaSegura)<=1).map((p,i,arr)=><Fragment key={p}>{i>0&&p-arr[i-1]>1?<span className="pag-info">…</span>:null}<button className={`pag-btn${p===ventasPaginaSegura?' active':''}`} onClick={()=>setVentasPagina(p)}>{p}</button></Fragment>)}
                    <button className="pag-btn" disabled={ventasPaginaSegura===ventasTotalPaginas} onClick={()=>setVentasPagina(p=>Math.min(ventasTotalPaginas,p+1))}>›</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* â•â• MI EQUIPO â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <section className={`section${seccion==='equipo'?' active':''}`}>

            {/* Header */}
            <div className="sec-header">
              <div>
                <h2>Mi Equipo</h2>
                <p>Resumen de asesores y rendimiento de {salaActual}</p>
              </div>
              <div className="eq-filters">
                <input
                  type="text"
                  value={equipoBuscar}
                  onChange={e=>setEquipoBuscar(e.target.value)}
                  placeholder="Buscar asesor..."
                  className="eq-search-input"
                />
                <select
                  value={equipoFiltroEstado}
                  onChange={e=>setEquipoFiltroEstado(e.target.value)}
                  className="eq-filter-select"
                >
                  <option value="">Todos</option>
                  <option value="1">Activos</option>
                  <option value="0">Inactivos</option>
                </select>
              </div>
            </div>

            {/* KPIs equipo */}
            <div className="eq-kpi-grid">
              <div className="kpi-card k-blue">
                <div className="kpi-label">Total asesores</div>
                <div className="kpi-value">{asesoresSala.length}</div>
                <div className="kpi-sub">{salaActual}</div>
              </div>
              <div className="kpi-card k-green">
                <div className="kpi-label">Activos</div>
                <div className="kpi-value">{asesoresSala.filter(a=>a.activo).length}</div>
                <div className="kpi-sub">en servicio</div>
              </div>
              <div className="kpi-card k-red">
                <div className="kpi-label">Inactivos</div>
                <div className="kpi-value">{asesoresSala.filter(a=>!a.activo).length}</div>
                <div className="kpi-sub">desactivados</div>
              </div>
              <div className="kpi-card k-purple">
                <div className="kpi-label">Ventas hoy</div>
                <div className="kpi-value">{todasVentas.filter(v=>v._fecha===fechaHoy()).length}</div>
                <div className="kpi-sub">de tu sala</div>
              </div>
            </div>

            {/* Cards de asesores */}
            {(() => {
              const hoy = fechaHoy()
              const lista = asesoresSala.filter(a => {
                const mb = !equipoBuscar || a.nombre.toLowerCase().includes(equipoBuscar.toLowerCase()) || (a.usuario||'').toLowerCase().includes(equipoBuscar.toLowerCase())
                const me = equipoFiltroEstado==='' || String(a.activo?1:0)===equipoFiltroEstado
                return mb && me
              })
              if (!lista.length) return <div style={{textAlign:'center',padding:40,color:'#9ca3af'}}>Sin asesores.</div>
              return (
                <div className="eq-cards-grid">
                  {lista.map(a => {
                    const mis  = todasVentas.filter(v=>v.asesor===a.nombre)
                    const hoyV = mis.filter(v=>v._fecha===hoy).length
                    const mesV = mis.filter(v=>v._fecha&&v._fecha.startsWith(mesActual())).length
                    const inst = mis.filter(ventaAlcanzoInstalacion).length
                    const conv = mis.length?Math.round(inst/mis.length*100):0
                    return (
                      <div key={a.id} className="eq-card">

                        {/* A. Cabecera */}
                        <div className="eq-card-header">
                          <div
                            className="eq-avatar"
                            style={{background:colorFor(a.nombre)}}
                            aria-label={`Avatar de ${a.nombre}`}
                          >
                            {iniciales(a.nombre)}
                          </div>
                          <div className="eq-name-block">
                            <div className="eq-name" title={a.nombre}>{a.nombre}</div>
                            <div className="eq-username">@{a.usuario||'?'}</div>
                          </div>
                          <span className={`eq-badge-activo${a.activo?' activo':' inactivo'}`}>
                            {a.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>

                        {/* B. M?tricas */}
                        <div className="eq-metrics">
                          {[
                            ['HOY',   hoyV,       '#374151'],
                            ['MES',   mesV,       '#2563eb'],
                            ['INST.', inst,       '#16a34a'],
                            ['CONV.', `${conv}%`, '#7c3aed'],
                          ].map(([label, value, color]) => (
                            <div key={label} className="eq-metric">
                              <div className="eq-metric-label">{label}</div>
                              <div className="eq-metric-value" style={{color}}>{value}</div>
                            </div>
                          ))}
                        </div>

                        {/* C. Footer */}
                        <div className="eq-card-footer">
                          <span className="eq-sala-badge" title={a.sala||'?'}>{a.sala||'?'}</span>
                          <div className="eq-btns">
                            <button
                              type="button"
                              className="eq-btn-base"
                              onClick={()=>abrirBaseLlamadas(a.nombre,a.id)}
                            >
                              Base llamadas
                            </button>
                            <button
                              type="button"
                              className="eq-btn-detalle"
                              onClick={()=>setModalAsesor({open:true,nombre:a.nombre})}
                            >
                              Ver detalle
                            </button>
                          </div>
                        </div>

                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </section>

          {/* â•â• RENDIMIENTO â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <section className={`section${seccion==='rendimiento'?' active':''}`}>
            <div className="sec-header"><div><h2>Rendimiento de Asesores</h2><p>Productividad individual y comparativo mensual</p></div></div>
            <div className="asesores-cards">
              {asesoresSala.length === 0
                ? <div style={{textAlign:'center',color:'#9ca3af',padding:40,gridColumn:'1/-1'}}>Sin asesores en {salaActual}.</div>
                : asesoresSala.map(a=>{
                    const mis    = todasVentas.filter(v=>v.asesor===a.nombre)
                    const inst   = mis.filter(ventaAlcanzoInstalacion).length
                    const noVal  = mis.filter(v=>v._estado==='no_validado').length
                    const caida  = mis.filter(v=>['caida','rechazo_campo'].includes(v._estado)).length
                    const conv   = mis.length?Math.round(inst/mis.length*100):0
                    return (
                      <div key={a.id} className="asesor-card">
                        <div className="ac-avatar" style={{background:colorFor(a.nombre)}}>{iniciales(a.nombre)}</div>
                        <div className="ac-nombre">{a.nombre}</div>
                        <div className="ac-sala">{a.sala} - {a.usuario||''}</div>
                        <div className="ac-stats">
                          <div className="ac-stat"><div className="ac-stat-num">{mis.length}</div><div className="ac-stat-label">Total</div></div>
                          <div className="ac-stat"><div className="ac-stat-num" style={{color:'#16a34a'}}>{inst}</div><div className="ac-stat-label">Inst.</div></div>
                          <div className="ac-stat"><div className="ac-stat-num" style={{color:'#dc2626'}}>{noVal}</div><div className="ac-stat-label">No Val.</div></div>
                          <div className="ac-stat"><div className="ac-stat-num" style={{color:'#b91c1c'}}>{caida}</div><div className="ac-stat-label">Caídas</div></div>
                        </div>
                        <div className="ac-conv"><span className="ac-conv-label">Conversión (inst.)</span><span className="ac-conv-val">{conv}%</span></div>
                      </div>
                    )
                  })
              }
            </div>

            {/* Comparativo mensual instaladas */}
            <div className="tabla-wrap">
              <div className="tabla-header"><span className="tabla-title">Comparativo mensual por asesor</span></div>
              <table className="tabla">
                <thead><tr>
                  <th>#</th><th>Asesor</th>
                  {[0,1,2].map(o=><th key={o}>{getMesLabel(o)} (instaladas)</th>)}
                  <th>Total histórico</th>
                </tr></thead>
                <tbody>
                  {asesoresSala.length === 0
                    ? <tr className="tabla-empty"><td colSpan={6}>Sin datos</td></tr>
                    : asesoresSala.map((a,i)=>{
                        const meses = [0,1,2].map(o=>todasVentas.filter(v=>v.asesor===a.nombre&&ventaAlcanzoInstalacion(v)&&v._fecha&&v._fecha.startsWith(getMesClave(o))).length)
                        const total = meses.reduce((s,v)=>s+v,0)
                        return (
                          <tr key={a.id}>
                            <td><div className={`pos-badge${i<3?' '+['p1','p2','p3'][i]:''}`}>{i+1}</div></td>
                            <td><div className="asesor-cell"><div className="av-circle" style={{background:colorFor(a.nombre)}}>{iniciales(a.nombre)}</div><div><div style={{fontWeight:700,fontSize:12}}>{a.nombre}</div><div style={{fontSize:10,color:'#9ca3af'}}>{a.usuario}</div></div></div></td>
                            {meses.map((cnt,mi)=><td key={mi} style={{fontWeight:mi===0?800:400,color:mi===0?'#111827':'#6b7280'}}>{cnt}</td>)}
                            <td style={{fontWeight:800,color:'#16a34a'}}>{total}</td>
                          </tr>
                        )
                      })
                  }
                </tbody>
              </table>
            </div>

            {/* Ventas con problemas */}
            {(() => {
              const problemas = todasVentas.filter(v=>['no_validado','caida','rechazo_campo'].includes(v._estado))
              return (
                <div className="tabla-wrap" style={{marginTop:16}}>
                  <div className="tabla-header">
                    <span className="tabla-title">Ventas con problemas — No validadas · Caídas</span>
                    <span className="tabla-count">{problemas.length} registros</span>
                  </div>
                  <table className="tabla">
                    <thead><tr><th>Fecha</th><th>Nombre</th><th>DNI</th><th>N1</th><th>Asesor</th><th>Estado</th><th>Motivo / Obs.</th></tr></thead>
                    <tbody>
                      {problemas.length === 0
                        ? <tr className="tabla-empty"><td colSpan={7}>Sin ventas con problemas</td></tr>
                        : problemas.map((v,i)=>(
                            <tr key={v.id||i}>
                              <td style={{fontSize:11,color:'#185FA5',fontWeight:700}}>{formatF(v._fecha)}</td>
                              <td style={{fontWeight:600}}>{v.nombre||'—'}</td>
                              <td style={{fontFamily:'monospace',fontSize:11}}>{v.dni||'—'}</td>
                              <td style={{fontFamily:'monospace',fontWeight:700}}>{v.n1||'—'}</td>
                              <td><div className="asesor-cell"><div className="av-circle" style={{background:colorFor(v.asesor||'X'),width:22,height:22,fontSize:9}}>{iniciales(v.asesor||'?')}</div><span style={{fontSize:11}} title={v.asesor||''}>{primerNombre(v.asesor)||'—'}</span></div></td>
                              <td><BadgeEstado id={v._estado} grabandoPorNombre={v.grabando_por_nombre} fraudeProgramacion={(v.estado_supgrab||'').toLowerCase()==='aprobado'} /></td>
                              <td style={{fontSize:11,color:'#6b7280'}}>{v.obs_validacion||v.obs_backoffice||v.observacion||'—'}</td>
                            </tr>
                          ))
                      }
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </section>

          {/* â•â• FRASES â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
          <section className={`section${seccion==='frases'?' active':''}`}>
            <div className="sec-header"><div><h2>Frases del Día</h2><p>Envía mensajes motivacionales a tu equipo</p></div></div>
            <div className="frases-layout">
              <div>
                <div className="frases-panel">
                  <div className="panel-title">Redactar mensaje</div>
                  <div className="frase-compose">
                    <textarea value={fraseTexto} onChange={e=>setFraseTexto(e.target.value)} placeholder="Escribe tu mensaje motivacional..." />
                    <div className="frase-compose-actions">
                      <button className="btn-enviar" onClick={enviarFrase}>Publicar</button>
                      <button className="btn-limpiar-f" onClick={()=>setFraseTexto('')}>Limpiar</button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="frases-panel">
                <div className="panel-title">
                  Publicadas hoy&nbsp;
                  <span style={{background:'#f3f4f6',color:'#6b7280',fontSize:10,padding:'2px 8px',borderRadius:99,fontWeight:700}}>{frases.length}</span>
                </div>
                <div>
                  {frases.length === 0
                    ? <div className="frase-vacia">Aún no publicaste ninguna frase.</div>
                    : frases.map((f,i)=>(
                        <div key={f.id || i} className="frase-item">
                          <div className="frase-item-head">
                            <div className="frase-item-texto">"{f.texto}"</div>
                            <button
                              type="button"
                              className="frase-eliminar-btn"
                              disabled={fraseEliminandoId !== null}
                              onClick={()=>eliminarFrase(f)}
                            >
                              {fraseEliminandoId === f.id ? 'Eliminando...' : 'Eliminar'}
                            </button>
                          </div>
                          <div className="frase-item-meta">{f.sala} · {f.hora}</div>
                        </div>
                      ))
                  }
                </div>
              </div>
            </div>
          </section>

        </main>
      </div>

      {/* â•â• MODAL DETALLE ASESOR â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {modalAsesor.open && (() => {
        const a    = asesoresSala.find(x=>x.nombre===modalAsesor.nombre)
        if (!a) return null
        const mis  = todasVentas.filter(v=>v.asesor===a.nombre)
        const hoyV = mis.filter(v=>v._fecha===fechaHoy()).length
        const mesV = mis.filter(v=>v._fecha&&v._fecha.startsWith(mesActual())).length
        const inst = mis.filter(ventaAlcanzoInstalacion).length
        const conv = mis.length?Math.round(inst/mis.length*100):0
        const ult5 = [...mis].sort((a,b)=>b._fecha.localeCompare(a._fecha)).slice(0,5)
        return (
          <div style={{display:'flex',position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:500,alignItems:'center',justifyContent:'center'}} onClick={e=>{if(e.target===e.currentTarget)setModalAsesor({open:false,nombre:''})}}>
            <div style={{background:'#fff',borderRadius:18,width:'min(500px,94vw)',maxHeight:'90vh',overflowY:'auto',boxShadow:'0 24px 60px rgba(0,0,0,.2)'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 22px 14px',borderBottom:'1px solid #f3f4f6'}}>
                <span style={{fontSize:14,fontWeight:800,color:'#111827',textTransform:'uppercase',letterSpacing:.4}}>Detalle del Asesor</span>
                <button onClick={()=>setModalAsesor({open:false,nombre:''})} aria-label="Cerrar" style={{width:28,height:28,border:'none',borderRadius:7,background:'#f3f4f6',color:'#6b7280',fontSize:14,cursor:'pointer',fontWeight:700}}>×</button>
              </div>
              <div style={{padding:'20px 22px'}}>
                <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:18}}>
                  <div style={{width:60,height:60,borderRadius:'50%',background:colorFor(a.nombre),display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:700,color:'#fff'}}>{iniciales(a.nombre)}</div>
                  <div><div style={{fontSize:16,fontWeight:800}}>{a.nombre}</div><div style={{fontSize:12,color:'#9ca3af'}}>@{a.usuario||'—'} · {a.sala||'—'}</div></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:18}}>
                  {[['Hoy',hoyV,'#111827'],['Este mes',mesV,'#2563eb'],['Instaladas',inst,'#16a34a'],['Conv.',conv+'%','#7c3aed']].map(([l,v,c])=>(
                    <div key={l} style={{background:'#f9fafb',borderRadius:10,padding:12,textAlign:'center'}}>
                      <div style={{fontSize:22,fontWeight:800,color:c}}>{v}</div>
                      <div style={{fontSize:10,color:'#9ca3af',textTransform:'uppercase',marginTop:3}}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:12,fontWeight:700,color:'#374151',marginBottom:8,textTransform:'uppercase',letterSpacing:.3}}>Últimas 5 ventas</div>
                {ult5.length === 0
                  ? <div style={{textAlign:'center',padding:20,color:'#9ca3af'}}>Sin ventas.</div>
                  : <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {ult5.map((v,i)=>(
                        <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',background:'#f9fafb',borderRadius:8}}>
                          <div><span style={{fontFamily:'monospace',fontWeight:700,fontSize:12}}>{v.n1}</span><span style={{fontSize:11,color:'#9ca3af',marginLeft:8}}>{v.campana||'—'}</span></div>
                          <div style={{display:'flex',alignItems:'center',gap:8}}><BadgeEstado id={v._estado} grabandoPorNombre={v.grabando_por_nombre} fraudeProgramacion={(v.estado_supgrab||'').toLowerCase()==='aprobado'} /><span style={{fontSize:11,color:'#9ca3af'}}>{formatF(v._fecha)}</span></div>
                        </div>
                      ))}
                    </div>
                }
              </div>
            </div>
          </div>
        )
      })()}

      {/* â•â• MODAL BASE DE LLAMADAS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {blModal.open && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:9000,display:'flex',alignItems:'center',justifyContent:'center',padding:16,backdropFilter:'blur(4px)'}} onClick={e=>{if(e.target===e.currentTarget)setBlModal(p=>({...p,open:false}))}}>
          <div style={{background:'#fff',borderRadius:18,width:'100%',maxWidth:960,maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
            <div style={{padding:'18px 24px 14px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:'#111827'}}>Base de llamadas — {blModal.nombre}</div>
                <div style={{fontSize:12,color:'#9ca3af',marginTop:2}}>Solo lectura · Supervisor</div>
              </div>
              <button onClick={()=>setBlModal(p=>({...p,open:false}))} aria-label="Cerrar" style={{width:32,height:32,borderRadius:'50%',border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:18,cursor:'pointer'}}>×</button>
            </div>
            <div style={{padding:'10px 24px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <label style={{fontSize:12,fontWeight:600}}>Fecha:</label>
              <input type="date" value={blFecha} onChange={e=>setBlFecha(e.target.value)} style={{padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:12,fontFamily:'inherit'}} />
              <button onClick={()=>setBlFecha(fechaHoy())} style={{padding:'6px 12px',border:'1px solid #e5e7eb',borderRadius:8,background:'#f9fafb',fontSize:11,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>Hoy</button>
              <span style={{fontSize:12,color:'#9ca3af',marginLeft:'auto'}}>{blLeads?.length ?? 0} registros</span>
            </div>
            {blLeads && blLeads.length > 0 && (
              <div style={{padding:'10px 24px',display:'flex',gap:10,flexWrap:'wrap',borderBottom:'1px solid #f3f4f6'}}>
                {[{l:'Leads',v:blLeads.length,c:'#2563eb'},{l:'Tipificados',v:blLeads.filter(l=>(l.tipif_vend||'').trim()!=='').length,c:'#16a34a'},{l:'VENTA CERRADA',v:blLeads.filter(l=>(l.tipif_vend||'').toUpperCase()==='VENTA CERRADA').length,c:'#7c3aed'},{l:'NC/Buzón',v:blLeads.filter(l=>['NO CONTESTA','BUZON DE VOZ'].includes((l.tipif_vend||'').toUpperCase())).length,c:'#d97706'}].map(k=>(
                  <div key={k.l} style={{background:'#f9fafb',borderRadius:10,padding:'8px 14px',display:'flex',flexDirection:'column',gap:2,minWidth:100}}>
                    <div style={{fontSize:18,fontWeight:800,color:k.c}}>{k.v}</div>
                    <div style={{fontSize:10,color:'#9ca3af',textTransform:'uppercase'}}>{k.l}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{flex:1,overflow:'auto',padding:'0 24px 20px'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{position:'sticky',top:0,background:'#f9fafb',zIndex:1}}>
                  {['#','Teléfono N1','N2','Zona','Campaña','Hora asig.','Tipificación','Observación'].map(h=>(
                    <th key={h} style={{padding:'10px 8px',textAlign:'left',fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',borderBottom:'1px solid #e5e7eb'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {blCargando
                    ? <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#9ca3af'}}>Cargando...</td></tr>
                    : !blLeads
                      ? <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#ef4444'}}>Error de conexión.</td></tr>
                      : blLeads.length === 0
                        ? <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#9ca3af'}}>Sin leads para esta fecha.</td></tr>
                        : blLeads.map((l,i) => {
                            const t = (l.tipif_vend||'').trim()
                            const color = TIPIF_COLORS[t.toUpperCase()] || '#9ca3af'
                            return (
                              <tr key={i} style={{borderBottom:'1px solid #f3f4f6',background:t.toUpperCase()==='VENTA CERRADA'?'#f0fdf4':''}}>
                                <td style={{padding:8,color:'#9ca3af',fontSize:10}}>{i+1}</td>
                                <td style={{padding:8,fontFamily:'monospace',fontWeight:700,color:'#111827'}}>{l.n1||'—'}</td>
                                <td style={{padding:8,fontFamily:'monospace',color:'#6b7280'}}>{l.n2||'—'}</td>
                                <td style={{padding:8,fontSize:11}}>{l.distrito||l.campana||'—'}</td>
                                <td style={{padding:8,fontSize:11}}>{l.campana||'—'}</td>
                                <td style={{padding:8,fontSize:11,fontFamily:'monospace'}}>{l.hora_asig||'—'}</td>
                                <td style={{padding:8}}>
                                  {t
                                    ? <span style={{background:`${color}22`,color,border:`1px solid ${color}44`,padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:700}}>{t}</span>
                                    : <span style={{color:'#d1d5db',fontStyle:'italic',fontSize:11}}>Sin tipif.</span>
                                  }
                                </td>
                                <td style={{padding:8,fontSize:11,color:'#6b7280'}}>{l.obs_asesor||'—'}</td>
                              </tr>
                            )
                          })
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {ventaReasignar && (
        <ReasignarVentaModal
          venta={ventaReasignar}
          asesores={asesoresSala}
          alcance="sala"
          onClose={()=>setVentaReasignar(null)}
          onSuccess={completarReasignacion}
        />
      )}

      {ventaEditar && (
        <VentaEditarModal
          venta={ventaEditar}
          onClose={()=>setVentaEditar(null)}
          onSuccess={()=>{ setVentaEditar(null); cargarDatos(); mostrarToast('Datos actualizados') }}
        />
      )}

      {obsValidacionDetalle && (
        <div className="obs-validacion-modal-bg" onClick={e=>{if(e.target===e.currentTarget)setObsValidacionDetalle('')}}>
          <div className="obs-validacion-modal" role="dialog" aria-modal="true" aria-label="Observación de validación">
            <div className="obs-validacion-modal-header">
              <span>Observación de Validación</span>
              <button type="button" onClick={()=>setObsValidacionDetalle('')} aria-label="Cerrar">×</button>
            </div>
            <div className="obs-validacion-modal-mensaje">{obsValidacionDetalle}</div>
          </div>
        </div>
      )}

      {modalFotos.open && (
        <div
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',backdropFilter:'blur(8px)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}
          onClick={e => { if (e.target === e.currentTarget) setModalFotos(p => ({...p,open:false})) }}
        >
          <div style={{background:'#fff',borderRadius:'20px',width:'min(600px,96vw)',maxHeight:'88vh',overflow:'hidden',display:'flex',flexDirection:'column',boxShadow:'0 32px 80px rgba(0,0,0,.25)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'18px 22px',borderBottom:'1px solid #f3f4f6'}}>
              <div>
                <div style={{fontSize:'15px',fontWeight:700,color:'#111827'}}>Fotos de la venta</div>
                <div style={{fontSize:'12px',color:'#9ca3af',marginTop:'2px'}}>{modalFotos.nombre}</div>
              </div>
              <button onClick={() => setModalFotos(p => ({...p,open:false}))}
                style={{width:'30px',height:'30px',border:'none',borderRadius:'8px',background:'#f3f4f6',color:'#6b7280',fontSize:'16px',cursor:'pointer'}}>×</button>
            </div>
            <div style={{padding:'20px 22px',overflowY:'auto',flex:1}}>
              <div style={{marginBottom:'20px'}}>
                <label style={{fontSize:'11px',fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.4px',display:'block',marginBottom:'8px'}}>
                  Adjuntar foto
                </label>
                <label
                  style={{border:'2px dashed #e5e7eb',borderRadius:'12px',padding:'24px',textAlign:'center',cursor:'pointer',display:'block'}}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='#111827' }}
                  onDragLeave={e => { e.currentTarget.style.borderColor='#e5e7eb' }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor='#e5e7eb'; adjuntarFotos(e.dataTransfer.files, modalFotos.ventaId) }}
                >
                  <input type="file" accept="image/*,.pdf" multiple style={{display:'none'}}
                    onChange={e => { adjuntarFotos(e.target.files, modalFotos.ventaId); e.target.value='' }} />
                  <div style={{fontSize:'13px',color:'#9ca3af',fontWeight:500}}>Arrastra fotos aquí o haz clic para seleccionar</div>
                  <div style={{fontSize:'11px',color:'#d1d5db',marginTop:'4px'}}>JPG, PNG, PDF</div>
                </label>
              </div>
              <div style={{fontSize:'11px',fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'10px'}}>Fotos adjuntas</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:'10px'}}>
                {fotos.length === 0 ? (
                  <div style={{gridColumn:'1/-1',textAlign:'center',padding:'30px',color:'#d1d5db',fontSize:'13px'}}>Sin fotos adjuntas aún.</div>
                ) : fotos.map(f => {
                  const url   = f.ruta ? `${NC_API}/${f.ruta}` : (f.url || '')
                  const tipo  = f.mimetype || f.tipo || ''
                  const fecha = (f.created_at || f.fecha || '').split(' ')[0]
                  return (
                    <div key={f.id || f.url} style={{border:'1px solid #e5e7eb',borderRadius:'12px',overflow:'hidden',background:'#f9fafb'}}>
                      {tipo.startsWith('image')
                        ? <img src={url} alt={f.nombre} onClick={() => window.open(url)}
                            style={{width:'100%',height:'100px',objectFit:'cover',display:'block',cursor:'pointer'}} />
                        : <div onClick={() => window.open(url)}
                            style={{height:'100px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,color:'#6b7280',cursor:'pointer'}}>Archivo</div>
                      }
                      <div style={{padding:'6px 8px'}}>
                        <div style={{fontSize:'10px',fontWeight:600,color:'#374151',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.nombre}</div>
                        <div style={{fontSize:'9px',color:'#9ca3af'}}>{fecha}</div>
                      </div>
                      {f.id && (
                        <button onClick={() => eliminarFoto(f.id, modalFotos.ventaId)}
                          style={{width:'100%',padding:'4px',border:'none',background:'#fff5f5',color:'#dc2626',fontSize:'10px',fontWeight:700,cursor:'pointer'}}>
                          Eliminar
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* â•â• TOAST â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
    </div>
  )
}
