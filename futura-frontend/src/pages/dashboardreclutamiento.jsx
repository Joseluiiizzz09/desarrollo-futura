import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { API, ncHeaders } from '../services/api'
import { responseChanged, setVisibleInterval, clearVisibleInterval } from '../utils/polling'
import ObsSeguimientoCell from '../components/ObsSeguimientoCell'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import '../styles/dashboardreclutamiento.css'

// ─── Constantes ─────────────────────────────────────────────────────────────
const META_DIARIA = 5

// value interno se conserva igual al de Backoffice comercial (VENTA CERRADA/NO TOCAR/FRAUDE)
// para heredar el mismo comportamiento (modal de venta, badges); solo cambia el label visible.
const TIPS = [
  { value: 'VENTA CERRADA', label: 'Acepta propuesta', cls: 'tip-venta' },
  { value: 'NO CONTESTA',   label: 'No contesta',       cls: 'tip-nocontesta' },
  { value: 'CORTA LLAMADA', label: 'Corta llamada',     cls: 'tip-corta' },
  { value: 'AGENDADO',      label: 'Agendado',          cls: 'tip-agendado' },
  { value: 'NO TOCAR',      label: 'No cumple perfil',  cls: 'tip-destructivo' },
  { value: 'FRAUDE',        label: 'Provincia',         cls: 'tip-destructivo' },
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
  nombre:'', tipoDoc:'DNI', dni:'', tel1:'', tel2:'',
  dist:'', empresa:'',
  puesto:'', fuente:'', fuenteOtro:'', experiencia:'', disponibilidad:'',
  estadoReclu:'NUEVO', fechaEntrevista:'', horaEntrevista:'', obs:'',
}

const PUESTOS_RECLU = ['Asesor de Ventas','Back Office','Validación','Grabaciones','Supervisor','Programación','Seguimiento','Otros']
// Se mantiene el identificador interno "fuente" para no tocar el payload/backend;
// el label visible y sus opciones ahora corresponden a "Campaña de Reclutamiento".
const FUENTES_RECLU = ['R3','R4','R5','CHANCAY']
const EMPRESAS_RECLU = ['CLARO','WIN']
const EXPERIENCIA_RECLU = ['Sin experiencia','Menos de 3 meses','3 a 6 meses','6 meses a 1 año','Más de 1 año']
const DISPONIBILIDAD_RECLU = ['Inmediata','Esta semana','Próxima semana','Otra fecha']
// RECLUTADO = estado final que marca a un postulante como ya reclutado; no
// existía ningún estado equivalente previo (se revisó el catálogo real antes
// de agregarlo). Alimenta el tab "Reclutados" (filtra por este mismo valor,
// sin duplicar el registro del postulante).
const ESTADOS_RECLU = ['NUEVO', 'RECLUTADO']
const LIMA_DISTRITOS = [
  'Ancón','Ate','Barranco','Breña','Carabayllo','Cercado de Lima','Chaclacayo','Chorrillos',
  'Cieneguilla','Comas','El Agustino','Independencia','Jesús María','La Molina','La Victoria',
  'Lima','Lince','Los Olivos','Lurigancho','Lurín','Magdalena del Mar','Miraflores','Pachacámac',
  'Pucusana','Pueblo Libre','Puente Piedra','Punta Hermosa','Rímac','San Bartolo','San Borja',
  'San Isidro','San Juan de Lurigancho','San Juan de Miraflores','San Luis','San Martín de Porres',
  'San Miguel','Santa Anita','Santa María del Mar','Santa Rosa','Santiago de Surco','Surquillo',
  'Villa El Salvador','Villa María del Triunfo',
]

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
  return String(venta?.estado || '').trim().toUpperCase() === 'INSTALADO'
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
    'NO DESEA':'estado-no-desea','BUZON DE VOZ':'estado-buzon-voz','NUEVO':'estado-nuevo',
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
      const label = grabandoPorNombre ? `GRABANDO ${grabandoPorNombre.toUpperCase()}` : 'GRABANDO'
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
    // PROGRAMADO (estado real de Programación, sin cambios en BD) se
    // muestra públicamente como EN EJECUCIÓN — reutiliza exactamente la
    // misma clase/label que ya existe para 'en_ejecucion', no un color nuevo.
    'programado':    { cls:'vs-badge-ejecucion',   label:'EN EJECUCION' },
    'bloqueado':     { cls:'vs-badge-bloqueado',   label:'BLOQUEADO' },
    'sin_agenda':    { cls:'vs-badge-sinagenda',   label:'SIN AGENDA' },
    'caracter_especial': { cls:'vs-badge-caracterespecial', label:'CARÁCTER ESPECIAL' },
    'zona_restringida':  { cls:'vs-badge-zonarestringida',  label:'ZONA RESTRINGIDA' },
    'en_ejecucion':  { cls:'vs-badge-ejecucion',   label:'EN EJECUCION' },
    'tecnico_casa':  { cls:'vs-badge-tecnico',     label:'TECNICO EN CASA' },
    'rechazo_campo': { cls:'vs-badge-rechazocampo', label:'RECHAZO EN CAMPO' },
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

