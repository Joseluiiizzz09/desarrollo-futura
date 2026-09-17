import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import JefaturaViewControls from '../components/JefaturaViewControls'
import MediaViewer from '../components/MediaViewer'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import ProgramacionInfoCell from '../components/ProgramacionInfoCell'
import WhatsappSeguimientoBoton from '../components/WhatsappSeguimientoBoton'
import CanalBadge from '../components/CanalBadge'
import { API, ncHeaders } from '../services/api'
import { responseChanged, setVisibleInterval, clearVisibleInterval } from '../utils/polling'
import '../styles/seguimiento.css'

const ESTADOS = [
  { id: 'ejecucion', label: 'EN EJECUCION',    cls: 'bs-ejec',    fila: 'fila-ejec'    },
  { id: 'instalado', label: 'INSTALADO',        cls: 'bs-inst',    fila: 'fila-inst'    },
  { id: 'caida',     label: 'CAIDA',            cls: 'bs-caida',   fila: 'fila-caida'   },
  { id: 'rechazo',   label: 'RECHAZO EN CAMPO', cls: 'bs-rech',    fila: 'fila-rech'    },
  { id: 'tecnico',   label: 'TECNICOS EN CASA', cls: 'bs-tecnico', fila: 'fila-tecnico' },
  { id: 'levantar_sot', label: 'LEVANTAR SOT', cls: 'bs-rech', fila: 'fila-rech' },
  { id: 'tecnicos_camino', label: 'TECNICOS EN CAMINO', cls: 'bs-tecnico', fila: 'fila-tecnico' },
  { id: 'instalado_no_validado', label: 'INSTALADO NO VALIDADO', cls: 'bs-inst', fila: 'fila-inst' },
  { id: 'reasignacion', label: 'REASIGNACION', cls: 'bs-ejec', fila: 'fila-ejec' },
  { id: 'derivado_planta_externa', label: 'DERIVADO A PLANTA EXTERNA', cls: 'bs-rech', fila: 'fila-rech' },
  { id: 'servicio_activo', label: 'SERVICIO ACTIVO', cls: 'bs-inst', fila: 'fila-inst' },
  { id: 'rechazo_programacion', label: 'RECHAZO', cls: 'bs-rech', fila: 'fila-rech' },
  { id: 'rechazo_mesa', label: 'RECHAZO EN MESA', cls: 'bs-rechazo-mesa', fila: 'fila-rech' },
]

const MOTIVOS_CAIDA = ['FRAUDE','EXCESO DE ACOMETIDA','INFRAESTRUCTURA','RED SATURADA','EDIFICIO NO LIBERADO','SERVICIO ACTIVO','RECHAZO POR AUDIO']
const MOTIVOS_RECH  = ['MALA OFERTA','NO DESEA','FALTA DE CONTACTO','SOT CON ERRORES DE SISTEMA','RED SATURADA','FACILIDADES TECNICAS DEL CLIENTE','MAL INGRESO DIRECCION']
const TRAMOS        = ['AM','PM','PM 3']
const RESULTADOS    = ['Contactado -- conforme','Contactado -- con problema','No contesta','Buzon de voz','Numero equivocado','Solicita rellamada','SE LEVANTO','MASIVO ENVIADO','DERIVADO A GRABAR','DERIVADO A AGILIZAR','En Agenda']

const ESTADO_BD_MAP = {
  ejecucion: 'en_ejecucion',
  instalado: 'instalado',
  caida:     'caida',
  rechazo:   'rechazo_campo',
  tecnico:   'tecnico_casa',
  levantar_sot: 'levantar_sot',
  tecnicos_camino: 'tecnicos_camino',
  instalado_no_validado: 'instalado_no_validado',
  reasignacion: 'reasignacion',
  derivado_planta_externa: 'derivado_planta_externa',
  servicio_activo: 'servicio_activo',
  rechazo_programacion: 'pendiente',
  rechazo_mesa: 'rechazo_mesa',
}

const SEG_FILTRO_KEY = 'nc_seguimiento_filtro'
const ORD_EST = { caida:0, rechazo:1, rechazo_mesa:1, levantar_sot:2, derivado_planta_externa:3, tecnico:4, tecnicos_camino:5, reasignacion:6, ejecucion:7, instalado_no_validado:8, servicio_activo:9, instalado:10 }

function fechaHoy() {
  const a = new Date(), u = a.getTime() + a.getTimezoneOffset() * 60000
  const p = new Date(u + (-5 * 60 * 60000))
  return p.getFullYear() + '-' + String(p.getMonth() + 1).padStart(2, '0') + '-' + String(p.getDate()).padStart(2, '0')
}
function horaAhora() { return new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false }) }
function formatF(f)   { if (!f) return '--'; const p = f.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : f }

function estadoObj(id) { return ESTADOS.find(e => e.id === id) || ESTADOS[0] }

function motivoBadgeCls(motivo) {
  if (!motivo || motivo === '--') return null
  const m = motivo.toUpperCase()
  if (m.includes('FRAUDE')) return 'bm-fraude'
  if (m.includes('INFRA') || m.includes('EDIFICIO') || m.includes('ACOMETIDA') || m.includes('RED')) return 'bm-infra'
  if (m.includes('NO DESEA')) return 'bm-nodesea'
  if (m.includes('OFERTA')) return 'bm-malaoferta'
  if (m.includes('CONTACTO') || m.includes('SOT') || m.includes('MAL INGRESO') || m.includes('FACIL')) return 'bm-faltacon'
  return 'bm-default'
}

