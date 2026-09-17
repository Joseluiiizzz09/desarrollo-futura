import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { API, NC_API, ncHeaders, ncHeadersFile } from '../services/api'
import { responseChanged, setVisibleInterval, clearVisibleInterval } from '../utils/polling'
import { UBIGEO } from '../services/ubigeo'
import ObsSeguimientoCell from '../components/ObsSeguimientoCell'
import ProgramacionInfoCell from '../components/ProgramacionInfoCell'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import '../styles/dashboard.css'

// ─── Constantes ─────────────────────────────────────────────────────────────
const META_DIARIA = 5

const TIPS = [
  { label: 'VENTA CERRADA',           cls: 'tip-venta' },
  { label: 'PREVENTA',                cls: 'tip-preventa' },
  { label: 'AGENDADO',                cls: 'tip-agendado' },
  { label: 'NO CONTESTA',             cls: 'tip-nocontesta' },
  { label: 'BUZON DE VOZ',            cls: 'tip-buzon' },
  { label: 'CORTA LLAMADA',           cls: 'tip-corta' },
  { label: 'EN EJECUCION',            cls: 'tip-ejecucion' },
  { label: 'SIN COBERTURA',           cls: 'tip-sincobert' },
  { label: 'NO CALIFICA',             cls: 'tip-nocalifica' },
  { label: 'NO DESEA',                cls: 'tip-nodesea' },
  { label: 'CONTACTO CON TERCEROS',   cls: 'tip-terceros' },
  { label: 'EDIFICIO NO LIBERADO',    cls: 'tip-edificio' },
  { label: 'DESEA MOVIL',             cls: 'tip-movil' },
  { label: 'SERVICIO ACTIVO',         cls: 'tip-servicio' },
]

const PAQUETES_POR_PLAN = {
  '1 PLAY': ['150 MBPS S/70.00','300 MBPS S/75.00','800 MBPS S/100.00','1500 MBPS S/200.00','PROM ENTRADA 200 X 12 M 400 MBPS X 6M 39.5','PROM GRANDE 1000 MBPS X 6M 59.9','PROM GRANDE 850 X 12M 1000 MBPS X 4M 55','PROM LIM/ARQ 400 X 12 M 1000 MBPS X 2 M 1 SOL','PROM MEDIANA 400 X 12M 1000 MBPS X 6M 55','REG PRO 1000 MBPS','REG PRO 500 MBPS'],
  '2 PLAY INTERNET + TELEFONO': ['150 MBPS S/70.00','1000 MBPS S/150.00','1500 MBPS S/205.00','300 MBPS S/80.00','300 MPBS 84.00','400 MBPS 94.00 S','400 MBPS S/90.00','800 MBPS S/105.00'],
  '2 PLAY INTERNET + CABLE ESTANDAR': ['1000 MBPS S/230.00','150 MBPS S/150.00','1500 MBPS S/285.00','300 MBPS S/160.00','400 MBPS S/170.00','800 MBPS S/185.00'],
  '2 PLAY INTERNET + CABLE SUPERIOR': ['1000 MBPS S/270.00','150 MBPS S/190.00','1500 MBPS S/325.00','300 MBPS S/200.00','400 MBPS S/210.00','800 MBPS S/225.00'],
  '3 PLAY ESTANDAR': ['1000 MBPS S/235.00','150 MBPS S/155.00','1500 MBPS S/290.00','300 MBPS S/165.00','400 MBPS S/175.00','800 MBPS S/190.00'],
  '3 PLAY SUPERIOR': ['1000 MBPS S/275.00','150 MBPS S/195.00','1500 MBPS S/330.00','300 MBPS S/205.00','400 MBPS S/215.00','800 MBPS S/230.00'],
}

const NV_DEFAULT = {
  nombre:'', tipoDoc:'DNI', dni:'', email:'', tel1:'', tel2:'',
  dpto:'', prov:'', dist:'', dir:'', coord:'',
  fechaNac:'', lugarNac:'', padre:'', madre:'',
  cuota:'', hogar:'', tec:'', paquete:'',
  full:'', decos:'0', mesh:'0', plano:'',
  estado:'VENTA', obs:'',
}