// ─── Componente principal ────────────────────────────────────────────────────
export default function DashboardReclutamiento() {
  const { sesion, logout } = useAuth()
  const navigate = useNavigate()
  const [asesorObjetivo] = useState(() => {
    try {
      const objetivo = JSON.parse(sessionStorage.getItem('nc_dashboard_asesor_objetivo') || 'null')
      return objetivo?.cargo === 'asesor' ? objetivo : null
    } catch { return null }
  })
  const vistaJefatura = Boolean((sesion?._actorJefatura || sesion?.cargo === 'jefatura') && asesorObjetivo?.id)
  const filtroAsesor = vistaJefatura ? `?asesor_id=${encodeURIComponent(asesorObjetivo.id)}` : ''

  // Tab
  const [tab, setTab] = useState(() => sessionStorage.getItem('nc_dashboard_apartado') || 'llamadas')

  // Datos
  const [clientes,        setClientes]        = useState([])
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

  // Modal venta (registrar DNI)
  const [modalVenta, setModalVenta] = useState(false)
  const [mvTipoDoc,  setMvTipoDoc]  = useState('DNI')
  const [mvDni,      setMvDni]      = useState('')
  const [mvDniError, setMvDniError] = useState(false)

  // Panel nueva / editar venta
  const [panelNV,     setPanelNV]     = useState(false)
  const [nvEditId,    setNvEditId]    = useState(null)
  const [nvForm,      setNvForm]      = useState(NV_DEFAULT)
  const [nvPaquetes,  setNvPaquetes]  = useState([])
  const [guardandoNV, setGuardandoNV] = useState(false)

  // Filtros ventas subidas
  const [filtroDni,   setFiltroDni]   = useState('')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

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
  const cargandoLeadsRef = useRef(false)
  const firmaLeadsRef = useRef('')
  const cargarLeadsAsesor = useCallback(async () => {
    if (Date.now() - ultEditRef.current < 1500) return  // pausa breve tras editar (evita parpadeo)
    if (cargandoLeadsRef.current) return  // evita polls solapados (respuestas fuera de orden)
    cargandoLeadsRef.current = true
    try {
      const res  = await fetch(`${API}/leads-reclutamiento${filtroAsesor}`, { headers: ncHeaders() })
      const data = await res.json()
      if (!data.ok) return
      if (!responseChanged(firmaLeadsRef, data.data)) return
      const hoy = fechaHoy()
      const leadsAsignados = data.data.filter(l => {
        const historial = Array.isArray(l.historial) ? l.historial : []
        const asignaciones = historial.filter(h => h?.fecha && h?.asesor)
        const ultimaAsignacion = asignaciones[asignaciones.length - 1]

        // La fecha del lead identifica la base de origen. Para el asesor
        // importa cuándo recibió el registro. El fallback mantiene compatibles
        // los registros antiguos que todavía no tienen historial.
        return ultimaAsignacion?.fecha
          ? normalizarFecha(ultimaAsignacion.fecha) === hoy
          : normalizarFecha(l.fecha) === hoy
      })
      setClientes(prev => {
        const ea = {}
        prev.forEach(c => { ea[c.id] = { estado: c.estado, obs: c.obs } })
        return leadsAsignados.map(l => {
          const p = ea[l.id] || {}
          return {
            id:       l.id,
            telefono: l.n1,
            telefono2: l.n2 || '',
            tipoContacto: l.tipo_contacto || 'LLAMADA',
            direccion: l.direccion || '',
            coordenadas: l.coordenadas || '',
            obsBack: l.obs_back || '',
            zona:     l.distrito || l.campana || '--',
            horaAsig: l.hora_asig || '',
            estado:   l.tipif_vend && l.tipif_vend !== '' ? l.tipif_vend : (p.estado || 'NUEVO'),
            obs:      l.obs_asesor && l.obs_asesor !== '' ? l.obs_asesor : (p.obs || ''),
          }
        })
      })
      setLlamadas(leadsAsignados.length)
    } catch(e) { console.error('Error cargando leads:', e) }
    finally { cargandoLeadsRef.current = false }
  }, [filtroAsesor])

  // ── API: Ventas ──────────────────────────────────────────────────────────
  const cargarVentasSubidas = useCallback(async () => {
    if (cargandoVentasRef.current) return ventasRef.current
    cargandoVentasRef.current = true
    try {
      const res  = await fetch(`${API}/ventas-reclutamiento${filtroAsesor}`, { headers: ncHeaders() })
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

  function cerrarModales() { setModalTip(false); setModalVenta(false); setTipSearch('') }

  async function tipificar(tipo) {
    ultEditRef.current = Date.now()
    if (tipo === 'VENTA CERRADA') {
      const sel = seleccionado
      cerrarModales()
      setMvDni(''); setMvTipoDoc('DNI'); setMvDniError(false)
      setModalVenta(true)
      if (sel !== null && clientes[sel]?.id) {
        try {
          await fetch(`${API}/leads-reclutamiento/${clientes[sel].id}/tipif`, {
            method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ tipif_vend:tipo }),
          })
        } catch(e) {}
      }
      return
    }
    const sel = seleccionado
    if (sel !== null) {
      setClientes(prev => {
        const u = [...prev]; u[sel] = { ...u[sel], estado: tipo }; return u
      })
      if (clientes[sel]?.id) {
        try {
          await fetch(`${API}/leads-reclutamiento/${clientes[sel].id}/tipif`, {
            method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ tipif_vend:tipo }),
          })
        } catch(e) {}
      }
    }
    cerrarModales()
  }

  function guardarObs(i, valor) {
    ultEditRef.current = Date.now()
    setClientes(prev => {
      const u = [...prev]; u[i] = { ...u[i], obs:valor }; return u
    })
    if (clientes[i]?.id) {
      fetch(`${API}/leads-reclutamiento/${clientes[i].id}/obs`, {
        method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ obs:valor }),
      }).catch(e => console.error('Error guardando obs:', e))
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
  function irANuevaVentaDesdeModal() {
    if (!mvDni.trim()) { setMvDniError(true); return }
    const docObs = `${mvTipoDoc}: ${mvDni.trim()}`
    const sel = seleccionado
    if (sel !== null) {
      const obsVal = conservarObsConDocumento(clientes[sel]?.obs, docObs)
      setClientes(prev => {
        const u = [...prev]; u[sel] = { ...u[sel], estado:'VENTA CERRADA', obs:obsVal }; return u
      })
      if (clientes[sel]?.id) {
        fetch(`${API}/leads-reclutamiento/${clientes[sel].id}/obs`, {
          method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ obs:obsVal }),
        }).catch(e => console.error('Error guardando obs:', e))
      }
    }
    cerrarModales()
  }

  // ── Panel nueva / editar venta ───────────────────────────────────────────
  function abrirNuevaVenta() {
    setNvEditId(null); setNvForm(NV_DEFAULT)
    setNvPaquetes([])
    setPanelNV(true); document.body.style.overflow = 'hidden'
  }

  function cerrarNuevaVenta() {
    setPanelNV(false); document.body.style.overflow = ''
  }

  function editarVenta(i) {
    const v = ventasMostradas[i]; if (!v) return
    const campana = String(v.fuente || '').trim()
    const campanaEsOtra = campana !== '' && !FUENTES_RECLU.includes(campana)
    const form = {
      nombre:   v.nombre      || '',
      tipoDoc:  v.tipo_doc    || 'DNI',
      dni:      v.dni         || '',
      tel1:     v.telefono1   || '',
      tel2:     v.telefono2   || '',
      dist:     v.distrito    || '',
      empresa:  v.empresa     || '',
      puesto:         v.puesto              || '',
      fuente:         campanaEsOtra ? 'OTRO' : campana,
      fuenteOtro:     campanaEsOtra ? campana : '',
      experiencia:    v.experiencia         || '',
      disponibilidad: v.disponibilidad      || '',
      estadoReclu:    v.estado_reclutamiento|| 'NUEVO',
      fechaEntrevista:v.fecha_entrevista     || '',
      horaEntrevista: v.hora_entrevista      || '',
      obs:      v.observacion || '',
    }
    setNvEditId(v.id); setNvForm(form)
    setPanelNV(true); document.body.style.overflow = 'hidden'
  }

  function nvSet(key, val) { setNvForm(p => ({ ...p, [key]: val })) }

  function nvOnHogar(hogar) {
    setNvForm(p => ({ ...p, hogar, paquete:'' }))
    setNvPaquetes(PAQUETES_POR_PLAN[hogar] || [])
  }

  async function guardarNuevaVenta() {
    if (!nvForm.nombre.trim()) return mostrarToast('El nombre es obligatorio')
    if (!nvForm.tel1.trim())   return mostrarToast('El teléfono principal es obligatorio')
    if (nvForm.fuente === 'OTRO' && !nvForm.fuenteOtro.trim())
      return mostrarToast('Ingrese el nombre de la campaña')
    const campanaFinal = nvForm.fuente === 'OTRO' ? nvForm.fuenteOtro.trim() : nvForm.fuente
    const body = {
      tipoDoc:nvForm.tipoDoc, dni:nvForm.dni.trim(), nombre:nvForm.nombre.trim(),
      telefono1:nvForm.tel1.trim(), telefono2:nvForm.tel2.trim(),
      distrito:nvForm.dist, empresa:nvForm.empresa,
      puesto:nvForm.puesto, fuente:campanaFinal,
      experiencia:nvForm.experiencia, disponibilidad:nvForm.disponibilidad,
      estadoReclutamiento:nvForm.estadoReclu,
      fechaEntrevista:nvForm.fechaEntrevista, horaEntrevista:nvForm.horaEntrevista,
      obs:nvForm.obs.trim(),
    }
    setGuardandoNV(true)
    try {
      const url    = nvEditId ? `${API}/ventas-reclutamiento/${nvEditId}` : `${API}/ventas-reclutamiento`
      const method = nvEditId ? 'PATCH' : 'POST'
      const res  = await fetch(url, { method, headers:ncHeaders(), body:JSON.stringify(body) })
      const data = await res.json()
      if (!data.ok) { mostrarToast('Error: ' + (data.mensaje || '')); return }
      cerrarNuevaVenta()
      await cargarVentasSubidas()
    } catch(e) { mostrarToast('Error conectando al servidor') }
    finally { setGuardandoNV(false) }
  }

  // ── Filtros ventas subidas ────────────────────────────────────────────────
  function buscarVentas() {
    const fil = filtroDni.toLowerCase()
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
    navigate('/jefatura')
  }

  // ── KPIs computados ───────────────────────────────────────────────────────
  const hoy           = fechaHoy()
  const vHoy          = ventasSubidas.filter(v => normalizarFecha(v.created_at) === hoy)
  const iHoy          = vHoy.filter(esVentaInstalada)
  const noInstHoy     = vHoy.filter(v => !esVentaInstalada(v))
  const kpiLlamadas   = llamadas
  const kpiVentas     = vHoy.length
  const kpiInstaladas = iHoy.length
  const kpiNoInst     = noInstHoy.length
  const totalResultado = kpiInstaladas + kpiNoInst
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
            <span className="brand-sub">Sistema de llamadas Reclutamiento</span>
          </div>
        </div>
        <div className="tabs">
          {[
            { id:'llamadas',      label:'Llamadas' },
            { id:'ventassubidas', label:'Postulantes' },
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
          <span style={{fontSize:'12px',color:'#9ca3af',fontWeight:600,background:'#fff',padding:'5px 12px',borderRadius:'20px',border:'1px solid #e5e7eb'}}>
            {fechaHoyFormateada()}
          </span>
        </div>
        <div className="tabla-crm-wrap">
        <table className="tabla-crm tabla-leads-asesor">
          <thead>
            <tr>
              <th>Teléfono</th><th>Teléfono 2</th><th>Zona</th>
              <th>Hora asig.</th>
              <th>Estado</th><th>Observación asesor</th><th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {clientes.length === 0 ? (
              <tr>
                <td colSpan={7} style={{textAlign:'center',padding:'40px',color:'#9ca3af',fontSize:'13px'}}>
                  Esperando asignación de Back Data...<br />
                  <span style={{fontSize:'11px',marginTop:'6px',display:'block'}}>Back Data asignará registros a tu usuario.</span>
                </td>
              </tr>
            ) : clientes.map((c, i) => (
              <tr key={c.id || i}>
                <td><div className="dash-numero-copiar"><span>{c.telefono}</span><button type="button" onClick={()=>copiarNumero(c.telefono)} title="Copiar teléfono" aria-label={`Copiar ${c.telefono}`}><CopyIcon /></button></div></td>
                <td>{c.telefono2 ? <div className="dash-numero-copiar secundario"><span>{c.telefono2}</span><button type="button" onClick={()=>copiarNumero(c.telefono2)} title="Copiar teléfono 2" aria-label={`Copiar ${c.telefono2}`}><CopyIcon /></button></div> : '--'}</td>
                <td>{c.zona}</td>
                <td style={{fontSize:'11px',color:'#9ca3af'}}>{c.horaAsig || '--'}</td>
                <td><span className={`badge-estado ${colorEstado(c.estado)}`}>{c.estado}</span></td>
                <td>
                  <input
                    className="input-obs"
                    placeholder="Escribe una observación..."
                    defaultValue={c.obs || ''}
                    maxLength={200}
                    onBlur={e => guardarObs(i, e.target.value)}
                  />
                </td>
                <td>
                  <button className="btn-accion" onClick={() => abrirModalTip(i)} title="Tipificar">
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6 2h8l4 4v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="rgba(255,255,255,0.25)" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
                      <path d="M14 2v4h4" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/>
                      <path d="M9 17l1.5-1.5 3-3-1.5-1.5-3 3L9 17z" fill="#fff"/>
                      <path d="M13.5 12.5l1-1a1 1 0 0 0-1.5-1.5l-1 1 1.5 1.5z" fill="#fff"/>
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* ── RENDIMIENTO ────────────────────────────────────────────────── */}

      {/* ── VENTAS SUBIDAS ─────────────────────────────────────────────── */}
      <div className={`pantalla${tab !== 'ventassubidas' ? ' hidden' : ''}`}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',flexWrap:'wrap',gap:'10px'}}>
          <div>
            <h2 style={{marginBottom:'4px'}}>Postulantes</h2>
            <p style={{fontSize:'12px',color:'#9ca3af'}}>Historial de postulantes · Registra uno nuevo desde el botón</p>
          </div>
          <button onClick={abrirNuevaVenta}
            style={{display:'inline-flex',alignItems:'center',gap:'8px',padding:'10px 22px',background:'linear-gradient(135deg,#ff2d2d,#ff6b6b)',color:'#fff',border:'none',borderRadius:'12px',fontSize:'13px',fontWeight:700,fontFamily:'inherit',cursor:'pointer',boxShadow:'0 4px 14px rgba(255,45,45,.35)'}}>
            Nuevo Postulante
          </button>
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

        <div className="vs-tabla-wrap">
          <table className="vs-tabla">
            <thead>
              <tr>
                <th>Estado</th><th>Fecha</th><th>Nombre y Apellidos</th>
                <th>Tipo Doc.</th><th>Documento</th><th>Teléfono</th>
                <th>Distrito</th><th>Puesto</th><th>Experiencia</th>
                <th>Disponibilidad</th><th>Entrevista</th><th>Observación</th>
                <th style={{minWidth:'130px'}}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {ventasMostradas.length === 0 ? (
                <tr className="vs-empty"><td colSpan={13}>Sin registros. Usa los filtros para buscar.</td></tr>
              ) : ventasMostradas.map((v, i) => (
                <tr key={v.id || i}>
                  <td><span className="badge-estado">{v.estado_reclutamiento||v.estado||'NUEVO'}</span></td>
                  <td style={{fontSize:'11px',color:'#185FA5',fontWeight:700}}>{normalizarFecha(v.created_at) || '-'}</td>
                  <td style={{fontWeight:600,minWidth:'160px'}}>{v.nombre||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.tipo_doc||'DNI'}</td>
                  <td style={{fontFamily:'monospace',fontSize:'11px'}}>{v.dni||'-'}</td>
                  <td style={{fontFamily:'monospace',color:'#185FA5',fontWeight:700}}>{v.telefono1||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.distrito||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.puesto||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.experiencia||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.disponibilidad||'-'}</td>
                  <td style={{fontSize:'11px'}}>{v.fecha_entrevista ? `${v.fecha_entrevista} ${v.hora_entrevista||''}` : '-'}</td>
                  <td style={{fontSize:'11px',color:'#6b7280',minWidth:'140px'}}>{v.observacion||'-'}</td>
                  <td>
                    <div className="vs-acciones-cell">
                      <button className="vs-btn-accion vs-btn-editar" onClick={() => editarVenta(i)}>Editar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                <button key={t.value} className={`tip-chip ${t.cls}`} onClick={() => tipificar(t.value)}>
                  {t.label}
                </button>
              ))}
            </div>
            <button className="tip-cancelar" onClick={cerrarModales}>CANCELAR</button>
          </div>
        </div>
      )}

      {/* ── MODAL REGISTRAR VENTA (DNI) ────────────────────────────────── */}
      {modalVenta && (
        <div className="modal show">
          <div className="modal-content" style={{minWidth:'320px',maxWidth:'380px',borderRadius:'16px'}}>
            <h3 style={{fontSize:'16px',fontWeight:700,color:'#111827',borderBottom:'1px solid #f3f4f6',paddingBottom:'10px',marginBottom:'4px'}}>
              Venta Cerrada
            </h3>
            <p style={{fontSize:'12px',color:'#9ca3af',marginBottom:'16px'}}>Ingresa el documento del cliente para registrar la venta.</p>
            <div style={{display:'flex',flexDirection:'column',gap:'4px',marginBottom:'12px'}}>
              <label style={{fontSize:'10px',fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.3px'}}>Tipo de documento</label>
              <select value={mvTipoDoc} onChange={e => setMvTipoDoc(e.target.value)}
                style={{padding:'9px 11px',border:'1px solid #e5e7eb',borderRadius:'8px',fontSize:'13px',fontFamily:'inherit',outline:'none',background:'#fafafa',color:'#111827'}}>
                <option value="DNI">DNI</option>
                <option value="CE">Carnet de Extranjería</option>
                <option value="RUC">RUC</option>
              </select>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:'4px',marginBottom:'20px'}}>
              <label style={{fontSize:'10px',fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.3px'}}>
                {mvTipoDoc === 'DNI' ? 'Número de DNI' : mvTipoDoc === 'CE' ? 'Número de Carnet de Extranjería' : 'Número de RUC'}
              </label>
              <input
                placeholder="" maxLength={15}
                value={mvDni} onChange={e => { setMvDni(e.target.value); setMvDniError(false) }}
                style={{padding:'10px 12px',border:`1.5px solid ${mvDniError ? '#ef4444':'#e5e7eb'}`,borderRadius:'8px',fontSize:'15px',fontFamily:'monospace',outline:'none',background:'#fafafa',color:'#111827',letterSpacing:'2px',transition:'border .2s'}}
              />
            </div>
            <button onClick={irANuevaVentaDesdeModal}
              style={{width:'100%',padding:'12px',border:'none',borderRadius:'10px',background:'#22c55e',color:'#fff',fontSize:'14px',fontWeight:700,fontFamily:'inherit',cursor:'pointer',marginBottom:'8px'}}>
              Confirmar
            </button>
            <button onClick={cerrarModales}
              style={{width:'100%',padding:'10px',border:'none',borderRadius:'10px',background:'#f3f4f6',color:'#6b7280',fontSize:'13px',fontWeight:600,fontFamily:'inherit',cursor:'pointer'}}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── PANEL NUEVA / EDITAR VENTA ─────────────────────────────────── */}
      <div className={`nv-overlay${panelNV ? ' open' : ''}`}>
        <div className="nv-modal">
          <div className="nv-header">
            <div className="nv-header-left">
              <div className="nv-icon">NV</div>
              <div>
                <div className="nv-title">{nvEditId ? 'Editar Postulante' : 'Nuevo Postulante'}</div>
                <div className="nv-subtitle">Registrar información del candidato</div>
              </div>
            </div>
            <button className="nv-close" onClick={cerrarNuevaVenta}>×</button>
          </div>

          <div className="nv-body">
            {/* Datos del postulante */}
            <div className="nv-section">
              <div className="nv-section-title">Datos del Postulante</div>
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
                    {nvForm.tipoDoc === 'DNI' ? 'Número DNI' : nvForm.tipoDoc === 'CE' ? 'Número Carnet Extranjería' : 'Número RUC'} (opcional)
                  </label>
                  <input className="nv-input" placeholder="Número de documento" maxLength={15} inputMode="numeric" pattern="[0-9]*" style={{fontFamily:'monospace'}}
                    value={nvForm.dni} onChange={e => nvSet('dni', e.target.value.replace(/\D/g, ''))} />
                </div>
                <div className="nv-field">
                  <label className="nv-label">Teléfono Principal <span>*</span></label>
                  <input className="nv-input" placeholder="9XXXXXXXX" maxLength={12} style={{fontFamily:'monospace'}}
                    value={nvForm.tel1} onChange={e => nvSet('tel1', e.target.value)} />
                </div>
                <div className="nv-field">
                  <label className="nv-label">Teléfono Secundario (opcional)</label>
                  <input className="nv-input" placeholder="9XXXXXXXX" maxLength={12} inputMode="numeric" pattern="[0-9]*" style={{fontFamily:'monospace'}}
                    value={nvForm.tel2} onChange={e => nvSet('tel2', e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>
            </div>

            {/* Ubicación */}
            <div className="nv-section">
              <div className="nv-section-title">Ubicación</div>
              <div className="nv-grid nv-grid-1">
                <div className="nv-field">
                  <label className="nv-label">Distrito</label>
                  <select className="nv-select" value={nvForm.dist} onChange={e => nvSet('dist', e.target.value)}>
                    <option value="">Seleccionar distrito</option>
                    {LIMA_DISTRITOS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Información de postulación */}
            <div className="nv-section">
              <div className="nv-section-title">Información de Postulación</div>
              <div className="nv-grid nv-grid-2">
                <div className="nv-field">
                  <label className="nv-label">Puesto al que Postula <span>*</span></label>
                  <select className="nv-select" value={nvForm.puesto} onChange={e => nvSet('puesto', e.target.value)}>
                    <option value="">Seleccionar puesto</option>
                    {PUESTOS_RECLU.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">Campaña de Reclutamiento</label>
                  <select className="nv-select" value={nvForm.fuente}
                    onChange={e => setNvForm(p => ({
                      ...p,
                      fuente:e.target.value,
                      fuenteOtro:e.target.value === 'OTRO' ? p.fuenteOtro : '',
                    }))}>
                    <option value="">Seleccionar campaña</option>
                    {FUENTES_RECLU.map(f => <option key={f} value={f}>{f}</option>)}
                    <option value="OTRO">OTRO</option>
                  </select>
                  {nvForm.fuente === 'OTRO' && (
                    <>
                      <label className="nv-label" style={{marginTop:'8px'}}>Nueva campaña <span>*</span></label>
                      <input className="nv-input" maxLength={50} placeholder="Ej. HUARAL 2026"
                        value={nvForm.fuenteOtro} onChange={e => nvSet('fuenteOtro', e.target.value)} />
                    </>
                  )}
                </div>
                <div className="nv-field">
                  <label className="nv-label">Experiencia en Call Center</label>
                  <select className="nv-select" value={nvForm.experiencia} onChange={e => nvSet('experiencia', e.target.value)}>
                    <option value="">Seleccionar experiencia</option>
                    {EXPERIENCIA_RECLU.map(x => <option key={x} value={x}>{x}</option>)}
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">Disponibilidad</label>
                  <select className="nv-select" value={nvForm.disponibilidad} onChange={e => nvSet('disponibilidad', e.target.value)}>
                    <option value="">Seleccionar disponibilidad</option>
                    {DISPONIBILIDAD_RECLU.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Entrevista / seguimiento */}
            <div className="nv-section">
              <div className="nv-section-title">Entrevista / Seguimiento</div>
              <div className="nv-grid nv-grid-3">
                <div className="nv-field">
                  <label className="nv-label">Estado de Reclutamiento</label>
                  <select className="nv-select" value={nvForm.estadoReclu} onChange={e => nvSet('estadoReclu', e.target.value)}>
                    {ESTADOS_RECLU.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="nv-field">
                  <label className="nv-label">Empresa</label>
                  <select className="nv-select" value={nvForm.empresa} onChange={e => nvSet('empresa', e.target.value)}>
                    <option value="">Seleccionar empresa</option>
                    {EMPRESAS_RECLU.map(em => <option key={em} value={em}>{em}</option>)}
                  </select>
                </div>
                {nvForm.estadoReclu === 'ENTREVISTA AGENDADA' && (
                  <>
                    <div className="nv-field">
                      <label className="nv-label">Fecha de Entrevista</label>
                      <input className="nv-input" type="date" value={nvForm.fechaEntrevista} onChange={e => nvSet('fechaEntrevista', e.target.value)} />
                    </div>
                    <div className="nv-field">
                      <label className="nv-label">Hora de Entrevista</label>
                      <input className="nv-input" type="time" value={nvForm.horaEntrevista} onChange={e => nvSet('horaEntrevista', e.target.value)} />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Observación */}
            <div className="nv-section">
              <div className="nv-section-title">Observación de Reclutamiento</div>
              <div className="nv-field">
                <textarea className="nv-textarea" placeholder="Observaciones sobre el postulante..."
                  value={nvForm.obs} onChange={e => nvSet('obs', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="nv-footer">
            <button className="nv-btn-cancel" onClick={cerrarNuevaVenta}>Cancelar</button>
            <button className="nv-btn-save" onClick={guardarNuevaVenta} disabled={guardandoNV}>
              {guardandoNV ? 'Guardando...' : 'Guardar Postulante'}
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