function mapearEstado(e) {
  const est = (e || '').toLowerCase()
  const nuevos = {
    levantar_sot:'levantar_sot', tecnicos_camino:'tecnicos_camino',
    instalado_no_validado:'instalado_no_validado', reasignacion:'reasignacion',
    derivado_planta_externa:'derivado_planta_externa', servicio_activo:'servicio_activo',
    rechazo_mesa:'rechazo_mesa',
  }
  if (nuevos[est]) return nuevos[est]
  if (est.includes('tecnico'))   return 'tecnico'
  if (est.includes('rechazo'))   return 'rechazo'
  if (est.includes('ejecucion')) return 'ejecucion'
  const m = {
    aprobado: 'ejecucion', en_ejecucion: 'ejecucion',
    instalado: 'instalado', caida: 'caida',
    observado: 'ejecucion', rechazo_campo: 'rechazo', tecnico_casa: 'tecnico',
  }
  return m[est] || 'ejecucion'
}

function Paginacion({ total, pagina, porPagina, onChange }) {
  const totalPags = Math.max(1, Math.ceil(total / porPagina))
  let ini = Math.max(1, pagina - 3)
  let fin2 = Math.min(totalPags, ini + 6)
  if (fin2 - ini < 6) ini = Math.max(1, fin2 - 6)
  const pages = []
  for (let i = ini; i <= fin2; i++) pages.push(i)
  return (
    <div className="pag-btns">
      <button className="pag-btn" onClick={() => onChange(pagina - 1)} disabled={pagina === 1}>&#8249;</button>
      {ini > 1 && <><button className="pag-btn" onClick={() => onChange(1)}>1</button>{ini > 2 && <span style={{ padding: '0 3px', color: '#9ca3af' }}>...</span>}</>}
      {pages.map(p => <button key={p} className={`pag-btn${p === pagina ? ' active' : ''}`} onClick={() => onChange(p)}>{p}</button>)}
      {fin2 < totalPags && <>{fin2 < totalPags - 1 && <span style={{ padding: '0 3px', color: '#9ca3af' }}>...</span>}<button className="pag-btn" onClick={() => onChange(totalPags)}>{totalPags}</button></>}
      <button className="pag-btn" onClick={() => onChange(pagina + 1)} disabled={pagina === totalPags}>&#8250;</button>
    </div>
  )
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
  function toggleUno(id) {
    onChange(seleccionados.includes(id) ? seleccionados.filter(x => x !== id) : [...seleccionados, id])
  }

  const label = todos
    ? 'Todos los estados'
    : seleccionados.length === 1
      ? (opciones.find(o => o.id === seleccionados[0])?.label || '1 seleccionado')
      : `${seleccionados.length} estados seleccionados`

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
            <span>Todos los estados</span>
          </label>
          <div className="filtro-estado-divider" />
          {opciones.map(o => (
            <label key={o.id} className="filtro-estado-item">
              <input type="checkbox" checked={seleccionados.includes(o.id)} onChange={() => toggleUno(o.id)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Seguimiento() {
  const navigate = useNavigate()
  const { sesion, logout } = useAuth()
  const usuarioActual = sesion?.nombre || 'Seguimiento'

  const [ventas, setVentas] = useState([])

  const [filtroLeyenda, setFiltroLeyenda] = useState(() => {
    try { return sessionStorage.getItem(SEG_FILTRO_KEY) || '' } catch { return '' }
  })
  const [fEstados, setFEstados]   = useState([])
  const [fVendedor, setFVendedor] = useState('')
  const [fSala, setFSala]         = useState('')
  const [fDistrito, setFDistrito] = useState('')
  const [fTramo, setFTramo]       = useState('')
  const [fTipoFecha, setFTipoFecha] = useState('fecha')
  const [fDesde, setFDesde]       = useState('')
  const [fHasta, setFHasta]       = useState('')
  const [busqueda, setBusqueda]   = useState('')
  const [pagina, setPagina]       = useState(1)
  const [porPagina, setPorPagina] = useState(18)

  // Modal cambiar estado
  const [modalEstado, setModalEstado]       = useState(null)
  const [estNuevo, setEstNuevo]             = useState('')
  const [estTramo, setEstTramo]             = useState('')
  const [estMotivo, setEstMotivo]           = useState('')
  const [estObs, setEstObs]                 = useState('')

  // Modal datos de programación
  const [modalProgramacion, setModalProgramacion] = useState(null)
  const [progSot, setProgSot]                     = useState('')
  const [progFecha, setProgFecha]                 = useState('')

  // Modal llamada
  const [modalObs, setModalObs]             = useState(null)
  const [obsResultado, setObsResultado]     = useState('')
  const [obsNueva, setObsNueva]             = useState('')
  const [obsComentario, setObsComentario]   = useState('')

  // Modal agenda
  const [modalAgenda, setModalAgenda]       = useState(null)
  const [agFecha, setAgFecha]               = useState('')
  const [agNota, setAgNota]                 = useState('')

  // Modal historial
  const [modalHist, setModalHist]           = useState(null)
  const [mediaVenta, setMediaVenta]         = useState(null)

  // Modal SOT
  const [sotModal, setSotModal] = useState(null) // { id, valor, guardando }

  const [toastMsg, setToastMsg] = useState('')
  const toastRef = useRef(null)
  const [enviandoWA, setEnviandoWA] = useState(() => new Set())

  function mostrarToast(msg) {
    setToastMsg(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToastMsg(''), 3000)
  }

  const cargandoVentasRef = useRef(false)
  const firmaVentasRef = useRef('')
  const cargarVentas = useCallback(async () => {
    if (cargandoVentasRef.current) return  // evita polls solapados (respuestas fuera de orden que causan parpadeo)
    cargandoVentasRef.current = true
    try {
      const res  = await fetch(`${API}/ventas`, { headers: ncHeaders() })
      const data = await res.json()
      if (data.ok && responseChanged(firmaVentasRef, data.data)) {
        setVentas(data.data
          .filter(v => {
            const conforme = String(v.estado_supgrab || '').trim().toLowerCase() === 'conforme'
            return conforme || Boolean(v.seguimiento_ingresado_at)
          })
          .map(v => ({
            ...v,
            nombreApellidos:  v.nombre    || '',
            dniDocumento:     v.dni       || '',
            telefonoContacto: v.telefono1 || '',
            fechaIngreso:     v.created_at ? v.created_at.split(' ')[0] : '',
            _estadoSeg:       mapearEstado(v.estado),
            _tramo:           v.tramo_seguimiento  || '',
            _comentario:      v.obs_seguimiento    || '',
            _motivoRech:      v.motivo_seguimiento || '',
            _proxSeg:         v._proxSeg     || '',
            _historial:       v._historial   || [],
            _audioPath:       v.audio_path   || '',
            _audioNombre:     v.audio_path ? v.audio_path.split('/').pop() : '',
            _waEnviado:       !!v.fecha_whatsapp_enviado,
            _waFecha:         v.fecha_whatsapp_enviado || null,
            _waPlantilla:     v.plantilla_whatsapp_enviado || null,
          }))
        )
      }
    } catch (e) { console.error(e) }
    finally { cargandoVentasRef.current = false }
  }, [])

  useEffect(() => {
    cargarVentas()
    const fc = setVisibleInterval(cargarVentas, 1000)
    return () => clearVisibleInterval(fc)
  }, [cargarVentas])

  function toggleLeyenda(id) {
    const next = filtroLeyenda === id ? '' : id
    setFiltroLeyenda(next)
    if (next) setFEstados([])
    try { sessionStorage.setItem(SEG_FILTRO_KEY, next) } catch {}
    setPagina(1)
  }

  function cambiarFEstados(ids) {
    setFEstados(ids)
    setFiltroLeyenda('')
    try { sessionStorage.setItem(SEG_FILTRO_KEY, '') } catch {}
    setPagina(1)
  }

  // Filtro compartido: `incluirEstado` se desactiva para las métricas (leyenda/KPIs),
  // asi el rango de fecha y demas filtros los acotan pero no se colapsan al elegir un estado.
  const filtrarVenta = useCallback((v, incluirEstado) => {
    if (incluirEstado) {
      if (filtroLeyenda) {
        if (v._estadoSeg !== filtroLeyenda) return false
      } else if (fEstados.length && !fEstados.includes(v._estadoSeg)) {
        return false
      }
    }
    if (fVendedor && !(v.vendedor || v.asesor_nombre || '').toLowerCase().includes(fVendedor.toLowerCase())) return false
    if (fSala && !(v.sala || '').toLowerCase().includes(fSala.toLowerCase())) return false
    if (fDistrito && !(v.distrito || '').toLowerCase().includes(fDistrito.toLowerCase())) return false
    if (fTramo   && v._tramo !== fTramo) return false
    const f = fTipoFecha === 'programados'
      ? String(v.fecha_programada || '').slice(0, 10)
      : (v.fechaIngreso || '')
    if (fDesde && f < fDesde) return false
    if (fHasta && f > fHasta) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      if (![
        v.nombreApellidos, v.dni, v.telefonoContacto, v.vendedor,
        v.distrito, v._comentario, v.sot,
      ].some(x => String(x || '').toLowerCase().includes(b))) return false
    }
    return true
  }, [filtroLeyenda, fEstados, fVendedor, fSala, fDistrito, fTramo, fTipoFecha, fDesde, fHasta, busqueda])

  const ventasEnRango = useMemo(() => ventas.filter(v => filtrarVenta(v, false)), [ventas, filtrarVenta])

  const ventasFiltradas = useMemo(() => {
    let base = ventasEnRango.filter(v => filtrarVenta(v, true))
    base.sort((a, b) => {
      const oa = ORD_EST[a._estadoSeg] ?? 5
      const ob = ORD_EST[b._estadoSeg] ?? 5
      return oa !== ob ? oa - ob : (b.fechaIngreso || '').localeCompare(a.fechaIngreso || '')
    })
    return base
  }, [ventasEnRango, filtrarVenta])

  const kpis = useMemo(() => ({
    total:     ventasEnRango.length,
    ejecucion: ventasEnRango.filter(v => v._estadoSeg === 'ejecucion').length,
    instalado: ventasEnRango.filter(v => v._estadoSeg === 'instalado').length,
    rechazo:   ventasEnRango.filter(v => v._estadoSeg === 'rechazo').length,
    caida:     ventasEnRango.filter(v => v._estadoSeg === 'caida').length,
    tecnico:   ventasEnRango.filter(v => v._estadoSeg === 'tecnico').length,
    adicionales: ESTADOS.slice(5).reduce((acc, e) => ({
      ...acc,
      [e.id]: ventasEnRango.filter(v => v._estadoSeg === e.id).length,
    }), {}),
  }), [ventasEnRango])

  const totalPag  = ventasFiltradas.length
  const inicio    = (pagina - 1) * porPagina
  const fin       = Math.min(inicio + porPagina, totalPag)
  const ventasPag = ventasFiltradas.slice(inicio, fin)

  function limpiarFiltros() {
    setFiltroLeyenda(''); setFEstados([]); setFVendedor(''); setFSala(''); setFDistrito('')
    setFTramo(''); setFTipoFecha('fecha'); setFDesde(''); setFHasta(''); setBusqueda(''); setPagina(1)
    try { sessionStorage.setItem(SEG_FILTRO_KEY, '') } catch {}
  }

  // MODAL ESTADO
  function abrirModalEstado(v) {
    setModalEstado(v)
    setEstNuevo(v._estadoSeg || '')
    setEstTramo(v._tramo || '')
    setEstMotivo(v._motivoRech || '')
    setEstObs(v._comentario || '')
  }

  async function guardarEstado() {
    if (!modalEstado) return
    const estadoBD = ESTADO_BD_MAP[estNuevo] || 'aprobado'
    const comentario = estObs.trim() || modalEstado._comentario
    const motivoAplica = estNuevo === 'caida' || estNuevo === 'rechazo'
    const body = { estado: estadoBD, obs_seguimiento: comentario, tramo_seguimiento: estTramo }
    if (estNuevo === 'rechazo_programacion') body.estado_supgrab = 'aprobado'
    if (motivoAplica) body.motivo_seguimiento = estMotivo
    try {
      const res  = await fetch(`${API}/ventas/${modalEstado.id}`, {
        method: 'PATCH', headers: ncHeaders(),
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        mostrarToast(data.mensaje || 'No se pudo guardar el estado')
        return
      }
    } catch (e) { console.error(e); mostrarToast('No se pudo guardar el estado'); return }
    setVentas(list => list.map(x =>
      x.id === modalEstado.id
        ? { ...x, _estadoSeg: estNuevo, _tramo: estTramo, _comentario: comentario, _motivoRech: motivoAplica ? estMotivo : x._motivoRech }
        : x
    ))
    setModalEstado(null)
  }

  function abrirModalProgramacion(v) {
    setModalProgramacion(v)
    setProgSot(v.sot || '')
    setProgFecha(v.fecha_programada ? String(v.fecha_programada).slice(0, 10) : '')
  }

  async function guardarProgramacion() {
    if (!modalProgramacion) return
    const sot = progSot.trim()
    if (!sot || !progFecha) {
      mostrarToast('Ingrese la SOT y la fecha programada')
      return
    }
    try {
      const res = await fetch(`${API}/ventas/${modalProgramacion.id}`, {
        method: 'PATCH',
        headers: ncHeaders(),
        body: JSON.stringify({ sot, fecha_programada: progFecha }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        mostrarToast(data.mensaje || 'No se pudo actualizar la programación')
        return
      }
    } catch (e) {
      console.error(e)
      mostrarToast('No se pudo actualizar la programación')
      return
    }
    setVentas(list => list.map(v => v.id === modalProgramacion.id
      ? { ...v, sot, fecha_programada: progFecha }
      : v
    ))
    if (estNuevo === 'rechazo_programacion') {
      setVentas(list => list.filter(x => x.id !== modalEstado.id))
    }
    setModalProgramacion(null)
  }

  async function guardarSot() {
    if (!sotModal || sotModal.guardando) return
    const valor = String(sotModal.valor || '').trim()
    if (!valor) { mostrarToast('Ingresa el número de SOT'); return }
    setSotModal(prev => prev ? { ...prev, guardando: true } : prev)
    try {
      const res = await fetch(`${API}/ventas/${sotModal.id}`, {
        method: 'PATCH', headers: ncHeaders(),
        body: JSON.stringify({ sot: valor }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        mostrarToast(data.mensaje || 'No se pudo actualizar la SOT')
        setSotModal(prev => prev ? { ...prev, guardando: false } : prev)
        return
      }
    } catch (e) { console.error(e); mostrarToast('No se pudo actualizar la SOT'); setSotModal(prev => prev ? { ...prev, guardando: false } : prev); return }
    setVentas(list => list.map(v => v.id === sotModal.id ? { ...v, sot: valor } : v))
    setSotModal(null)
  }

  async function enviarWhatsapp(v, plantilla) {
    if (enviandoWA.has(v.id)) return
    setEnviandoWA(prev => new Set(prev).add(v.id))
    try {
      const res  = await fetch(`${API}/ventas/${v.id}/enviar-seguimiento-whatsapp`, {
        method: 'POST', headers: ncHeaders(),
        body: JSON.stringify({ plantilla }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        mostrarToast(data.mensaje || 'No se pudo enviar el mensaje de WhatsApp')
        return
      }
      mostrarToast('Mensaje de WhatsApp enviado')
      setVentas(list => list.map(x => x.id === v.id
        ? { ...x, _waEnviado: true, _waFecha: new Date().toISOString(), _waPlantilla: plantilla }
        : x))
    } catch (e) {
      console.error(e)
      mostrarToast('No se pudo enviar el mensaje de WhatsApp')
    } finally {
      setEnviandoWA(prev => { const s = new Set(prev); s.delete(v.id); return s })
    }
  }

  // MODAL OBS / LLAMADA
  function abrirModalObs(v) {
    setModalObs(v)
    setObsResultado('')
    setObsNueva('')
    setObsComentario(v._comentario || '')
  }

  async function guardarObservacion() {
    if (!modalObs) return
    const obs = obsNueva.trim()
    if (!obs) { mostrarToast('Escribe una observación'); return }
    const resultado = obsResultado || 'Sin resultado'
    const nuevoHistorial = [...(modalObs._historial || []), { fecha: fechaHoy(), hora: horaAhora(), user: usuarioActual, resultado, obs }]
    const comentario = obsComentario.trim() || modalObs._comentario
    try {
      const res  = await fetch(`${API}/ventas/${modalObs.id}`, {
        method: 'PATCH', headers: ncHeaders(),
        body: JSON.stringify({ obs_seguimiento: comentario }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        mostrarToast(data.mensaje || 'No se pudo registrar la llamada')
        return
      }
    } catch (e) { console.error(e); mostrarToast('No se pudo registrar la llamada'); return }
    setVentas(list => list.map(x =>
      x.id === modalObs.id ? { ...x, _historial: nuevoHistorial, _comentario: comentario } : x
    ))
    setModalObs(null)
  }

  // MODAL AGENDA
  function abrirModalAgenda(v) {
    setModalAgenda(v)
    setAgFecha(v._proxSeg || '')
    setAgNota('')
  }

  function guardarAgenda() {
    if (!modalAgenda) return
    if (!agFecha) { mostrarToast('Selecciona una fecha'); return }
    setVentas(list => list.map(x => {
      if (x.id !== modalAgenda.id) return x
      const hist = [...(x._historial || [])]
      if (agNota.trim()) {
        hist.push({ fecha: fechaHoy(), hora: horaAhora(), user: usuarioActual, resultado: 'Agendado', obs: `Prox: ${formatF(agFecha)}. ${agNota.trim()}` })
      }
      return { ...x, _proxSeg: agFecha, _historial: hist }
    }))
    setModalAgenda(null)
  }

  function salir() { logout(); navigate('/login') }

  const motivosParaEstado = estNuevo === 'caida' ? MOTIVOS_CAIDA : estNuevo === 'rechazo' ? MOTIVOS_RECH : []

  return (
    <div>
      <div className="topbar module-topbar-standard">
        <div className="brand">
          <div className="logo-circle">
            <img src="/assets/logo-futura.png" alt="NC" onError={e => { e.target.parentNode.textContent = '' }} />
          </div>
          <div className="brand-text">
            <img src="/assets/futura-wordmark.png" alt="FUTURA" style={{height:22,width:"auto",display:"block"}} />
            <span className="brand-sub">Seguimiento</span>
          </div>
        </div>
        <div className="topbar-right">
          <JefaturaViewControls>
            <span className="topbar-badge">SEGUIMIENTO</span>
            <span className="topbar-user">{usuarioActual}</span>
          </JefaturaViewControls>
          <CambiarAreaMenu />
          <button className="topbar-salir" onClick={salir}>Salir</button>
        </div>
      </div>

      <div className="main-content">
        <div className="page-header">
          <div className="page-header-left">
            <h2>Seguimiento de Ventas</h2>
            <p>Todas las ventas — haz clic en un estado para filtrar</p>
          </div>
        </div>

        {/* LEYENDA */}
        <div className="leyenda">
          {[
            { id: '',          label: 'Todos',            cnt: kpis.total,     cls: 'l-todos'   },
            { id: 'ejecucion', label: 'EN EJECUCIÓN',     cnt: kpis.ejecucion, cls: 'l-ejec'    },
            { id: 'instalado', label: 'INSTALADO',        cnt: kpis.instalado, cls: 'l-inst'    },
            { id: 'rechazo',   label: 'RECHAZO EN CAMPO', cnt: kpis.rechazo,   cls: 'l-rech'    },
            { id: 'caida',     label: 'CAÍDA',            cnt: kpis.caida,     cls: 'l-caida'   },
            { id: 'tecnico',   label: 'TÉCNICOS EN CASA', cnt: kpis.tecnico,   cls: 'l-tecnico' },
            ...ESTADOS.slice(5).map(e => ({ id:e.id, label:e.label, cnt:kpis.adicionales[e.id] || 0, cls:'l-ejec' })),
          ].map(item => (
            <div
              key={item.id}
              className={`leyenda-item ${item.cls}${filtroLeyenda === item.id ? ' activo' : ''}`}
              onClick={() => toggleLeyenda(item.id)}
            >
              {item.label} <span className="leyenda-count">{item.cnt}</span>
            </div>
          ))}
        </div>

        {/* FILTROS */}
        <div className="filtros-panel">
          <div className="filtros-titulo">Filtros avanzados</div>
          <div className="filtros-grid">
            <div className="fg">
              <label>Estado</label>
              <FiltroEstadoMultiple opciones={ESTADOS} seleccionados={fEstados} onChange={cambiarFEstados} />
            </div>
            <div className="fg">
              <label>Vendedor</label>
              <input value={fVendedor} onChange={e => { setFVendedor(e.target.value); setPagina(1) }} placeholder="Buscar vendedor..." />
            </div>
            <div className="fg">
              <label>Sala</label>
              <input value={fSala} onChange={e => { setFSala(e.target.value); setPagina(1) }} placeholder="Escribir sala..." />
            </div>
            <div className="fg">
              <label>Distrito</label>
              <input value={fDistrito} onChange={e => { setFDistrito(e.target.value); setPagina(1) }} placeholder="Buscar distrito..." />
            </div>
            <div className="fg">
              <label>Tramo</label>
              <select value={fTramo} onChange={e => { setFTramo(e.target.value); setPagina(1) }}>
                <option value="">Todos</option>
                {TRAMOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fg fg-tipo-fecha">
              <label>Filtrar por</label>
              <select value={fTipoFecha} onChange={e => { setFTipoFecha(e.target.value); setPagina(1) }}>
                <option value="fecha">Fecha</option>
                <option value="programados">Programados</option>
              </select>
            </div>
            <div className="fg">
              <label>Desde</label>
              <input type="date" value={fDesde} onChange={e => { setFDesde(e.target.value); setPagina(1) }} />
            </div>
            <div className="fg">
              <label>Hasta</label>
              <input type="date" value={fHasta} onChange={e => { setFHasta(e.target.value); setPagina(1) }} />
            </div>
            <div style={{ alignSelf: 'flex-end' }}>
              <button className="btn-limpiar" onClick={limpiarFiltros}>✕ Limpiar</button>
            </div>
          </div>
        </div>

        {/* TABLA */}
        <div className="tabla-wrap">
          <div className="tabla-header">
            <div className="tabla-header-left">
              <span className="tabla-title">Registros de seguimiento</span>
              <span className="tabla-count">{totalPag} registros</span>
              {totalPag > 0 && <span className="pag-info-top">Mostrando {inicio + 1}–{fin} de {totalPag}</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="text" className="tabla-search" value={busqueda}
                onChange={e => { setBusqueda(e.target.value); setPagina(1) }}
                placeholder="Buscar nombre, DNI, vendedor o SOT..." />
              <div className="pag-size">
                <select value={porPagina} onChange={e => { setPorPagina(parseInt(e.target.value) || 18); setPagina(1) }}>
                  <option value="18">18 / pág.</option>
                  <option value="30">30 / pág.</option>
                  <option value="50">50 / pág.</option>
                  <option value="100">100 / pág.</option>
                </select>
              </div>
            </div>
          </div>

          <div className="tabla-scroll">
            <table className="tabla seguimiento-ventas-tabla">
              <colgroup>
                <col style={{ width: 260 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 190 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 75 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 250 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 240 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 160 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="th-acc">ACCIÓN</th>
                  <th className="th-fecha">FECHA PREVENTA</th>
                  <th className="th-obs">OBS. PROGRAMACIÓN</th>
                  <th className="th-est">ESTADO</th>
                  <th className="th-canal">CANAL</th>
                  <th className="th-sot">SOT</th>
                  <th className="th-tramo">TRAMO</th>
                  <th className="th-comment">COMENTARIO</th>
                  <th className="th-cliente">NOMBRE Y APELLIDOS</th>
                  <th className="th-dni">DNI</th>
                  <th className="th-dist">DISTRITO</th>
                  <th className="th-dir">DIRECCIÓN</th>
                  <th className="th-coord">COORDENADAS</th>
                  <th className="th-vend">VENDEDOR</th>
                  <th className="th-sala">SALA</th>
                  <th className="th-hogar">CLARO HOGAR</th>
                  <th className="th-olt">OLT</th>
                  <th className="th-plan">PLAN</th>
                  <th className="th-codigo">TEL. CONT.</th>
                  <th className="th-motivo">MOTIVO</th>
                </tr>
              </thead>
              <tbody>
                {ventasPag.length === 0 ? (
                  <tr><td colSpan="20" style={{ textAlign: 'center', color: '#9ca3af', padding: '36px', fontSize: '13px' }}>Sin registros.</td></tr>
                ) : ventasPag.map(v => {
                  const est     = estadoObj(v._estadoSeg)
                  const motCls  = motivoBadgeCls(v._motivoRech)
                  return (
                    <tr key={v.id} className={est.fila}>
                      <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div className="acciones-cell seg-acciones">
                          <button className="btn-acc btn-acc-obs"    onClick={() => abrirModalObs(v)}    title="Registrar llamada">Llamada</button>
                          <button className="btn-acc btn-acc-agenda" onClick={() => abrirModalAgenda(v)} title="Agendar">Agenda</button>
                          <button className="btn-acc btn-acc-hist"   onClick={() => setModalHist(v)}     title="Historial">Hist.</button>
                          <button className="btn-fotos" onClick={() => setMediaVenta(v)} title="Ver fotos y audio">Archivos</button>
                          <WhatsappSeguimientoBoton
                            enviando={enviandoWA.has(v.id)}
                            waFecha={v._waFecha}
                            waPlantilla={v._waPlantilla}
                            onEnviar={(plantillaId) => enviarWhatsapp(v, plantillaId)}
                          />
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: '#185FA5', fontSize: '10px' }}>{formatF(v.fechaIngreso)}</td>
                      <td>
                        <ProgramacionInfoCell
                          fecha={v.fecha_programada}
                          soloFecha
                          soloFechaLabel="Fecha programada:"
                          onEdit={() => abrirModalProgramacion(v)}
                        />
                      </td>
                      <td className="td-estado">
                        <span className={`badge-seg ${est.cls}`} onClick={() => abrirModalEstado(v)} style={{ cursor: 'pointer' }} title="Click para cambiar estado">
                          {est.label}
                        </span>
                      </td>
                      <td style={{ textAlign:'center' }}><CanalBadge canal={v.canal} /></td>
                      <td style={{ textAlign:'center' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'center' }}>
                          <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:700, color:'#374151' }}>{v.sot || '—'}</span>
                          <button type="button" title="Editar SOT"
                            onClick={() => setSotModal({ id:v.id, valor:v.sot||'', guardando:false })}
                            style={{ border:'none', background:'transparent', cursor:'pointer', padding:2, color:'#64748b', lineHeight:1, flexShrink:0 }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11"><path d="M4 20h4l11-11a2.1 2.1 0 0 0-3-3L5 17l-1 3z" strokeLinejoin="round"/><path d="m14.5 7.5 3 3"/></svg>
                          </button>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {v._tramo ? <span className="badge-tramo">{v._tramo}</span> : '--'}
                      </td>
                      <td className="td-wrap" style={{ fontSize: '10px', background: 'rgba(255,255,200,.4)' }}>{v._comentario || '--'}</td>
                      <td style={{ fontWeight: 600 }}>{v.nombreApellidos || '--'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '10px' }}>{v.dni || '--'}</td>
                      <td style={{ fontSize: '10px' }}>{v.distrito || '--'}</td>
                      <td className="td-wrap" style={{ fontSize: '10px' }}>{v.direccion || '--'}</td>
                      <td style={{ fontSize: '9px', color: '#6b7280' }}>{v.coordenadas || '--'}</td>
                      <td style={{ fontWeight: 600, color: '#7C3AED', fontSize: '10px' }}>{v.asesor_nombre || v.vendedor || '--'}</td>
                      <td style={{ fontWeight: 600, fontSize: '10px' }}>{v.sala || '--'}</td>
                      <td style={{ fontSize: '10px' }}>{v.claro_hogar || '--'}</td>
                      <td style={{ fontSize: '10px' }}>{v.tecnologia || '--'}</td>
                      <td className="td-wrap" style={{ fontSize: '10px' }}>{v.paquete || '--'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '10px' }}>{v.telefonoContacto || '--'}</td>
                      <td>
                        {motCls
                          ? <span className={`badge-motivo ${motCls}`}>{v._motivoRech}</span>
                          : <span style={{ color: '#9ca3af' }}>--</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="paginacion">
            <span className="pag-info">{totalPag > 0 ? `Mostrando ${inicio + 1}–${fin} de ${totalPag}` : ''}</span>
            <Paginacion total={totalPag} pagina={pagina} porPagina={porPagina} onChange={p => { setPagina(p); document.querySelector('.tabla-scroll')?.scrollTo(0, 0) }} />
          </div>
        </div>
      </div>

      {/* MODAL ESTADO */}
      {modalEstado && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModalEstado(null) }}>
          <div className="modal-box">
            <div className="modal-title">Cambiar estado</div>
            <div className="modal-sub">
              Cliente: <strong>{modalEstado.nombreApellidos || '--'}</strong> · Actual: <strong>{estadoObj(modalEstado._estadoSeg).label}</strong>
            </div>
            <div className="modal-grid">
              <div className="modal-campo">
                <label>Nuevo estado *</label>
                <select value={estNuevo} onChange={e => { setEstNuevo(e.target.value); setEstMotivo('') }}>
                  <option value="">-- Estado --</option>
                  {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
                </select>
              </div>
              <div className="modal-campo">
                <label>Tramo</label>
                <select value={estTramo} onChange={e => setEstTramo(e.target.value)}>
                  <option value="">Todos</option>
                  {TRAMOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              {(estNuevo === 'caida' || estNuevo === 'rechazo') && (
                <div className="modal-campo" id="motivoWrap">
                  <label>Motivo *</label>
                  <select value={estMotivo} onChange={e => setEstMotivo(e.target.value)}>
                    <option value="">-- Seleccionar motivo --</option>
                    {motivosParaEstado.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
              <div className="modal-campo" style={{ gridColumn: '1/-1' }}>
                <label>Observación / Comentario</label>
                <textarea value={estObs} onChange={e => setEstObs(e.target.value)}
                  placeholder="Escribe una observación sobre esta venta..." rows="2"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
              </div>
            </div>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={() => setModalEstado(null)}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarEstado}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DATOS DE PROGRAMACIÓN */}
      {modalProgramacion && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModalProgramacion(null) }}>
          <div className="modal-box" style={{ maxWidth: '440px' }}>
            <div className="modal-title">Editar datos de programación</div>
            <div className="modal-sub">Cliente: <strong>{modalProgramacion.nombreApellidos || '--'}</strong></div>
            <div className="modal-grid">
              <div className="modal-campo">
                <label>SOT *</label>
                <input value={progSot} onChange={e => setProgSot(e.target.value)} placeholder="Número de SOT" />
              </div>
              <div className="modal-campo">
                <label>Fecha programada *</label>
                <input type="date" value={progFecha} onChange={e => setProgFecha(e.target.value)} />
              </div>
            </div>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={() => setModalProgramacion(null)}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarProgramacion}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      <MediaViewer
        open={!!mediaVenta}
        onClose={() => setMediaVenta(null)}
        ventaId={mediaVenta?.id}
        title={`Archivos de ${mediaVenta?.nombreApellidos || 'la venta'}`}
        subtitle={`DNI: ${mediaVenta?.dniDocumento || mediaVenta?.dni || '—'} · Tel: ${mediaVenta?.telefonoContacto || '—'}`}
        audioPath={mediaVenta?._audioPath}
        audioName={mediaVenta?._audioNombre}
      />

      {/* MODAL LLAMADA */}
      {modalObs && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModalObs(null) }}>
          <div className="modal-box">
            <div className="modal-title">Registrar llamada</div>
            <div className="modal-sub">Cliente: <strong>{modalObs.nombreApellidos || '--'}</strong></div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '6px' }}>Historial</div>
            <div className="obs-historial">
              {modalObs._historial && modalObs._historial.length
                ? modalObs._historial.map((x, i) => `[${formatF(x.fecha)} ${x.hora} - ${x.user}] ${x.resultado} -- ${x.obs}`).join('\n')
                : 'Sin historial.'
              }
            </div>
            <div className="modal-campo">
              <label>Resultado</label>
              <select value={obsResultado} onChange={e => setObsResultado(e.target.value)}>
                <option value="">-- Resultado --</option>
                {RESULTADOS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="modal-campo">
              <label>Observación *</label>
              <textarea value={obsNueva} onChange={e => setObsNueva(e.target.value)} placeholder="Detalla el resultado..." />
            </div>
            <div className="modal-campo">
              <label>Comentario general (actualizar)</label>
              <input value={obsComentario} onChange={e => setObsComentario(e.target.value)} placeholder="Comentario visible en tabla..." />
            </div>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={() => setModalObs(null)}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarObservacion}>Registrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AGENDA */}
      {modalAgenda && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModalAgenda(null) }}>
          <div className="modal-box" style={{ maxWidth: '400px' }}>
            <div className="modal-title">Agendar seguimiento</div>
            <div className="modal-sub">Cliente: <strong>{modalAgenda.nombreApellidos || '--'}</strong></div>
            <div className="modal-campo">
              <label>Fecha *</label>
              <input type="date" value={agFecha} onChange={e => setAgFecha(e.target.value)} />
            </div>
            <div className="modal-campo">
              <label>Nota</label>
              <textarea value={agNota} onChange={e => setAgNota(e.target.value)} placeholder="Motivo del agendamiento..." rows="3" />
            </div>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={() => setModalAgenda(null)}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarAgenda}>Agendar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SOT */}
      {sotModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget && !sotModal.guardando) setSotModal(null) }}>
          <div className="modal-box" style={{ maxWidth: '380px' }}>
            <div className="modal-title">Editar SOT</div>
            <div className="modal-grid">
              <div className="modal-campo">
                <label>Número de SOT *</label>
                <input autoFocus value={sotModal.valor} maxLength={100}
                  onChange={e => setSotModal(p => ({ ...p, valor: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') guardarSot(); if (e.key === 'Escape' && !sotModal.guardando) setSotModal(null) }}
                  placeholder="Número de SOT" />
              </div>
            </div>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={() => setSotModal(null)} disabled={sotModal.guardando}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarSot} disabled={sotModal.guardando}>{sotModal.guardando ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HISTORIAL */}
      {modalHist && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModalHist(null) }}>
          <div className="modal-box" style={{ maxWidth: '460px' }}>
            <div className="modal-title">Historial</div>
            <div className="modal-sub">{modalHist.nombreApellidos || '--'} · {modalHist.dni || '--'}</div>
            <div className="obs-historial">
              {modalHist._historial && modalHist._historial.length
                ? modalHist._historial.map((x, i) => `[${formatF(x.fecha)} ${x.hora} - ${x.user}] ${x.resultado} -- ${x.obs}`).join('\n')
                : 'Sin historial registrado.'
              }
            </div>
            <div className="modal-btns">
              <button className="btn-guardar" onClick={() => setModalHist(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}