// ─── Utilidades puras ────────────────────────────────────────────────────────
function fechaHoy() {
  const ahora = new Date()
  const utcMs = ahora.getTime() + ahora.getTimezoneOffset() * 60000
  const peru  = new Date(utcMs + (-5 * 3600000))
  const y = peru.getFullYear()
  const m = String(peru.getMonth() + 1).padStart(2, '0')
  const d = String(peru.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function fechaISO(d) { return d.toISOString().split('T')[0] }

function normalizarFecha(f) {
  const match = String(f || '').match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

function esVentaInstalada(venta) {
  const estado = String(venta?.estado || '').trim().toUpperCase().replace(/_/g, ' ')
  return estado === 'INSTALADO' || estado === 'INSTALADO NO VALIDADO' || estado === 'REASIGNACION'
}

// Mismos estados que el backend usa para calcular fecha_caida (ver ph_caida
// en GET /ventas), pero mirando el estado ACTUAL de la venta, no si alguna
// vez paso por ahi. Una venta que cayo y luego se reactivo (vuelve a
// EN_EJECUCION/TECNICO_CASA) no es una caida vigente.
const ESTADOS_CAIDA = ['CAIDA', 'RECHAZO', 'RECHAZO CAMPO', 'RECHAZO MESA', 'RECHAZADA', 'RECHAZADO', 'ANULADA', 'SERVICIO ACTIVO']
function esVentaCaida(venta) {
  const estado = String(venta?.estado || '').trim().toUpperCase().replace(/_/g, ' ')
  return ESTADOS_CAIDA.includes(estado)
}

function fechaHoyFormateada() {
  return new Date().toLocaleDateString('es-PE', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
}

function colorEstado(e) {
  const map = {
    'VENTA CERRADA':'estado-venta-cerrada','CORTA LLAMADA':'estado-corta-llamada',
    'PREVENTA':'estado-preventa','NO CONTESTA':'estado-no-contesta',
    'EN EJECUCION':'estado-en-ejecucion','SIN COBERTURA':'estado-sin-cobertura',
    'DESEA MOVIL':'estado-desea-movil','SERVICIO ACTIVO':'estado-servicio-activo',
    'AGENDADO':'estado-agendado','NO CALIFICA':'estado-no-califica',
    'EDIFICIO NO LIBERADO':'estado-sh-edificio-no-liberado',
    'CONTACTO CON TERCEROS':'estado-contacto-con-terceros',
    'NO DESEA':'estado-no-desea','BUZON DE VOZ':'estado-buzon-voz','DERIVADO':'estado-derivado','NUEVO':'estado-nuevo',
    'INSTALADO':'estado-instalado','CAIDA':'estado-caida','CAÍDA':'estado-caida',
    'TECNICO EN CASA':'estado-tecnico-casa','TECNICOS EN CASA':'estado-tecnico-casa',
    'TÉCNICO EN CASA':'estado-tecnico-casa','TÉCNICOS EN CASA':'estado-tecnico-casa',
    'RECHAZO EN CAMPO':'estado-rechazo-campo','FRAUDE':'estado-fraude',
    'VALIDADO':'estado-validado','PROGRAMADO':'estado-programado','BLOQUEADO':'estado-bloqueado',
  }
  return map[e] || 'estado-nuevo'
}

const GRAB_TIPIF_BADGE = {
  corta_llamada: { cls:'vs-badge-cortallamada',  label:'CORTA LLAMADA' },
  suplantacion:  { cls:'vs-badge-suplantacion',  label:'SUPLANTACIÓN' },
  no_desea:      { cls:'vs-badge-nodesea',       label:'NO DESEA' },
  no_contesta:   { cls:'vs-badge-nocontesta',    label:'NO CONTESTA' },
  buzon_voz:     { cls:'vs-badge-buzonvoz',      label:'BUZÓN DE VOZ' },
}

function BadgeVS({ e, sup, estadoGrab, grabandoPorNombre }) {
  const estado = (e || '').toLowerCase().trim()
  const supEstado = (sup || '').toLowerCase().trim()
  const eg = (estadoGrab || '').toLowerCase().trim()

  // Estado de Grabaciones (independiente del estado de Validación, que sigue
  // mostrando lo suyo sin cambios). Mientras Grabaciones tenga trabajo en
  // curso o pendiente de que Super de Grabaciones corrobore, este badge
  // manda — sin pisar `estado`. El nombre es solo visual (grabando_por_nombre
  // viene resuelto por el backend desde grabando_por_id); el estado
  // almacenado sigue siendo únicamente "grabando".
  // Condicionado a estado==='validado': en cuanto Programación avanza el
  // campo compartido `estado` (PROGRAMADO/BLOQUEADO/etc), esa etapa manda —
  // estado_grab/estado_supgrab quedan fijos como historial y ya no deben
  // seguir tapando el estado real posterior.
  if (estado === 'validado') {
    if (eg === 'grabando' || (eg === 'grabado' && supEstado !== 'aprobado')) {
      const primerNombre = String(grabandoPorNombre || '').trim().split(/\s+/)[0]
      const label = primerNombre ? `GRABANDO ${primerNombre.toUpperCase()}` : 'GRABANDO'
      return <span className="vs-badge vs-badge-grabando">{label}</span>
    }
    if (eg === 'grabado' && supEstado === 'aprobado') {
      return <span className="vs-badge vs-badge-grabado">GRABADO</span>
    }
    if (GRAB_TIPIF_BADGE[eg]) {
      const b = GRAB_TIPIF_BADGE[eg]
      return <span className={`vs-badge ${b.cls}`}>{b.label}</span>
    }
  }

  if (estado === 'grabado') {
    if (supEstado === 'sin_revisar' || supEstado === 'en_revision') {
      return <span className="vs-badge vs-badge-revision">EN REVISION</span>
    }
    if (supEstado === 'observado') {
      return <span className="vs-badge vs-badge-revision">EN REVISION</span>
    }
    return <span className="vs-badge vs-badge-grabado">GRABADO</span>
  }
  // FRAUDE es ambiguo: Validación y Programación pueden tipificar el mismo
  // valor de `estado`. Solo llega a Programación tras ser aprobado por Super
  // de Grabaciones (estado_supgrab='aprobado'), así que ese dato distingue
  // cuál de los dos lo marcó, sin necesitar un campo nuevo.
  if (estado === 'fraude' && supEstado === 'aprobado') {
    return <span className="vs-badge vs-badge-fraude-prog">FRAUDE</span>
  }
  const map = {
    'venta':         { cls:'vs-badge-venta',      label:'VENTA' },
    'validado':      { cls:'vs-badge-validado',    label:'VALIDADO' },
    'grabado':       { cls:'vs-badge-grabado',     label:'GRABADO' },
    'aprobado':      { cls:'vs-badge-programado',  label:'APROBADO' },
    // Mientras Sup. Grabaciones no confirme, sigue siendo PROGRAMADO.
    'programado':    { cls:'vs-badge-programado',  label:'PROGRAMADO' },
    'bloqueado':     { cls:'vs-badge-bloqueado',   label:'BLOQUEADO' },
    'sin_agenda':    { cls:'vs-badge-sinagenda',   label:'SIN AGENDA' },
    'caracter_especial': { cls:'vs-badge-caracterespecial', label:'CARÁCTER ESPECIAL' },
    'zona_restringida':  { cls:'vs-badge-zonarestringida',  label:'ZONA RESTRINGIDA' },
    'en_ejecucion':  { cls:'vs-badge-ejecucion',   label:'EN EJECUCION' },
    'tecnico_casa':  { cls:'vs-badge-tecnico',     label:'TECNICO EN CASA' },
    'levantar_sot': { cls:'vs-badge-rechazocampo', label:'LEVANTAR SOT' },
    'tecnicos_camino': { cls:'vs-badge-tecnico', label:'TECNICOS EN CAMINO' },
    'instalado_no_validado': { cls:'vs-badge-instalado', label:'INSTALADO NO VALIDADO' },
    'reasignacion': { cls:'vs-badge-ejecucion', label:'REASIGNACION' },
    'derivado_planta_externa': { cls:'vs-badge-rechazocampo', label:'DERIVADO A PLANTA EXTERNA' },
    'rechazo_campo': { cls:'vs-badge-rechazocampo', label:'RECHAZO EN CAMPO' },
    'rechazo_mesa': { cls:'vs-badge-rechazocampo', label:'RECHAZO EN MESA' },
    'no_validado':   { cls:'vs-badge-observado',   label:'NO VALIDADO' },
    'instalado':     { cls:'vs-badge-instalado',   label:'INSTALADO' },
    'caida':         { cls:'vs-badge-caida',       label:'CAIDA' },
    'duplicada':     { cls:'vs-badge-duplicada',   label:'DUPLICADA' },
    'rechazado':      { cls:'vs-badge-caida',      label:'RECHAZADO' },
    'observado':      { cls:'vs-badge-observado',  label:'OBSERVADO' },
    'servicio_activo':{ cls:'vs-badge-servicioactivo', label:'SERVICIO ACTIVO' },
    'fraude':         { cls:'vs-badge-fraude',         label:'FRAUDE' },
    'no_contesta':    { cls:'vs-badge-nocontesta',     label:'NO CONTESTA' },
    'buzon_voz':      { cls:'vs-badge-buzonvoz',       label:'BUZÓN DE VOZ' },
    'corta_llamada':  { cls:'vs-badge-cortallamada',   label:'CORTA LLAMADA' },
    'no_desea':       { cls:'vs-badge-nodesea',        label:'NO DESEA' },
  }
  const found = map[estado]
  if (!found) return <span className="vs-badge vs-badge-venta">{e ? e.toUpperCase() : '-'}</span>
  return <span className={`vs-badge ${found.cls}`} style={found.style || {}}>{found.label}</span>
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  )
}

function generarRangoFechas(desde, hasta) {
  const fechas = []
  const d = new Date(desde + 'T00:00:00')
  const h = new Date(hasta + 'T00:00:00')
  while (d <= h) { fechas.push(fechaISO(d)); d.setDate(d.getDate() + 1) }
  return fechas
}

function asignacionesVigentesDelAsesor(historial, asesorNombre, asesorId, titularId) {
  const eventos = Array.isArray(historial) ? historial : []
  const normalizarAsesor = valor => String(valor || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
  const nombre = normalizarAsesor(asesorNombre)
  const ultimoRetiro = eventos.reduce((indice, evento, i) => {
    const esRetiro = String(evento?.tipo || '').trim().toUpperCase() === 'QUITAR_ASIGNACION'
    const retirado = normalizarAsesor(evento?.asesorQuitado || evento?.asesor_quitado)
    return esRetiro && (!nombre || retirado === nombre) ? i : indice
  }, -1)
  const esAsignacion = evento =>
    evento?.fecha && evento?.asesor
    && !['TIPIF_VEND','TIPIF_BACK','DERIVADO','QUITAR_ASIGNACION'].includes(String(evento.tipo || '').trim().toUpperCase())
  const asignaciones = eventos.slice(ultimoRetiro + 1).filter(evento =>
    esAsignacion(evento) && (evento.asesor_id
      ? Number(evento.asesor_id) === Number(asesorId)
      : (!nombre || normalizarAsesor(evento.asesor) === nombre)))
  // Los historiales antiguos guardaban solo el nombre. El ID del titular
  // confirma a quién pertenece la última asignación aunque haya sido renombrado.
  // No inferir propietarios anteriores ni revivir una asignación retirada.
  if (Number(asesorId) > 0 && Number(titularId) === Number(asesorId)) {
    const ultima = eventos.findLastIndex(esAsignacion)
    const evento = eventos[ultima]
    const retiroPosterior = eventos.slice(ultima + 1).some(e =>
      String(e?.tipo || '').trim().toUpperCase() === 'QUITAR_ASIGNACION')
    if (evento && !retiroPosterior && (!evento.asesor_id || Number(evento.asesor_id) === Number(asesorId))
      && !asignaciones.includes(evento)) asignaciones.push(evento)
  }
  return asignaciones
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function Dashboard() {
  const { sesion, logout, refrescarSesion } = useAuth()
  const navigate = useNavigate()
  const [asesorObjetivo] = useState(() => {
    try {
      const objetivo = JSON.parse(sessionStorage.getItem('nc_dashboard_asesor_objetivo') || 'null')
      return objetivo?.cargo === 'asesor' ? objetivo : null
    } catch { return null }
  })
  const vistaJefatura = Boolean((sesion?._actorJefatura || sesion?.cargo === 'jefatura') && asesorObjetivo?.id)
  const filtroAsesor = vistaJefatura
    ? `?asesor_id=${encodeURIComponent(asesorObjetivo.id)}`
    : '?area=asesor'

  // Tab
  const [tab, setTab] = useState(() => sessionStorage.getItem('nc_dashboard_apartado') || 'llamadas')

  // Datos
  const [clientes,        setClientes]        = useState([])
  const [filtroNumero,    setFiltroNumero]    = useState('')
  const [ventasSubidas,   setVentasSubidas]    = useState([])
  const [ventasMostradas, setVentasMostradas]  = useState([])
  const [frases,          setFrases]           = useState([])
  const [ultimaSync,      setUltimaSync]        = useState(null)

  // Contactos gestionados hoy: cantidad de registros/números asignados al asesor durante el día.
  // Ventas e instalaciones se calculan exclusivamente desde /ventas.
  const [llamadas,   setLlamadas]   = useState(0)

  // Modal tipificación
  const [seleccionado, setSeleccionado] = useState(null)
  const [modalTip,     setModalTip]     = useState(false)
  const [tipSearch,    setTipSearch]    = useState('')
  const [modalEspecial, setModalEspecial] = useState(null)

  // Panel nueva / editar venta
  const [panelNV,     setPanelNV]     = useState(false)
  const [nvEditId,    setNvEditId]    = useState(null)
  const [nvLeadId,    setNvLeadId]    = useState(null)
  const [nvForm,      setNvForm]      = useState(NV_DEFAULT)
  const [nvProvs,     setNvProvs]     = useState([])
  const [nvDists,     setNvDists]     = useState([])
  const [nvPaquetes,  setNvPaquetes]  = useState([])
  const [guardandoNV, setGuardandoNV] = useState(false)

  // Selector de Teléfono Contacto — VENTA CERRADA del día
  const [nvVentasCerradas, setNvVentasCerradas] = useState([])
  const [nvCargandoVC,     setNvCargandoVC]     = useState(false)
  const [nvTelSearch,      setNvTelSearch]      = useState('')
  const [nvTelOpen,        setNvTelOpen]        = useState(false)
  const nvTelRef = useRef(null)

  // Modal fotos
  const [modalFotos, setModalFotos] = useState({ open:false, ventaId:null, nombre:'' })
  const [fotos,      setFotos]      = useState([])

  // Filtros ventas subidas
  const [filtroDni,   setFiltroDni]   = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')
  // Paginación de la tabla: sin esto se pintaban de golpe todas las ventas
  // históricas del asesor (sin límite ni virtualización), lo que traba la
  // pantalla a medida que crece el histórico de meses.
  const [paginaVentas, setPaginaVentas] = useState(0)

  // Filtros gráficos rendimiento
  const [grafDesde, setGrafDesde] = useState(fechaHoy())
  const [grafHasta, setGrafHasta] = useState(fechaHoy())

  // Canvas refs
  const canvasDiario  = useRef(null)
  const canvasSemanal = useRef(null)
  const canvasMensual = useRef(null)
  const instDiario    = useRef(null)
  const instSemanal   = useRef(null)
  const instMensual   = useRef(null)

  // Refs para acceso sin stale closure
  const ventasRef  = useRef([])
  const cargandoVentasRef = useRef(false)
  const firmaVentasRef = useRef('')
  const firmaFrasesRef = useRef('')
  const grafRef    = useRef({ desde: fechaHoy(), hasta: fechaHoy() })
  const toastTimer = useRef(null)
  const [toast, setToast] = useState('')

  // ── Toast ────────────────────────────────────────────────────────────────
  function mostrarToast(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2700)
  }

  async function copiarNumero(numero) {
    const texto = String(numero || '').trim()
    if (!texto) return
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto)
      } else {
        const area = document.createElement('textarea')
        area.value = texto
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }
    } catch(e) {
      mostrarToast('No se pudo copiar el número')
    }
  }

  // ── Cambiar tab ──────────────────────────────────────────────────────────
  function cambiarTab(t) {
    sessionStorage.setItem('nc_dashboard_apartado', t)
    setTab(t)
  }

  // Cada apartado debe comenzar debajo del encabezado, sin conservar el scroll anterior.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    })
    return () => window.cancelAnimationFrame(frame)
  }, [tab])

  // ── API: Leads ───────────────────────────────────────────────────────────
  const ultEditRef = useRef(0)
  const pendTipRef = useRef({})   // {id: {estado?, obs?, ts}} — mantiene lo recién editado hasta que el server lo confirme
  const cargandoLeadsRef = useRef(false)
  const firmaLeadsRef = useRef('')
  const cargarLeadsAsesor = useCallback(async () => {
    if (Date.now() - ultEditRef.current < 1500) return  // pausa breve tras editar (evita parpadeo)
    if (cargandoLeadsRef.current) return  // evita polls solapados (respuestas fuera de orden)
    cargandoLeadsRef.current = true
    try {
      const separador = filtroAsesor.includes('?') ? '&' : '?'
      const res  = await fetch(`${API}/leads${filtroAsesor}${separador}fecha=${encodeURIComponent(fechaHoy())}`, {
        headers: ncHeaders(),
        cache: 'no-store',
      })
      const data = await res.json()
      if (!data.ok) return
      if (!responseChanged(firmaLeadsRef, data.data) && Object.keys(pendTipRef.current).length === 0) return
      const hoy = fechaHoy()
      const asesorIdVista = Number(vistaJefatura ? asesorObjetivo?.id : sesion?.id)
      const asesorNombreVista = ((vistaJefatura ? asesorObjetivo?.nombre : sesion?.nombre) || '').trim()
      const leadsAsignados = data.data.filter(l => {
        const historial = Array.isArray(l.historial) ? l.historial : []
        const asignaciones = asignacionesVigentesDelAsesor(historial, asesorNombreVista, asesorIdVista, l.asesor_id)
        const ultimaAsignacion = asignaciones[asignaciones.length - 1]

        // La fecha del lead identifica la base de origen. Para el asesor
        // importa cuándo recibió el registro. El fallback mantiene compatibles
        // los registros antiguos que todavía no tienen historial.
        if (ultimaAsignacion?.fecha) return normalizarFecha(ultimaAsignacion.fecha) === hoy

        // Compatibilidad con leads antiguos sin historial: solo pertenecen al
        // asesor si continúa siendo el titular actual. Si se usó “Quitar”, no
        // deben reaparecer por el simple hecho de que el lead fue creado hoy.
        const esTitularActual = asesorIdVista
          ? Number(l.asesor_id) === asesorIdVista
          : Boolean(asesorNombreVista) && String(l.asesor_nombre || '').trim().toUpperCase() === asesorNombreVista.toUpperCase()
        return historial.length === 0 && esTitularActual && normalizarFecha(l.fecha) === hoy
      })
      setClientes(prev => {
        const ea = {}
        prev.forEach(c => { ea[c.id] = { estado: c.estado, obs: c.obs } })
        // En la vista abierta desde Jefatura, los leads pertenecen al asesor
        // seleccionado, no al usuario de Jefatura que mantiene la sesión.
        const miNombre = ((vistaJefatura ? asesorObjetivo?.nombre : sesion?.nombre) || '').trim()
        return leadsAsignados.map(l => {
          const p = ea[l.id] || {}
          // ¿Soy el asesor actual del número o solo lo trabajé antes (registro)?
          const soyActual = asesorIdVista
            ? Number(l.asesor_id) === asesorIdVista
            : (!miNombre || (l.asesor_nombre || '').trim() === miNombre)
          let miTipif = ''
          if (soyActual) {
            miTipif = l.tipif_vend || ''
          } else {
            const hist = Array.isArray(l.historial) ? l.historial : []
            const ent = [...hist].reverse().find(h => (h.asesorAnterior || '').trim() === miNombre)
            miTipif = ent?.tipifVendAntes || ''
          }
          // LLAMANDO es una marca interna de Back Data y nunca debe convertirse
          // en el estado visible del asesor. DERIVADO conserva su aviso actual.
          // No reutilizar `p.estado` aquí: al rotar se conserva el mismo id del lead
          // y ese valor local pertenecía a la asignación anterior.
          let estado = miTipif && miTipif !== '' ? miTipif : 'NUEVO'
          let obs = ''
          if (soyActual) {
            // La observación vigente llega del servidor. Reusar `p.obs` transferiría
            // el comentario del asesor anterior al nuevo titular durante el polling.
            obs = l.obs_asesor_personal ?? l.obs_asesor ?? ''
          } else {
            const hist = Array.isArray(l.historial) ? l.historial : []
            const ent = [...hist].reverse().find(h => (h.asesorAnterior || '').trim() === miNombre)
            obs = l.obs_asesor_personal ?? ent?.obsAsesorAntes ?? ''
          }
          const historial = Array.isArray(l.historial) ? l.historial : []
          const asignacionesDelAsesor = asignacionesVigentesDelAsesor(historial, miNombre, asesorIdVista, l.asesor_id)
          const asignacionDelAsesor = asignacionesDelAsesor[asignacionesDelAsesor.length - 1]
          const horaAsignacion = asignacionDelAsesor?.hora || (soyActual ? l.hora_asig : '') || ''
          const fechaAsignacion = normalizarFecha(asignacionDelAsesor?.fecha || l.fecha) || ''
          // Stickiness: conserva lo recién tipificado/observado hasta que el server lo
          // confirme (evita el parpadeo estado→pendiente→estado tras tipificar).
          const pend = pendTipRef.current[l.id]
          if (pend) {
            const edad = Date.now() - pend.ts
            if (edad < 8000) {
              const estadoOk = pend.estado == null || estado === pend.estado
              const obsOk     = pend.obs == null || obs === pend.obs
              if (!estadoOk) estado = pend.estado
              if (!obsOk)    obs = pend.obs
              if (estadoOk && obsOk) delete pendTipRef.current[l.id]
            } else { delete pendTipRef.current[l.id] }
          }
          return {
            id:       l.id,
            telefono: l.n1,
            telefono2: l.n2 || '',
            usuarioWhatsapp: l.usuario_whatsapp || '',
            tipoContacto: l.tipo_contacto || 'LLAMADA',
            direccion: l.direccion || '',
            coordenadas: l.coordenadas || '',
            obsBack: l.obs_back_personal ?? l.obs_back ?? '',
            // La zona del asesor es ubicación geográfica; nunca debe mostrar campañas.
            zona:     l.distrito || l.provincia || l.departamento || '--',
            horaAsig: horaAsignacion,
            _fechaAsig: fechaAsignacion,
            instanciaVentaNumero: Number(l.instancia_venta_numero || l.ciclo_abierto_numero || 0),
            instanciaTipo: l.instancia_tipo || l.ciclo_abierto_tipo || '',
            estado,
            derivadoPor: l.derivado_por_nombre || '',
            obs,
            _soloLectura: !soyActual,   // ya no es su número: registro de lo trabajado
          }
        }).sort((a, b) => {
          const horaA = `${a._fechaAsig || ''} ${String(a.horaAsig || '').trim()}`.trim()
          const horaB = `${b._fechaAsig || ''} ${String(b.horaAsig || '').trim()}`.trim()
          if (!horaA && !horaB) return Number(a.id) - Number(b.id)
          if (!horaA) return 1
          if (!horaB) return -1
          const porAsignacion = horaB.localeCompare(horaA, 'es', { numeric:true })
          return porAsignacion || Number(b.id) - Number(a.id)
        })
      })
      setLlamadas(leadsAsignados.length)
    } catch(e) { console.error('Error cargando leads:', e) }
    finally { cargandoLeadsRef.current = false }
  }, [filtroAsesor, vistaJefatura, asesorObjetivo?.id, asesorObjetivo?.nombre, sesion?.id, sesion?.nombre])

  // ── API: Ventas ──────────────────────────────────────────────────────────
  const cargarVentasSubidas = useCallback(async () => {
    if (cargandoVentasRef.current) return ventasRef.current
    cargandoVentasRef.current = true
    try {
      const res  = await fetch(`${API}/ventas${filtroAsesor}`, { headers: ncHeaders() })
      const data = await res.json()
      if (data.ok && responseChanged(firmaVentasRef, data.data)) {
        ventasRef.current = data.data
        setVentasSubidas(data.data)
        setVentasMostradas(data.data)
        setUltimaSync(new Date())
        return data.data
      }
      return []
    } catch(e) { console.error('Error cargando ventas:', e); return [] }
    finally { cargandoVentasRef.current = false }
  }, [filtroAsesor])

  // ── API: Frases ──────────────────────────────────────────────────────────
  const cargarFrasesSuper = useCallback(async () => {
    try {
      const u   = JSON.parse(sessionStorage.getItem('nc_usuario') || '{}')
      const sala = vistaJefatura ? asesorObjetivo?.sala : u?.sala
      const url = sala ? `${API}/frases?sala=${encodeURIComponent(sala)}` : `${API}/frases`
      const res  = await fetch(url, { headers: ncHeaders() })
      const data = await res.json()
      const frases = data.ok && data.data?.length ? data.data : []
      if (responseChanged(firmaFrasesRef, frases)) setFrases(frases)
    } catch(e) { setFrases([]) }
  }, [vistaJefatura, asesorObjetivo?.sala])

  // ── Polling ──────────────────────────────────────────────────────────────
  useEffect(() => {
    cargarLeadsAsesor()
    cargarVentasSubidas()
    cargarFrasesSuper()
    const t1 = setVisibleInterval(cargarLeadsAsesor,    1000)
    const t2 = setVisibleInterval(cargarFrasesSuper,   30000)
    const t3 = setVisibleInterval(cargarVentasSubidas,  1000)
    const sincronizarAlVolver = () => {
      if (document.visibilityState === 'visible') {
        cargarLeadsAsesor()
        cargarVentasSubidas()
      }
    }
    window.addEventListener('focus', sincronizarAlVolver)
    window.addEventListener('online', sincronizarAlVolver)
    document.addEventListener('visibilitychange', sincronizarAlVolver)
    return () => {
      clearVisibleInterval(t1); clearVisibleInterval(t2); clearVisibleInterval(t3)
      window.removeEventListener('focus', sincronizarAlVolver)
      window.removeEventListener('online', sincronizarAlVolver)
      document.removeEventListener('visibilitychange', sincronizarAlVolver)
    }
  }, [cargarLeadsAsesor, cargarVentasSubidas, cargarFrasesSuper])

  // ── Click fuera del selector de teléfono ────────────────────────────────
  useEffect(() => {
    if (!nvTelOpen) return
    function handleOutside(e) {
      if (nvTelRef.current && !nvTelRef.current.contains(e.target)) setNvTelOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [nvTelOpen])

  // ── Efectos por tab ──────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'rendimiento') {
      cargarVentasSubidas()
    }
    if (tab === 'frases')        cargarFrasesSuper()
    if (tab === 'ventassubidas') cargarVentasSubidas()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // ── Gráficos ─────────────────────────────────────────────────────────────
  function getVentasPorRango(vs, desde, hasta) {
    const fechas = generarRangoFechas(desde, hasta)
    const vPF = {}, iPF = {}
    fechas.forEach(f => { vPF[f] = 0; iPF[f] = 0 })
    vs.forEach(v => {
      const f = normalizarFecha(v.created_at)
      if (vPF[f] !== undefined) {
        vPF[f]++
        if (esVentaInstalada(v)) iPF[f]++
      }
    })
    const labels = fechas.map(f => { const p = f.split('-'); return p[2]+'/'+p[1] })
    return { labels, ventas: fechas.map(f => vPF[f]), instaladas: fechas.map(f => iPF[f]) }
  }

  function getSemanal(vs, referencia = fechaHoy()) {
    const ref = new Date(`${normalizarFecha(referencia) || fechaHoy()}T00:00:00`)
    const mes = ref.getMonth(), anio = ref.getFullYear()
    const ultimoDia = new Date(anio, mes + 1, 0).getDate()
    const totalSemanas = Math.ceil(ultimoDia / 7)
    const s = Array(totalSemanas).fill(0), sI = Array(totalSemanas).fill(0)
    vs.forEach(v => {
      const fecha = normalizarFecha(v.created_at)
      if (!fecha) return
      const f = new Date(fecha + 'T00:00:00')
      if (f.getMonth() === mes && f.getFullYear() === anio) {
        const idx = Math.floor((f.getDate()-1)/7)
        s[idx]++; if (esVentaInstalada(v)) sI[idx]++
      }
    })
    const labels = s.map((_, i) => {
      const inicio = i * 7 + 1
      const fin = Math.min(inicio + 6, ultimoDia)
      return `Sem ${i + 1} (${inicio}-${fin})`
    })
    return { labels, ventas: s, instaladas: sI }
  }

  function getMensual(vs, referencia = fechaHoy()) {
    const ref = new Date(`${normalizarFecha(referencia) || fechaHoy()}T00:00:00`)
    const anio = ref.getFullYear()
    const m = Array(12).fill(0), mI = Array(12).fill(0)
    vs.forEach(v => {
      const fecha = normalizarFecha(v.created_at)
      if (!fecha) return
      const f = new Date(fecha + 'T00:00:00')
      if (f.getFullYear() === anio) {
        m[f.getMonth()]++
        if (esVentaInstalada(v)) mI[f.getMonth()]++
      }
    })
    return { labels: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'], ventas: m, instaladas: mI }
  }

  async function iniciarGraficos(vs) {
    const data = vs || ventasRef.current
    if (!canvasDiario.current) return
    const { default: Chart } = await import('chart.js/auto')
    const barOpts = (extra = {}) => ({
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } } },
      scales: { y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ...extra }, x: { grid: { display: false } } },
    })
    const desde = grafRef.current.desde
    const hasta = grafRef.current.hasta
    const referencia = hasta || fechaHoy()
    const diario  = getVentasPorRango(data, desde, hasta)
    if (instDiario.current)  instDiario.current.destroy()
    instDiario.current = new Chart(canvasDiario.current, {
      type: 'bar',
      data: { labels: diario.labels, datasets: [
        { label:'Ventas',    data:diario.ventas,    backgroundColor:'rgba(34,197,94,0.8)',  borderRadius:6 },
        { label:'Instaladas',data:diario.instaladas,backgroundColor:'rgba(139,92,246,0.8)',borderRadius:6 },
      ]},
      options: barOpts({ ticks: { stepSize: 1 } }),
    })
    const semanal = getSemanal(data, referencia)
    if (instSemanal.current) instSemanal.current.destroy()
    instSemanal.current = new Chart(canvasSemanal.current, {
      type: 'bar',
      data: { labels: semanal.labels, datasets: [
        { label:'Ventas',    data:semanal.ventas,    backgroundColor:'rgba(34,197,94,0.75)', borderRadius:6 },
        { label:'Instaladas',data:semanal.instaladas,backgroundColor:'rgba(139,92,246,0.75)',borderRadius:6 },
      ]},
      options: barOpts({ ticks: { stepSize: 1 }, suggestedMin: 0 }),
    })
    const mensual = getMensual(data, referencia)
    if (instMensual.current) instMensual.current.destroy()
    instMensual.current = new Chart(canvasMensual.current, {
      type: 'line',
      data: { labels: mensual.labels, datasets: [
        { label:'Ventas',    data:mensual.ventas,    borderColor:'#22c55e',backgroundColor:'rgba(34,197,94,0.08)',  tension:0.4, fill:true, pointRadius:4 },
        { label:'Instaladas',data:mensual.instaladas,borderColor:'#8b5cf6',backgroundColor:'rgba(139,92,246,0.08)', tension:0.4, fill:true, pointRadius:4 },
      ]},
      options: barOpts({ ticks: { stepSize: 1 }, suggestedMin: 0 }),
    })
  }

  function actualizarInstanciaGrafico(instancia, datos) {
    if (!instancia) return
    instancia.data.labels = datos.labels
    instancia.data.datasets[0].data = datos.ventas
    instancia.data.datasets[1].data = datos.instaladas
    instancia.update('none')
  }

  async function sincronizarGraficos(vs = ventasRef.current) {
    if (tab !== 'rendimiento' || !canvasDiario.current) return
    if (!instDiario.current || !instSemanal.current || !instMensual.current) {
      await iniciarGraficos(vs)
      return
    }
    const desde = grafRef.current.desde
    const hasta = grafRef.current.hasta
    const referencia = hasta || fechaHoy()
    actualizarInstanciaGrafico(instDiario.current, getVentasPorRango(vs, desde, hasta))
    actualizarInstanciaGrafico(instSemanal.current, getSemanal(vs, referencia))
    actualizarInstanciaGrafico(instMensual.current, getMensual(vs, referencia))
  }

  function aplicarFiltroGrafico() {
    grafRef.current = { desde: grafDesde, hasta: grafHasta }
    sincronizarGraficos(ventasRef.current)
  }

  // Mantiene los tres graficos coordinados con cada respuesta nueva del servidor.
  useEffect(() => {
    if (tab !== 'rendimiento') return undefined
    const timer = setTimeout(() => sincronizarGraficos(ventasSubidas), 0)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ventasSubidas, tab])

  useEffect(() => () => {
    instDiario.current?.destroy()
    instSemanal.current?.destroy()
    instMensual.current?.destroy()
  }, [])

  // ── Tipificación ─────────────────────────────────────────────────────────
  function abrirModalTip(i) { setSeleccionado(i); setTipSearch(''); setModalTip(true) }

  function cerrarModales() { setModalTip(false); setTipSearch('') }

  async function tipificar(tipo) {
    ultEditRef.current = Date.now()
    // Si el número ya no es tuyo (rotado), igual podés actualizar tu tipificación e
    // incluso finalizarla (recontactaste al cliente); la base tomará la más reciente.
    if (tipo === 'VENTA CERRADA') {
      const sel = seleccionado
      cerrarModales()
      if (sel !== null && clientes[sel]?.id) {
        const lead = clientes[sel]
        // VENTA CERRADA se confirma en el backend solo cuando el formulario
        // completo logra crear la venta. Abrir o cancelar el formulario no
        // altera la tipificación actual (por ejemplo, SIN COBERTURA).
        abrirNuevaVenta(lead)
      }
      return
    }
    if (tipo === 'PREVENTA' || tipo === 'SIN COBERTURA') {
      const sel = seleccionado
      const lead = sel !== null ? clientes[sel] : null
      cerrarModales()
      if (lead?.id) setModalEspecial({
        tipo, leadId:lead.id, tipoDoc:'DNI', documento:'',
        distrito:lead.zona === '--' ? '' : (lead.zona || ''), coordenadas:lead.coordenadas || '', guardando:false,
      })
      return
    }
    const sel = seleccionado
    if (sel !== null) {
      setClientes(prev => {
        const u = [...prev]; u[sel] = { ...u[sel], estado: tipo }; return u
      })
      if (clientes[sel]?.id) {
        const lid = clientes[sel].id
        pendTipRef.current[lid] = { ...(pendTipRef.current[lid]||{}), estado: tipo, ts: Date.now() }
        try {
          const r = await fetch(`${API}/leads/${lid}/tipif`, {
            method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ tipif_vend:tipo }),
          })
          const d = await r.json().catch(() => ({}))
          if (!r.ok || !d.ok) { delete pendTipRef.current[lid]; mostrarToast(d.mensaje || 'No se pudo tipificar') }
          else if (d.mensaje) mostrarToast(d.mensaje)
        } catch(e) {}
      }
    }
    cerrarModales()
  }

  async function guardarTipificacionEspecial() {
    if (!modalEspecial || modalEspecial.guardando) return
    const { tipo, tipoDoc, documento, distrito, coordenadas, leadId } = modalEspecial
    const body = { tipif_vend:tipo }
    if (tipo === 'PREVENTA') {
      const longitud = { DNI:8, CE:9, RUC:11 }[tipoDoc]
      if (!new RegExp(`^\\d{${longitud}}$`).test(documento))
        return mostrarToast(`${tipoDoc} debe tener exactamente ${longitud} dígitos`)
      Object.assign(body, { tipo_doc:tipoDoc, documento })
    } else {
      if (!distrito.trim()) return mostrarToast('El distrito es obligatorio')
      if (!coordenadas.trim()) return mostrarToast('Las coordenadas son obligatorias')
      Object.assign(body, { distrito:distrito.trim(), coordenadas:coordenadas.trim() })
    }
    setModalEspecial(p => ({ ...p, guardando:true }))
    try {
      const res = await fetch(`${API}/leads/${leadId}/tipif`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) return mostrarToast(data.mensaje || 'No se pudo guardar la tipificación')
      const docTexto = tipo === 'PREVENTA' ? `${tipoDoc}: ${documento}` : ''
      setClientes(prev => prev.map(c => c.id === leadId ? {
        ...c, estado:tipo,
        ...(docTexto ? { obs:conservarObsConDocumento(c.obs, docTexto) } : {}),
        ...(tipo === 'SIN COBERTURA' ? { zona:distrito.trim(), coordenadas:coordenadas.trim() } : {}),
      } : c))
      pendTipRef.current[leadId] = { estado:tipo, ts:Date.now() }
      setModalEspecial(null)
    } catch(e) { mostrarToast('Error conectando al servidor') }
    finally { setModalEspecial(p => p ? ({ ...p, guardando:false }) : p) }
  }

  async function guardarObs(id, valor) {
    ultEditRef.current = Date.now()
    const anterior = clientes.find(c => c.id === id)?.obs || ''
    setClientes(prev => prev.map(c => c.id === id ? { ...c, obs:valor } : c))
    if (!id) return
    pendTipRef.current[id] = { ...(pendTipRef.current[id]||{}), obs: valor, ts: Date.now() }
    try {
      const res = await fetch(`${API}/leads/${id}/obs`, {
        method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ obs:valor }),
      })
      const data = await res.json().catch(()=>({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar la observación')
    } catch (e) {
      delete pendTipRef.current[id]
      setClientes(prev => prev.map(c => c.id === id ? { ...c, obs:anterior } : c))
      alert(e.message || 'No se pudo guardar la observación')
    }
  }

  function conservarObsConDocumento(obsActual, docTexto) {
    const base = String(obsActual || '').trim()
    const doc = String(docTexto || '').trim()
    if (!doc) return base
    if (!base) return doc
    if (base.toUpperCase().includes(doc.toUpperCase())) return base
    return `${base} | ${doc}`
  }

  // ── Modal venta (registrar DNI) ──────────────────────────────────────────
  // ── Panel nueva / editar venta ───────────────────────────────────────────
  function abrirNuevaVenta(leadInicial = null) {
    const lead = leadInicial?.id && leadInicial?.telefono ? leadInicial : null
    setNvEditId(null); setNvLeadId(lead?.id || null)
    setNvForm(lead ? { ...NV_DEFAULT, tel1:lead.telefono } : NV_DEFAULT)
    setNvProvs([]); setNvDists([]); setNvPaquetes([])
    setNvVentasCerradas(lead ? [{ n1:lead.telefono }] : []); setNvCargandoVC(true)
    setNvTelSearch(''); setNvTelOpen(false)
    setPanelNV(true); document.body.style.overflow = 'hidden'
    fetch(`${API}/leads/ventas-cerradas`, { headers: ncHeaders() })
      .then(r => r.json())
      .then(d => { if (d.ok) setNvVentasCerradas(prev => [...new Map([...prev, ...(d.data || [])].map(v => [v.n1, v])).values()]) })
      .catch(() => {})
      .finally(() => setNvCargandoVC(false))
  }

  function cerrarNuevaVenta() {
    setPanelNV(false); document.body.style.overflow = ''
  }

  function editarVenta(i) {
    const v = ventasMostradas[i]; if (!v) return
    const form = {
      nombre:   v.nombre      || '',
      tipoDoc:  v.tipo_doc    || 'DNI',
      dni:      v.dni         || '',
      email:    v.email       || '',
      tel1:     v.telefono1   || '',
      tel2:     v.telefono2   || '',
      dpto:     v.departamento|| '',
      prov:     v.provincia   || '',
      dist:     v.distrito    || '',
      dir:      v.direccion   || '',
      coord:    v.coordenadas || '',
      fechaNac: v.fecha_nac   || '',
      lugarNac: v.lugar_nac   || '',
      padre:    v.padre       || '',
      madre:    v.madre       || '',
      cuota:    v.cuota_inst  || '',
      hogar:    v.claro_hogar || '',
      tec:      v.tecnologia  || '',
      paquete:  v.paquete     || '',
      full:     v.full_claro  || '',
      decos:    String(v.cant_decos || '0'),
      mesh:     String(v.cant_mesh  || '0'),
      plano:    v.plano       || '',
      estado:   (v.estado||'VENTA').toUpperCase() === 'PROGRAMADO' ? 'PROGRAMADO' : 'VENTA',
      obs:      v.observacion || '',
    }
    setNvEditId(v.id); setNvLeadId(null); setNvForm(form)
    const provs = form.dpto && UBIGEO[form.dpto] ? Object.keys(UBIGEO[form.dpto]) : []
    const dists = form.dpto && form.prov && UBIGEO[form.dpto]?.[form.prov] ? UBIGEO[form.dpto][form.prov] : []
    setNvProvs(provs); setNvDists(dists)
    setNvPaquetes(PAQUETES_POR_PLAN[form.hogar] || [])
    setPanelNV(true); document.body.style.overflow = 'hidden'
  }

  function nvSet(key, val) { setNvForm(p => ({ ...p, [key]: val })) }

  function nvOnDpto(dpto) {
    setNvForm(p => ({ ...p, dpto, prov:'', dist:'' }))
    setNvProvs(dpto && UBIGEO[dpto] ? Object.keys(UBIGEO[dpto]) : [])
    setNvDists([])
  }

  function nvOnProv(prov) {
    setNvForm(p => ({ ...p, prov, dist:'' }))
    setNvDists(prov && nvForm.dpto && UBIGEO[nvForm.dpto]?.[prov] ? UBIGEO[nvForm.dpto][prov] : [])
  }

  function nvOnHogar(hogar) {
    setNvForm(p => ({ ...p, hogar, paquete:'' }))
    setNvPaquetes(PAQUETES_POR_PLAN[hogar] || [])
  }

  async function guardarNuevaVenta() {
    if (!nvEditId) {
      if (!nvForm.tel1)
        return mostrarToast('Selecciona el Teléfono Contacto')
      if (!nvVentasCerradas.some(v => v.n1 === nvForm.tel1))
        return mostrarToast('El teléfono de contacto debe ser una VENTA CERRADA del día')
    } else {
      if (!nvForm.tel1.trim())
        return mostrarToast('El Teléfono Contacto es obligatorio')
      if (!/^\d+$/.test(nvForm.tel1.trim()))
        return mostrarToast('El teléfono de contacto solo puede contener números')
    }
    if (nvForm.tel2.trim() && !/^\d+$/.test(nvForm.tel2.trim()))
      return mostrarToast('El teléfono de referencia es opcional, pero si se completa debe contener únicamente números')
    if (nvForm.tel2.trim() && nvForm.tel2.trim() === nvForm.tel1.trim())
      return mostrarToast('El teléfono de referencia debe ser diferente al teléfono principal')
    const longitudDoc = { DNI:8, CE:9, RUC:11 }[nvForm.tipoDoc]
    if (!new RegExp(`^\\d{${longitudDoc}}$`).test(nvForm.dni.trim()))
      return mostrarToast(`${nvForm.tipoDoc} debe contener exactamente ${longitudDoc} dígitos`)
    if (!nvForm.nombre.trim()) return mostrarToast('El nombre es obligatorio')
    if (!nvEditId && !nvForm.email.trim()) return mostrarToast('El correo electrónico es obligatorio')
    if (nvForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nvForm.email.trim()))
      return mostrarToast('Ingresa un correo electrónico válido')
    const reNombre = /^[a-záéíóúüñA-ZÁÉÍÓÚÜÑ\s'\-]+$/
    if (!reNombre.test(nvForm.nombre.trim()))
      return mostrarToast('El nombre solo puede contener letras, tildes, espacios y guiones')
    if (nvForm.padre.trim() && !reNombre.test(nvForm.padre.trim()))
      return mostrarToast('El nombre del padre solo puede contener letras, tildes, espacios y guiones')
    if (nvForm.madre.trim() && !reNombre.test(nvForm.madre.trim()))
      return mostrarToast('El nombre de la madre solo puede contener letras, tildes, espacios y guiones')
    if (nvForm.lugarNac.trim() && !reNombre.test(nvForm.lugarNac.trim()))
      return mostrarToast('El lugar de nacimiento solo puede contener letras, tildes, espacios y guiones')
    const requeridos = [
      ['Fecha de nacimiento', nvForm.fechaNac], ['Lugar de nacimiento', nvForm.lugarNac],
      ['Nombre del padre', nvForm.padre], ['Nombre de la madre', nvForm.madre],
      ['Departamento', nvForm.dpto], ['Provincia', nvForm.prov], ['Distrito', nvForm.dist],
      ['Coordenadas', nvForm.coord], ['Dirección', nvForm.dir], ['Cuota de instalación', nvForm.cuota],
      ['Claro Hogar', nvForm.hogar], ['Tecnología', nvForm.tec], ['Paquete Real', nvForm.paquete],
      ['Full Claro', nvForm.full], ['Plano', nvForm.plano], ['Observación', nvForm.obs],
    ]
    const faltante = requeridos.find(([,valor]) => !String(valor || '').trim())
    if (faltante) return mostrarToast(`${faltante[0]} es obligatorio para cerrar la venta`)
    const body = {
      ...(!nvEditId && nvLeadId ? { leadId:nvLeadId } : {}),
      ...(!nvEditId ? { email:nvForm.email.trim() } : {}),
      tipoDoc:nvForm.tipoDoc, dni:nvForm.dni.trim(), nombre:nvForm.nombre.trim(),
      telefono1:nvForm.tel1.trim(), telefono2:nvForm.tel2.trim(),
      departamento:nvForm.dpto, provincia:nvForm.prov, distrito:nvForm.dist,
      direccion:nvForm.dir.trim(), coordenadas:nvForm.coord.trim(),
      fechaNac:nvForm.fechaNac, lugarNac:nvForm.lugarNac.trim(),
      padre:nvForm.padre.trim(), madre:nvForm.madre.trim(),
      cuotaInstalacion:nvForm.cuota, hogar:nvForm.hogar,
      tec:nvForm.tec, paquete:nvForm.paquete,
      full:nvForm.full, cantDecos:nvForm.decos, cantMesh:nvForm.mesh,
      plano:nvForm.plano.trim(), estado: nvEditId ? nvForm.estado : 'VENTA', obs:nvForm.obs.trim(),
    }
    setGuardandoNV(true)
    try {
      const url    = nvEditId ? `${API}/ventas/${nvEditId}` : `${API}/ventas`
      const method = nvEditId ? 'PATCH' : 'POST'
      const res  = await fetch(url, { method, headers:ncHeaders(), body:JSON.stringify(body) })
      let data = {}
      try {
        const ct = res.headers.get('content-type') || ''
        data = ct.includes('application/json') ? await res.json() : { ok: false, mensaje: (await res.text()) || `Error HTTP ${res.status}` }
      } catch(_) { data = { ok: false, mensaje: `Error HTTP ${res.status}` } }
      if (!res.ok || !data.ok) { mostrarToast('No se pudo guardar: ' + (data.mensaje || `Error ${res.status}`)); return }
      if (!nvEditId) {
        setNvVentasCerradas(prev => prev.filter(vc => vc.n1 !== nvForm.tel1))
        const leadId = nvLeadId || clientes.find(c => c.telefono === nvForm.tel1)?.id
        if (leadId) {
          const cliente = clientes.find(c => c.id === leadId)
          const docObs = conservarObsConDocumento(cliente?.obs, `${nvForm.tipoDoc}: ${nvForm.dni.trim()}`)
          pendTipRef.current[leadId] = { estado:'VENTA CERRADA', obs:docObs, ts:Date.now() }
          setClientes(prev => prev.map(c => c.id === leadId ? { ...c, estado:'VENTA CERRADA', obs:docObs } : c))
        }
      }
      cerrarNuevaVenta()
      await cargarVentasSubidas()
      await cargarLeadsAsesor()
    } catch(e) { mostrarToast('Error conectando al servidor') }
    finally { setGuardandoNV(false) }
  }

  // ── Fotos ─────────────────────────────────────────────────────────────────
  async function abrirFotos(i) {
    const v = ventasMostradas[i]; if (!v) return
    setModalFotos({ open:true, ventaId:v.id, nombre:v.nombre||'--' })
    try {
      const res  = await fetch(`${API}/ventas/${v.id}/fotos`, { headers:ncHeaders() })
      const data = await res.json()
      setFotos(data.ok ? data.data : [])
    } catch(e) { setFotos([]) }
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

  // ── Filtros ventas subidas ────────────────────────────────────────────────
  function buscarVentas() {
    const fil = filtroDni.toLowerCase()
    setPaginaVentas(0)
    setVentasMostradas(ventasSubidas.filter(v => {
      const ok1 = !fil   || (v.dni||'').toLowerCase().includes(fil)
      const fv   = normalizarFecha(v.created_at)
      const ok2 = !filtroDesde || fv >= filtroDesde
      const ok3 = !filtroHasta || fv <= filtroHasta
      return ok1 && ok2 && ok3
    }))
  }

  function borrarFiltros() {
    setFiltroDni(''); setFiltroDesde(''); setFiltroHasta('')
    setPaginaVentas(0)
    setVentasMostradas(ventasSubidas)
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  function handleSalir(e) {
    e.preventDefault()
    sessionStorage.removeItem('nc_dashboard_asesor_objetivo')
    sessionStorage.removeItem('nc_jefatura_usuario_objetivo')
    logout()
    navigate('/login')
  }

  function volverAJefatura() {
    sessionStorage.removeItem('nc_dashboard_asesor_objetivo')
    sessionStorage.removeItem('nc_jefatura_usuario_objetivo')
    sessionStorage.setItem('nc_jefatura_apartado', 'accesos')
    refrescarSesion()
    navigate('/jefatura')
  }

  // ── KPIs computados ───────────────────────────────────────────────────────
  const hoy           = fechaHoy()
  const vHoy          = ventasSubidas.filter(v => normalizarFecha(v.created_at) === hoy)
  const kpiLlamadas   = llamadas
  const kpiVentas     = vHoy.length

  // Instaladas y caidas: se reinician cada mes, igual que en Jefatura/Supervisor.
  // El mes de reporte lo determina la fecha PROGRAMADA (mismo criterio que
  // cicloDashboardMes en Jefatura.jsx), no la fecha de venta ni el periodo del
  // grafico: una venta vendida en agosto pero programada para septiembre debe
  // reportarse en septiembre.
  // Se cuenta por el estado ACTUAL (esVentaInstalada/esVentaCaida), no por si
  // fecha_instalado/fecha_caida existen: esos campos solo dicen que la venta
  // paso por ese estado ALGUNA VEZ en su historial. Una venta que cayo y
  // luego se reactivo (vuelve a EN_EJECUCION/TECNICO_CASA) conservaba su
  // fecha_caida vieja y se seguia contando como caida vigente; una venta que
  // cayo y despues sí se instalo llegaba a contar en ambos totales a la vez.
  const mesActual = hoy.slice(0, 7)
  const vProgramadasMes = ventasSubidas.filter(v => normalizarFecha(v.fecha_programada).slice(0, 7) === mesActual)
  const kpiInstaladas = vProgramadasMes.filter(esVentaInstalada).length
  const kpiCaidas     = vProgramadasMes.filter(esVentaCaida).length
  const totalResultado = kpiInstaladas + kpiCaidas
  const kpiEfect      = totalResultado ? Math.round(kpiInstaladas / totalResultado * 100) : 0
  const kpiPct        = Math.min(Math.round(kpiVentas / META_DIARIA * 100), 100)
  const ultimaSyncTexto = ultimaSync
    ? ultimaSync.toLocaleTimeString('es-PE', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    : '--:--:--'
  const fechaRefGrafico = new Date(`${normalizarFecha(grafHasta) || hoy}T00:00:00`)
  const mesGrafico = fechaRefGrafico.toLocaleDateString('es-PE', { month:'long', year:'numeric' })
  const anioGrafico = fechaRefGrafico.getFullYear()

  const saludoHora = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 18 ? 'Buenas tardes' : 'Buenas noches'
  const tipsFiltrados = tipSearch
    ? TIPS.filter(t => t.label.toLowerCase().includes(tipSearch.toLowerCase()))
    : TIPS

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="dash-root">
      {/* ── TOPBAR ─────────────────────────────────────────────────────── */}
      <div className="topbar">
        <div className="brand">
          <div className="logo-circle">
            <img src="/assets/logo-futura.png" alt="FUTURA" />
          </div>
          <div className="brand-text">
            <img src="/assets/futura-wordmark.png" alt="FUTURA" style={{height:22,width:"auto",display:"block"}} />
            <span className="brand-sub">Sistema de llamadas</span>
          </div>
        </div>
        <div className="tabs">
          {[
            { id:'llamadas',      label:'Llamadas' },
            { id:'rendimiento',   label:'Rendimiento' },
            { id:'ventassubidas', label:'Ventas Subidas' },
            { id:'frases',        label:'Frases' },
          ].map(t => (
            <button key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => cambiarTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="topbar-right">
          <span className="dash-usuario">
            {vistaJefatura ? `Vista de: ${asesorObjetivo.nombre}` : `${saludoHora}, ${sesion?.nombre || 'ASESOR'}`}
          </span>
          <CambiarAreaMenu />
          {vistaJefatura && <button type="button" className="topbar-salir" onClick={volverAJefatura}>Volver a Jefatura</button>}
          <a href="#" className="topbar-salir" onClick={handleSalir}>Salir</a>
        </div>
      </div>

      {/* ── LLAMADAS ───────────────────────────────────────────────────── */}
      <div className={`pantalla${tab !== 'llamadas' ? ' hidden' : ''}`}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
          <h2 style={{marginBottom:0}}>Base de llamadas</h2>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <input value={filtroNumero} onChange={e=>setFiltroNumero(e.target.value.replace(/\s+/g,''))}
              placeholder="Filtrar número..." inputMode="numeric"
              style={{width:180,padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:9,fontSize:12}} />
            <span style={{fontSize:'12px',color:'#9ca3af',fontWeight:600,background:'#fff',padding:'5px 12px',borderRadius:'20px',border:'1px solid #e5e7eb'}}>
              {fechaHoyFormateada()}
            </span>
          </div>
        </div>
        <div className="tabla-crm-wrap">
        <table className="tabla-crm tabla-leads-asesor">
          <thead>
            <tr>
              <th>Teléfono</th><th>Teléfono 2</th><th>Usuario WhatsApp</th><th>Obs. Back</th><th>Tipificación</th>
              <th>Estado</th><th>Observación asesor</th><th>Zona</th>
              <th>Dirección / Coord.</th><th>Hora asig.</th>
            </tr>
          </thead>
          <tbody>
            {clientes.filter(c => !filtroNumero || `${c.telefono} ${c.telefono2} ${c.usuarioWhatsapp}`.toLowerCase().includes(filtroNumero.toLowerCase())).length === 0 ? (
              <tr>
                <td colSpan={10} style={{textAlign:'center',padding:'40px',color:'#9ca3af',fontSize:'13px'}}>
                  Esperando asignación de Back Data...<br />
                  <span style={{fontSize:'11px',marginTop:'6px',display:'block'}}>Back Data asignará registros a tu usuario.</span>
                </td>
              </tr>
            ) : clientes.filter(c => !filtroNumero || `${c.telefono} ${c.telefono2} ${c.usuarioWhatsapp}`.toLowerCase().includes(filtroNumero.toLowerCase())).map((c) => (
              <tr key={c.id}>
                <td>{c.telefono ? <div><div className="dash-numero-copiar"><span>{c.telefono}</span><button type="button" onClick={()=>copiarNumero(c.telefono)} title="Copiar teléfono" aria-label={`Copiar ${c.telefono}`}><CopyIcon /></button></div>{c.instanciaTipo==='OTRA_DIRECCION'&&<span style={{display:'inline-block',marginTop:3,padding:'2px 6px',borderRadius:999,background:'#ede9fe',color:'#6d28d9',fontSize:9,fontWeight:800}}>OTRA DIRECCIÓN{c.instanciaVentaNumero?` · ${c.instanciaVentaNumero}`:''}</span>}</div> : '--'}</td>
                <td>{c.telefono2 ? <div className="dash-numero-copiar secundario"><span>{c.telefono2}</span><button type="button" onClick={()=>copiarNumero(c.telefono2)} title="Copiar teléfono 2" aria-label={`Copiar ${c.telefono2}`}><CopyIcon /></button></div> : '--'}</td>
                <td>{c.usuarioWhatsapp ? <div className="dash-numero-copiar secundario"><span>@{c.usuarioWhatsapp}</span><button type="button" onClick={()=>copiarNumero(c.usuarioWhatsapp)} title="Copiar usuario de WhatsApp" aria-label={`Copiar ${c.usuarioWhatsapp}`}><CopyIcon /></button></div> : '--'}</td>
                <td><span className="dash-obs-back" title={c.obsBack}>{c.obsBack || '--'}</span></td>
                <td>
                  <button className="btn-accion" onClick={() => abrirModalTip(clientes.findIndex(x => x.id === c.id))} title="Tipificar">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="rgba(255,255,255,0.25)" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
                      <path d="M14 2v4h4" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
                      <path d="M9 17l1.5-1.5 3-3-1.5-1.5-3 3L9 17z" fill="#fff"/>
                      <path d="M13.5 12.5l1-1a1 1 0 0 0-1.5-1.5l-1 1 1.5 1.5z" fill="#fff"/>
                    </svg>
                  </button>
                </td>
                <td><span className={`badge-estado ${colorEstado(c.estado)}`} title={c.estado==='DERIVADO'&&c.derivadoPor?`Derivado por ${c.derivadoPor}`:''}>{c.estado==='DERIVADO'&&c.derivadoPor?`DER. ${c.derivadoPor.trim().split(/\s+/)[0].toUpperCase()}`:c.estado}</span></td>
                <td>
                  <input
                    className="input-obs"
                    placeholder="Escribe una observación..."
                    maxLength={200}
                    value={c.obs || ''}
                    onFocus={() => { ultEditRef.current = Date.now() }}
                    onChange={e => { ultEditRef.current = Date.now(); setClientes(prev => prev.map(x => x.id === c.id ? { ...x, obs:e.target.value } : x)) }}
                    onBlur={e => guardarObs(c.id, e.target.value)}
                  />
                </td>
                <td>{c.zona}</td>
                <td><div className="dash-ubicacion"><span>{c.direccion || '--'}</span>{c.coordenadas && <small>{c.coordenadas}</small>}</div></td>
                <td style={{fontSize:'11px',color:'#9ca3af'}}>{c.horaAsig || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* ── RENDIMIENTO ────────────────────────────────────────────────── */}
      <div className={`pantalla${tab !== 'rendimiento' ? ' hidden' : ''}`}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px',flexWrap:'wrap',gap:'12px'}}>
          <div>
            <h2 style={{marginBottom:'5px'}}>Mi rendimiento</h2>
            <span style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'11px',fontWeight:700,color:'#16a34a'}}>
              <span style={{width:'7px',height:'7px',borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 0 4px rgba(34,197,94,.12)'}} />
              En vivo · actualizado {ultimaSyncTexto}
            </span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'8px',background:'#fff',padding:'10px 14px',borderRadius:'12px',border:'1px solid #e5e7eb',flexWrap:'wrap'}}>
            <span style={{fontSize:'11px',fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.3px'}}>Período:</span>
            <input type="date" value={grafDesde} onChange={e => { setGrafDesde(e.target.value); grafRef.current.desde = e.target.value }}
              style={{padding:'5px 8px',border:'1px solid #e5e7eb',borderRadius:'7px',fontSize:'12px',fontFamily:'inherit',outline:'none'}} />
            <span style={{fontSize:'11px',color:'#9ca3af'}}>hasta</span>
            <input type="date" value={grafHasta} onChange={e => { setGrafHasta(e.target.value); grafRef.current.hasta = e.target.value }}
              style={{padding:'5px 8px',border:'1px solid #e5e7eb',borderRadius:'7px',fontSize:'12px',fontFamily:'inherit',outline:'none'}} />
            <button onClick={aplicarFiltroGrafico}
              style={{padding:'5px 12px',border:'none',borderRadius:'7px',background:'#111827',color:'#fff',fontSize:'11px',fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>
              Aplicar
            </button>
            <button onClick={() => {
              const h = fechaHoy(); setGrafDesde(h); setGrafHasta(h)
              grafRef.current = { desde:h, hasta:h }
              setTimeout(() => sincronizarGraficos(ventasRef.current), 0)
            }}
              style={{padding:'5px 10px',border:'1px solid #e5e7eb',borderRadius:'7px',background:'#fff',color:'#6b7280',fontSize:'11px',fontWeight:600,fontFamily:'inherit',cursor:'pointer'}}>
              Hoy
            </button>
          </div>
        </div>

        <div className="rend-kpis">
          <div className="rend-kpi rend-kpi-azul">   <div className="rend-kpi-icon" /><div className="rend-kpi-valor">{kpiLlamadas}</div>   <div className="rend-kpi-label">Contactos gestionados hoy</div></div>
          <div className="rend-kpi rend-kpi-verde">  <div className="rend-kpi-icon" /><div className="rend-kpi-valor">{kpiVentas}</div>     <div className="rend-kpi-label">Ventas hoy</div></div>
          <div className="rend-kpi rend-kpi-morado"> <div className="rend-kpi-icon" /><div className="rend-kpi-valor">{kpiInstaladas}</div> <div className="rend-kpi-label">Instaladas</div></div>
          <div className="rend-kpi rend-kpi-naranja"><div className="rend-kpi-icon" /><div className="rend-kpi-valor">{kpiEfect}%</div>     <div className="rend-kpi-label">Efectividad</div></div>
          <div className="rend-kpi rend-kpi-rojo">   <div className="rend-kpi-icon" /><div className="rend-kpi-valor">{kpiCaidas}</div>     <div className="rend-kpi-label">Caídas</div></div>
        </div>

        <div className="rend-meta">
          <div className="rend-meta-texto"><span>Meta del día:</span><strong>{kpiVentas} / {META_DIARIA} ventas</strong></div>
          <div className="rend-meta-barra-wrap"><div className="rend-meta-barra" style={{width:`${kpiPct}%`}} /></div>
          <span className="rend-meta-pct">{kpiPct}%</span>
        </div>

        <div className="rend-graficos">
          <div className="rend-card">
            <div className="rend-card-title">Ventas diarias · período seleccionado</div>
            <div className="rend-chart-wrap"><canvas ref={canvasDiario} /></div>
          </div>
          <div className="rend-card">
            <div className="rend-card-title">Semanas del mes · {mesGrafico}</div>
            <div className="rend-chart-wrap"><canvas ref={canvasSemanal} /></div>
          </div>
          <div className="rend-card rend-card-full">
            <div className="rend-card-title">Ventas mensuales · {anioGrafico}</div>
            <div className="rend-chart-wrap"><canvas ref={canvasMensual} /></div>
          </div>
        </div>
      </div>

      {/* ── VENTAS SUBIDAS ─────────────────────────────────────────────── */}
      <div className={`pantalla${tab !== 'ventassubidas' ? ' hidden' : ''}`}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'10px'}}>
          <div>
            <h2 style={{marginBottom:'4px'}}>Ventas Subidas</h2>
            <p style={{fontSize:'12px',color:'#9ca3af'}}>Historial de ventas</p>
          </div>
        </div>

        <div className="vs-filtros">
          <div className="vs-filtros-grid">
            <div className="vs-filtro-row">
              <label>DNI / Documento</label>
              <input type="text" className="vs-input" placeholder="Buscar DNI..."
                value={filtroDni} onChange={e => setFiltroDni(e.target.value)} />
            </div>
            <div className="vs-filtro-row">
              <label>Fecha</label>
              <span className="vs-label-desde">Desde</span>
              <input type="date" className="vs-input-fecha" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} />
              <span className="vs-label-desde">Hasta</span>
              <input type="date" className="vs-input-fecha" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} />
            </div>
          </div>
          <div className="vs-filtros-acciones">
            <button className="vs-btn vs-btn-buscar"    onClick={buscarVentas}>Buscar</button>
            <button className="vs-btn vs-btn-borrar"    onClick={borrarFiltros}>× Borrar Filtros</button>
            <button className="vs-btn vs-btn-refrescar" onClick={cargarVentasSubidas}>Refrescar</button>
          </div>
        </div>

        <div className="vs-barra-info"><span>{ventasMostradas.length} registros</span></div>

        {(() => {
          const VENTAS_POR_PAGINA = 100
          const totalPaginasVentas = Math.max(1, Math.ceil(ventasMostradas.length / VENTAS_POR_PAGINA))
          const paginaVentasSegura = Math.min(paginaVentas, totalPaginasVentas - 1)
          const inicioVentas = paginaVentasSegura * VENTAS_POR_PAGINA
          const ventasPagina = ventasMostradas.slice(inicioVentas, inicioVentas + VENTAS_POR_PAGINA)
          return (
        <>
        <div className="vs-tabla-wrap">
          <table className="vs-tabla">
            <thead>
              <tr>
                <th>Estado</th><th>Obs. Seguimiento</th><th>Fecha Programada</th><th>Fecha</th><th>Nombre y Apellidos</th>
                <th>Tipo Doc.</th><th>DNI</th><th>Tel. Contacto</th><th>Tel. Referencia</th>
                <th>Departamento</th><th>Provincia</th><th>Distrito</th>
                <th>Dirección</th><th>Coordenadas</th>
                <th>F. Nacimiento</th><th>Lugar Nac.</th><th>Padre</th><th>Madre</th>
                <th>Cuota Inst.</th><th>Claro Hogar</th><th>Tecnología</th>
                <th>Paquete</th><th>Full Claro</th>
                <th>Decos</th><th>Mesh</th><th>Plano</th>
                <th>Vendedor</th><th>Supervisor</th><th>Observación</th>
                <th style={{minWidth:'130px'}}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {ventasMostradas.length === 0 ? (
                <tr className="vs-empty"><td colSpan={30}>Sin registros. Usa los filtros para buscar.</td></tr>
              ) : ventasPagina.map((v, iLocal) => {
                const i = inicioVentas + iLocal
                return (
                <tr key={v.id || i}>
                  <td><BadgeVS e={v.estado} sup={v.estado_supgrab || v.estado_grab} estadoGrab={v.estado_grab} grabandoPorNombre={v.grabando_por_nombre} /></td>
                  <td><ObsSeguimientoCell
                    tramo={(v.estado_supgrab||'').toLowerCase()==='conforme' ? v.tramo_seguimiento : ''}
                    comentario={(v.estado_supgrab||'').toLowerCase()==='conforme' ? v.obs_seguimiento : ''}
                    motivo={(v.estado_supgrab||'').toLowerCase()==='conforme' ? v.motivo_seguimiento : ''}
                    expandible
                  /></td>
                  <td><ProgramacionInfoCell fecha={(v.estado_supgrab||'').toLowerCase()==='conforme' ? v.fecha_programada : ''} soloFecha /></td>
                  <td style={{fontSize:'11px',color:'#185FA5',fontWeight:700}}>{normalizarFecha(v.created_at) || '-'}</td>
                  <td style={{fontWeight:600,minWidth:'160px'}}>{v.nombre||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.tipo_doc||'DNI'}</td>
                  <td style={{fontFamily:'monospace',fontSize:'11px'}}>{v.dni||'-'}</td>
                  <td style={{fontFamily:'monospace',color:'#185FA5',fontWeight:700}}>{v.telefono1||'-'}</td>
                  <td style={{fontFamily:'monospace',fontSize:'11px'}}>{v.telefono2||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.departamento||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.provincia||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.distrito||'-'}</td>
                  <td style={{fontSize:'11px',minWidth:'140px'}}>{v.direccion||'-'}</td>
                  <td style={{fontSize:'10px',color:'#9ca3af'}}>{v.coordenadas||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.fecha_nac||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.lugar_nac||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.padre||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.madre||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.cuota_inst||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.claro_hogar||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.tecnologia||'-'}</td>
                  <td style={{fontSize:'11px',minWidth:'180px'}}>{v.paquete||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.full_claro||'-'}</td>
                  <td style={{textAlign:'center'}}>{v.cant_decos||'0'}</td>
                  <td style={{textAlign:'center'}}>{v.cant_mesh||'0'}</td>
                  <td style={{fontSize:'11px'}}>{v.plano||'-'}</td>
                  <td style={{fontWeight:600,color:'#7C3AED',fontSize:'11px'}}>{v.asesor_nombre||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.supervisor||'-'}</td>
                  <td style={{fontSize:'11px',color:'#6b7280',minWidth:'140px'}}>{v.observacion||'-'}</td>
                  <td>
                    <div className="vs-acciones-cell">
                      <button className="vs-btn-accion vs-btn-editar" onClick={() => editarVenta(i)}>Editar</button>
                      <button className="vs-btn-accion vs-btn-fotos"  onClick={() => abrirFotos(i)}>Fotos</button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {totalPaginasVentas > 1 && (
          <div className="vs-paginacion" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:'10px 0'}}>
            <button type="button" className="vs-btn" disabled={paginaVentasSegura === 0}
              onClick={() => setPaginaVentas(p => Math.max(0, p - 1))}>‹ Anterior</button>
            <span style={{fontSize:12,color:'#6b7280'}}>Página {paginaVentasSegura + 1} de {totalPaginasVentas}</span>
            <button type="button" className="vs-btn" disabled={paginaVentasSegura >= totalPaginasVentas - 1}
              onClick={() => setPaginaVentas(p => Math.min(totalPaginasVentas - 1, p + 1))}>Siguiente ›</button>
          </div>
        )}
        </>
          )
        })()}
      </div>

      {/* ── FRASES ─────────────────────────────────────────────────────── */}
      <div className={`pantalla${tab !== 'frases' ? ' hidden' : ''}`}>
        <div className="frases-header">
          <h2>Frases del día</h2>
          <span className="frases-sub">Mensajes de tu supervisor para hoy</span>
        </div>
        {frases.length === 0 ? (
          <div style={{textAlign:'center',padding:'60px 24px',color:'#9ca3af'}}>
            <div style={{fontSize:'15px',fontWeight:600,color:'#374151',marginBottom:'6px'}}>Sin mensajes por ahora</div>
            <div style={{fontSize:'13px',lineHeight:1.5}}>Tu supervisor aún no ha publicado mensajes hoy.</div>
          </div>
        ) : (
          <>
            <div className="frase-destacada">
              <div className="frase-comilla">"</div>
              <p className="frase-texto">{frases[0].texto}</p>
              <div className="frase-autor">— {frases[0].supervisor_nombre || 'Tu supervisor'}</div>
            </div>
            {frases.length > 1 && (
              <div className="frases-grid">
                {frases.slice(1).map((f, i) => (
                  <div key={i} className="frase-card">
                    <div className="frase-card-num">#{i + 1}</div>
                    <div className="frase-card-texto">{f.texto}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── MODAL TIPIFICACIÓN ─────────────────────────────────────────── */}
      {modalTip && (
        <div className="modal show">
          <div className="tip-modal">
            <div className="tip-modal-header">
              <div className="tip-modal-title">TIPIFICAR LLAMADA</div>
              <button className="tip-modal-close" onClick={cerrarModales}>×</button>
            </div>
            <div className="tip-search-wrap">
              <input type="text" className="tip-search" placeholder="Buscar tipificación..."
                value={tipSearch} onChange={e => setTipSearch(e.target.value)} autoFocus />
            </div>
            <div className="tip-grid">
              {tipsFiltrados.map(t => (
                <button key={t.label} className={`tip-chip ${t.cls}`} onClick={() => tipificar(t.label)}>
                  {t.label}
                </button>
              ))}
            </div>
            <button className="tip-cancelar" onClick={cerrarModales}>CANCELAR</button>
          </div>
        </div>
      )}

      {/* ── MODAL REGISTRAR VENTA (DNI) ────────────────────────────────── */}
      {/* ── PANEL NUEVA / EDITAR VENTA ─────────────────────────────────── */}
      {modalEspecial && (
        <div className="modal show">
          <div className="modal-content tip-datos-modal">
            <h3>{modalEspecial.tipo}</h3>
            {modalEspecial.tipo === 'PREVENTA' ? (
              <>
                <label>Tipo de documento</label>
                <select value={modalEspecial.tipoDoc} onChange={e=>setModalEspecial(p=>({...p,tipoDoc:e.target.value,documento:''}))}>
                  <option value="DNI">DNI</option>
                  <option value="CE">CE</option>
                  <option value="RUC">RUC</option>
                </select>
                <label>Número de documento</label>
                <input value={modalEspecial.documento} inputMode="numeric"
                  maxLength={{DNI:8,CE:9,RUC:11}[modalEspecial.tipoDoc]}
                  onChange={e=>setModalEspecial(p=>({...p,documento:e.target.value.replace(/\D/g,'')}))}/>
              </>
            ) : (
              <>
                <label>Distrito</label>
                <input value={modalEspecial.distrito} onChange={e=>setModalEspecial(p=>({...p,distrito:e.target.value}))}/>
                <label>Coordenadas</label>
                <input value={modalEspecial.coordenadas} placeholder="-12.000000, -77.000000"
                  onChange={e=>setModalEspecial(p=>({...p,coordenadas:e.target.value}))}/>
              </>
            )}
            <button onClick={guardarTipificacionEspecial} disabled={modalEspecial.guardando}>{modalEspecial.guardando?'Guardando...':'Confirmar'}</button>
            <button className="btn-cancelar" onClick={()=>setModalEspecial(null)} disabled={modalEspecial.guardando}>Cancelar</button>
          </div>
        </div>
      )}

      <div className={`nv-overlay${panelNV ? ' open' : ''}`}>
        <div className="nv-modal">
          <div className="nv-header">
            <div className="nv-header-left">
              <div className="nv-icon">NV</div>
              <div>
                <div className="nv-title">{nvEditId ? 'Editar Venta' : 'Nueva Venta'}</div>
                <div className="nv-subtitle">{nvEditId ? 'Modifica los datos y guarda' : 'Completa todos los datos del cliente'}</div>
              </div>
            </div>
            <button className="nv-close" onClick={cerrarNuevaVenta}>×</button>
          </div>

          <div className="nv-body">
            {/* Personales */}
            <div className="nv-section">
              <div className="nv-section-title">Personales</div>
              <div className="nv-grid nv-grid-1 nv-full">
                <div className="nv-field nv-full">
                  <label className="nv-label">Nombres y Apellidos <span>*</span></label>
                  <input className="nv-input" placeholder="Nombres y apellidos completos"
                    value={nvForm.nombre} onChange={e => nvSet('nombre', e.target.value)} />
                </div>
              </div>
              <div className="nv-grid nv-grid-3" style={{marginTop:'12px'}}>
                <div className="nv-field">
                  <label className="nv-label">Tipo de Documento</label>
                  <select className="nv-select" value={nvForm.tipoDoc} onChange={e => nvSet('tipoDoc', e.target.value)}>
                    <option value="DNI">DNI</option>
                    <option value="CE">Carnet de Extranjería</option>
                    <option value="RUC">RUC</option>
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">
                    {nvForm.tipoDoc === 'DNI' ? 'Número DNI' : nvForm.tipoDoc === 'CE' ? 'Número Carnet Extranjería' : 'Número RUC'} <span>*</span>
                  </label>
                  <input className="nv-input" placeholder="Número de documento" maxLength={{DNI:8,CE:9,RUC:11}[nvForm.tipoDoc]||15} inputMode="numeric" pattern="[0-9]*" style={{fontFamily:'monospace'}}
                    value={nvForm.dni} onChange={e => nvSet('dni', e.target.value.replace(/\D/g, ''))} />
                </div>
                <div className="nv-field">
                  <label className="nv-label">Fecha de Nacimiento</label>
                  <input className="nv-input" type="date" value={nvForm.fechaNac} onChange={e => nvSet('fechaNac', e.target.value)} />
                </div>
                <div className="nv-field">
                  <label className="nv-label">Lugar de Nacimiento</label>
                  <input className="nv-input" placeholder="Ciudad / Región" value={nvForm.lugarNac} onChange={e => nvSet('lugarNac', e.target.value)} />
                </div>
                <div className="nv-field">
                  <label className="nv-label">Nombres del Padre</label>
                  <input className="nv-input" placeholder="Nombres del padre" value={nvForm.padre} onChange={e => nvSet('padre', e.target.value)} />
                </div>
                <div className="nv-field">
                  <label className="nv-label">Nombres de la Madre</label>
                  <input className="nv-input" placeholder="Nombres de la madre" value={nvForm.madre} onChange={e => nvSet('madre', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Contacto y Ubicación */}
            <div className="nv-section">
              <div className="nv-section-title">Contacto y Ubicación</div>
              <div className="nv-grid nv-grid-2">
                <div className="nv-field" ref={nvTelRef} style={{position:'relative'}}>
                  <label className="nv-label">Teléfono Contacto <span>*</span></label>
                  {!nvEditId ? (
                    <>
                      <div
                        className="nv-tel-display"
                        onClick={() => setNvTelOpen(o => !o)}
                        tabIndex={0}
                        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setNvTelOpen(o => !o)}
                      >
                        {nvForm.tel1 ? nvForm.tel1 : <span className="nv-tel-placeholder">Seleccionar número...</span>}
                        <span className="nv-tel-arrow">{nvTelOpen ? '▲' : '▼'}</span>
                      </div>
                      {nvTelOpen && (
                        <div className="nv-tel-dropdown">
                          <input
                            className="nv-tel-search"
                            placeholder="Buscar número..."
                            value={nvTelSearch}
                            onChange={e => setNvTelSearch(e.target.value)}
                            autoFocus
                          />
                          {nvCargandoVC ? (
                            <div className="nv-tel-msg">Cargando...</div>
                          ) : nvVentasCerradas.length === 0 ? (
                            <div className="nv-tel-msg">No tienes números con VENTA CERRADA disponibles el día de hoy.</div>
                          ) : nvVentasCerradas.filter(v => !nvTelSearch || String(v.n1).includes(nvTelSearch)).length === 0 ? (
                            <div className="nv-tel-msg">Sin coincidencias.</div>
                          ) : (
                            nvVentasCerradas
                              .filter(v => !nvTelSearch || String(v.n1).includes(nvTelSearch))
                              .map(v => (
                                <div key={v.n1} className="nv-tel-option"
                                  onMouseDown={e => { e.preventDefault(); nvSet('tel1', v.n1); setNvTelOpen(false); setNvTelSearch('') }}>
                                  <span className="nv-tel-num">{v.n1}</span>
                                  <span className="nv-tel-badge">VENTA CERRADA</span>
                                </div>
                              ))
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <input className="nv-input" placeholder="9XXXXXXXX" maxLength={12} style={{fontFamily:'monospace'}}
                      value={nvForm.tel1} onChange={e => nvSet('tel1', e.target.value.replace(/\D/g, ''))} />
                  )}
                </div>
                <div className="nv-field">
                  <label className="nv-label">Teléfono Referencia</label>
                  <input className="nv-input" placeholder="9XXXXXXXX" maxLength={12} style={{fontFamily:'monospace'}}
                    value={nvForm.tel2} onChange={e => nvSet('tel2', e.target.value.replace(/\D/g, ''))} />
                </div>
                <div className="nv-field">
                  <label className="nv-label">Correo Electrónico {!nvEditId && <span>*</span>}</label>
                  <input className="nv-input" type="email" placeholder="cliente@correo.com" maxLength={150}
                    value={nvForm.email} disabled={Boolean(nvEditId)}
                    onChange={e => nvSet('email', e.target.value)} />
                </div>
                <div className="nv-field">
                  <label className="nv-label">Departamento</label>
                  <select className="nv-select" value={nvForm.dpto} onChange={e => nvOnDpto(e.target.value)}>
                    <option value="">Seleccionar departamento</option>
                    {Object.keys(UBIGEO).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">Provincia</label>
                  <select className="nv-select" value={nvForm.prov} onChange={e => nvOnProv(e.target.value)}>
                    <option value="">Seleccionar provincia</option>
                    {nvProvs.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">Distrito</label>
                  <select className="nv-select" value={nvForm.dist} onChange={e => nvSet('dist', e.target.value)}>
                    <option value="">Seleccionar distrito</option>
                    {nvDists.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">Coordenadas</label>
                  <input className="nv-input" placeholder="-12.000000, -77.000000" style={{fontFamily:'monospace'}}
                    value={nvForm.coord} onChange={e => nvSet('coord', e.target.value)} />
                </div>
                <div className="nv-field nv-full">
                  <label className="nv-label">Dirección</label>
                  <input className="nv-input" placeholder="Dirección completa"
                    value={nvForm.dir} onChange={e => nvSet('dir', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Servicio */}
            <div className="nv-section">
              <div className="nv-section-title">Datos del Servicio</div>
              <div className="nv-grid nv-grid-3">
                <div className="nv-field">
                  <label className="nv-label">Cuota Instalación</label>
                  <select className="nv-select" value={nvForm.cuota} onChange={e => nvSet('cuota', e.target.value)}>
                    <option value="">Seleccionar</option>
                    <option>S/. 0 SOLES</option>
                    <option>S/. 120 SOLES</option>
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">Claro Hogar</label>
                  <select className="nv-select" value={nvForm.hogar} onChange={e => nvOnHogar(e.target.value)}>
                    <option value="">Seleccionar</option>
                    {Object.keys(PAQUETES_POR_PLAN).map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">Tecnología</label>
                  <select className="nv-select" value={nvForm.tec} onChange={e => nvSet('tec', e.target.value)}>
                    <option value="">Seleccionar</option>
                    <option>FTTH</option>
                    <option>HFC</option>
                  </select>
                </div>
                <div className="nv-field nv-full">
                  <label className="nv-label">Paquete Real</label>
                  <select className="nv-select" value={nvForm.paquete} onChange={e => nvSet('paquete', e.target.value)}>
                    <option value="">Seleccionar</option>
                    {nvPaquetes.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">Full Claro</label>
                  <select className="nv-select" value={nvForm.full} onChange={e => nvSet('full', e.target.value)}>
                    <option value="">Seleccionar</option>
                    <option>Si</option>
                    <option>No</option>
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">Cantidad Decos</label>
                  <select className="nv-select" value={nvForm.decos} onChange={e => nvSet('decos', e.target.value)}>
                    {[0,1,2,3,4,5].map(n => <option key={n} value={String(n)}>{n}</option>)}
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">Cantidad Mesh</label>
                  <select className="nv-select" value={nvForm.mesh} onChange={e => nvSet('mesh', e.target.value)}>
                    {[0,1,2,3,4,5].map(n => <option key={n} value={String(n)}>{n}</option>)}
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">Plano</label>
                  <input className="nv-input" placeholder="Código de plano"
                    value={nvForm.plano} onChange={e => nvSet('plano', e.target.value)} />
                </div>
                <div className="nv-field">
                  <label className="nv-label">Estado Venta</label>
                  {!nvEditId ? (
                    <div className="nv-estado-badge">VENTA</div>
                  ) : (
                    <select className="nv-select" value={nvForm.estado} onChange={e => nvSet('estado', e.target.value)}>
                      <option value="VENTA">VENTA</option>
                      {nvForm.estado === 'PROGRAMADO' && <option value="PROGRAMADO">PROGRAMADO</option>}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Observación */}
            <div className="nv-section">
              <div className="nv-field">
                <textarea className="nv-textarea" placeholder="Observaciones adicionales sobre la venta..."
                  value={nvForm.obs} onChange={e => nvSet('obs', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="nv-footer">
            <button className="nv-btn-cancel" onClick={cerrarNuevaVenta}>Cancelar</button>
            <button className="nv-btn-save" onClick={guardarNuevaVenta} disabled={guardandoNV}>
              {guardandoNV ? 'Guardando...' : 'Guardar Venta'}
            </button>
          </div>
        </div>
      </div>

      {/* ── TOAST ─────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position:'fixed', bottom:'28px', left:'50%', transform:'translateX(-50%)',
          background:'#1f2937', color:'#fff', padding:'12px 24px',
          borderRadius:'12px', fontSize:'13px', fontWeight:600,
          boxShadow:'0 8px 24px rgba(0,0,0,.3)', zIndex:9999,
          maxWidth:'90vw', textAlign:'center', pointerEvents:'none',
          whiteSpace:'pre-wrap',
        }}>
          {toast}
        </div>
      )}

      {/* ── MODAL FOTOS ────────────────────────────────────────────────── */}
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

    </div>
  )
}
