import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import JefaturaViewControls from '../components/JefaturaViewControls'
import MediaViewer from '../components/MediaViewer'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import CanalBadge from '../components/CanalBadge'
import { API, NC_API, ncHeaders, ncHeadersFile } from '../services/api'
import { responseChanged, setVisibleInterval, clearVisibleInterval } from '../utils/polling'
import '../styles/grabaciones.css'

// ── Constantes ────────────────────────────────────────────────────────────
const ESTADOS_GRAB = [
  { id:'pendiente',      label:'PENDIENTE',      cls:'bg-pendiente'     },
  { id:'grabando',       label:'GRABANDO',       cls:'bg-grabando'      },
  { id:'grabado',        label:'GRABADO',        cls:'bg-grabado'       },
  { id:'corta_llamada',  label:'CORTA LLAMADA',  cls:'bg-corta'         },
  { id:'suplantacion',   label:'SUPLANTACIÓN',   cls:'bg-suplantacion'  },
  { id:'no_desea',       label:'NO DESEA',       cls:'bg-nodesea'       },
  { id:'no_contesta',       label:'NO CONTESTA',       cls:'bg-nocontesta'    },
  { id:'buzon_voz',         label:'BUZÓN DE VOZ',      cls:'bg-buzon'         },
  { id:'esperando_tercero', label:'ESPERANDO TERCERO', cls:'bg-esperando'     },
  { id:'corregir_sec',      label:'CORREGIR SEC',      cls:'bg-corregir'      },
]
// Estados que ya no aparecen en el selector de Back/Grabaciones pero que otros
// módulos (Super de Grabaciones) siguen usando internamente — se conservan
// aquí solo para que la tabla los siga rotulando correctamente.
const ESTADOS_GRAB_BADGE = [
  ...ESTADOS_GRAB,
  { id:'observado', label:'OBSERVADO', cls:'bg-observado' },
]

// ── Utilidades ────────────────────────────────────────────────────────────
function fechaHoy() {
  const ahora = new Date()
  const utcMs = ahora.getTime() + ahora.getTimezoneOffset() * 60000
  const peru  = new Date(utcMs - 5 * 3600000)
  return `${peru.getFullYear()}-${String(peru.getMonth()+1).padStart(2,'0')}-${String(peru.getDate()).padStart(2,'0')}`
}
function horaAhora() { return new Date().toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit',hour12:false}) }
function formatF(f)  { if(!f)return'—'; const p=f.split('-'); return `${p[2]}/${p[1]}/${p[0]}` }
function formatHora(f) {
  if (!f) return '—'
  const m = String(f).match(/[T\s](\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : '—'
}
function fechaPeruDesdeMs(ms) {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000
  const peru = new Date(utcMs - 5 * 3600000)
  return `${peru.getFullYear()}-${String(peru.getMonth()+1).padStart(2,'0')}-${String(peru.getDate()).padStart(2,'0')}`
}
function fechaDesdeAudioPath(path) {
  const m = String(path || '').match(/_(\d{11,})\.[a-z0-9]+$/i)
  return m ? fechaPeruDesdeMs(Number(m[1])) : ''
}
function estadoGrab(id) { return ESTADOS_GRAB_BADGE.find(e=>e.id===id)||ESTADOS_GRAB_BADGE[0] }
function primerNombre(nombre) { return String(nombre || '').trim().split(/\s+/)[0] || '' }
// Extrae la fecha (yyyy-mm-dd) de la última línea "[dd/mm/yyyy ... ] VALIDADO"
// que Validación escribe en obs_validacion al tipificar. Esa línea es el único
// registro real de "cuándo esta venta pasó Validación y entró a Grabaciones";
// no existe columna fecha_validacion en la BD.
function fechaValidacionDesdeObs(obs) {
  if (!obs) return ''
  const lineas = String(obs).split('\n')
  for (let i = lineas.length - 1; i >= 0; i--) {
    const m = lineas[i].match(/^\[(\d{2})\/(\d{2})\/(\d{4})[^\]]*\]\s*VALIDADO\s*$/i)
    if (m) return `${m[3]}-${m[2]}-${m[1]}`
  }
  return ''
}
function getDateLabel() {
  const d = new Date()
  const dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
function mapVenta(v) {
  const fechaRaw = (v.created_at||'').split(' ')[0].split('T')[0]
  const fechaValidacion = fechaValidacionDesdeObs(v.obs_validacion)
  return {
    ...v,
    nombreApellidos:  v.nombre        || '',
    telefonoContacto: v.telefono1     || '',
    vendedor:         v.asesor_nombre || '',
    distrito:         v.distrito      || '',
    direccion:        v.direccion     || '',
    sala:             v.sala          || '',
    email:            v.email         || '',
    fechaIngreso:     fechaRaw,
    // Fecha en que la venta entró al flujo de Grabaciones = cuándo pasó
    // Validación (no la fecha de creación de la venta). Ventas viejas sin
    // ese historial parseable caen a created_at como último recurso.
    _fechaGrab:       fechaValidacion || fechaRaw || fechaHoy(),
    _estadoGrab:      v.estado_grab   || 'pendiente',
    _estadoSupGrab:   String(v.estado_supgrab || '').toLowerCase(),
    _horaSupResultado:v.fecha_sup_resultado || '',
    _grabAudio:       v.audio_path    || null,
    _grabNombre:      v.audio_path    ? v.audio_path.split('/').pop() : '',
    _grabObs:         v.observacion   || '',
  }
}

// ── Sub-componente: Paginación ─────────────────────────────────────────────
function Paginacion({ total, pagina, porPagina, onChange }) {
  const totalPags = Math.max(1, Math.ceil(total / porPagina))
  const ini  = Math.max(1, pagina - 3)
  const fin2 = Math.min(totalPags, ini + 6)
  const pages = []
  for (let p = ini; p <= fin2; p++) pages.push(p)
  return (
    <div className="pag-btns">
      <button className="pag-btn" onClick={()=>onChange(pagina-1)} disabled={pagina<=1}>‹</button>
      {ini > 1 && <>
        <button className="pag-btn" onClick={()=>onChange(1)}>1</button>
        {ini > 2 && <span style={{padding:'0 4px',color:'#9ca3af'}}>…</span>}
      </>}
      {pages.map(p => (
        <button key={p} className={`pag-btn${p===pagina?' active':''}`} onClick={()=>onChange(p)}>{p}</button>
      ))}
      {fin2 < totalPags && <>
        {fin2 < totalPags-1 && <span style={{padding:'0 4px',color:'#9ca3af'}}>…</span>}
        <button className="pag-btn" onClick={()=>onChange(totalPags)}>{totalPags}</button>
      </>}
      <button className="pag-btn" onClick={()=>onChange(pagina+1)} disabled={pagina>=totalPags}>›</button>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────
export default function Grabaciones() {
  const navigate  = useNavigate()
  const { sesion, logout } = useAuth()
  const toastTimer  = useRef(null)
  const audioRef    = useRef(null)
  const fileInputRef= useRef(null)

  // ── Data ──
  const [ventas,     setVentas]     = useState([])
  const [tabActiva,  setTabActiva]  = useState(() => sessionStorage.getItem('nc_grabaciones_tab') || 'hoy')
  const [fechaLabel, setFechaLabel] = useState(getDateLabel)

  // ── Filtros ──
  const [fEstado,  setFEstado]  = useState('')
  const [fDoc,     setFDoc]     = useState('')
  const [fVendedor,setFVendedor]= useState('')
  const [fDesde,   setFDesde]   = useState('')
  const [fHasta,   setFHasta]   = useState('')
  const [busqueda, setBusqueda] = useState('')

  // ── Paginación ──
  const [pagina,    setPagina]    = useState(1)
  const [porPagina, setPorPagina] = useState(18)

  // ── Modal estado ──
  const [modalEstado,    setModalEstado]    = useState({ open:false, id:null })
  const [nuevoEstadoSel, setNuevoEstadoSel] = useState('pendiente')

  // ── Modal subir ──
  const [modalSubir,  setModalSubir]  = useState({ open:false, id:null })
  const [archivoSel,  setArchivoSel]  = useState(null)
  const [subirInfo,   setSubirInfo]   = useState('')
  const [subirDrag,   setSubirDrag]   = useState(false)
  const [subirLoading,setSubirLoading]= useState(false)

  // ── Modal audio ──
  const [modalAudio, setModalAudio] = useState({ open:false, id:null })
  const [audioSrc,   setAudioSrc]   = useState('')
  const [audioLoading, setAudioLoading] = useState(false)

  // ── Modal obs ──
  const [modalObs, setModalObs] = useState({ open:false, id:null })
  const [mediaVenta, setMediaVenta] = useState(null)
  const [nuevaObs, setNuevaObs] = useState('')

  // ── Toast ──
  const [toast, setToast] = useState('')

  // ── Helpers ──────────────────────────────────────────────────────────────
  function mostrarToast(msg) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }

  function cambiarTab(tab) {
    sessionStorage.setItem('nc_grabaciones_tab', tab)
    setTabActiva(tab)
    setBusqueda('')
    setPagina(1)
  }

  // ── API ──────────────────────────────────────────────────────────────────
  const cargandoVentasRef = useRef(false)
  const firmaVentasRef = useRef('')
  const cargarVentas = useCallback(async () => {
    if (cargandoVentasRef.current) return  // evita polls solapados (respuestas fuera de orden que causan parpadeo)
    cargandoVentasRef.current = true
    try {
      const res  = await fetch(`${API}/ventas?estado=validado`, { headers: ncHeaders() })
      const data = await res.json()
      if (data.ok && responseChanged(firmaVentasRef, data.data)) {
        setVentas(data.data
          .filter(v => {
            const e  = (v.estado||'').toLowerCase()
            const eg = (v.estado_grab||'').toLowerCase()
            // Ya no depende de que `estado` cambie a 'grabado' (eso pisaría
            // Validación). Una vez Back marca GRABADO, estado_grab='grabado'
            // saca la venta de esta cola porque pasa a Super de Grabaciones;
            // si Super la observa (estado_grab='observado') vuelve a aparecer.
            return e==='validado' && eg!=='grabado'
          })
          .map(mapVenta)
        )
      }
    } catch(e) { console.error('Error cargando grabaciones:', e) }
    finally { cargandoVentasRef.current = false }
  }, [])

  useEffect(() => {
    cargarVentas()
    const t = setVisibleInterval(cargarVentas, 1000)
    return () => clearVisibleInterval(t)
  }, [cargarVentas])

  useEffect(() => {
    const t = setInterval(() => setFechaLabel(getDateLabel()), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { setPagina(1) }, [fEstado, fDoc, fVendedor, fDesde, fHasta, busqueda, tabActiva])

  // ── Computed ─────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const hoy = fechaHoy()
    return {
      hoy:        ventas.filter(v => v._fechaGrab === hoy).length,
      pendientes: ventas.filter(v => v._fechaGrab < hoy).length,
      grabados:   ventas.filter(v => v._estadoGrab === 'grabado').length,
      observados: ventas.filter(v => v._estadoGrab === 'observado').length,
    }
  }, [ventas])

  const ventasFiltradas = useMemo(() => {
    const hoy  = fechaHoy()
    const base = tabActiva === 'hoy'
      ? ventas.filter(v => v._fechaGrab === hoy)
      : ventas.filter(v => v._fechaGrab < hoy)
    return base.filter(v => {
      if (fVendedor && !(v.vendedor||'').toLowerCase().includes(fVendedor.toLowerCase())) return false
      if (fDesde    && v.fechaIngreso < fDesde) return false
      if (fHasta    && v.fechaIngreso > fHasta) return false
      if (fDoc      && !(v.dni||'').toLowerCase().includes(fDoc.toLowerCase())) return false
      if (fEstado   && v._estadoGrab !== fEstado) return false
      if (busqueda) {
        const b = busqueda.toLowerCase()
        if (![(v.nombreApellidos||''),(v.dni||''),(v.telefonoContacto||''),(v.vendedor||'')].some(c=>c.toLowerCase().includes(b))) return false
      }
      return true
    })
  }, [ventas, tabActiva, fEstado, fDoc, fVendedor, fDesde, fHasta, busqueda])

  const totalPags    = Math.max(1, Math.ceil(ventasFiltradas.length / porPagina))
  const pagActual    = Math.min(pagina, totalPags)
  const inicio       = (pagActual - 1) * porPagina
  const fin          = Math.min(inicio + porPagina, ventasFiltradas.length)
  const paginaVentas = ventasFiltradas.slice(inicio, fin)
  const hoy          = fechaHoy()

  // ── Modal Estado ─────────────────────────────────────────────────────────
  function abrirModalEstado(id) {
    const v = ventas.find(x=>x.id===id); if (!v) return
    setModalEstado({ open:true, id })
    setNuevoEstadoSel(v._estadoGrab || 'pendiente')
  }

  async function guardarEstado() {
    const v = ventas.find(x=>x.id===modalEstado.id); if (!v) return
    if (nuevoEstadoSel === 'grabado') {
      try {
        const res  = await fetch(`${API}/ventas/${v.id}`, {
          method:'PATCH', headers:ncHeaders(),
          // No se toca `estado` (campo de Validación) — solo el campo
          // independiente de Grabaciones. Super de Grabaciones lee su cola
          // desde estado_grab, no desde estado.
          body: JSON.stringify({ estado_grab:'grabado', estado_supgrab:'sin_revisar' }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) { mostrarToast('Error: ' + (data.mensaje||'no se pudo guardar')); return }
      } catch(e) { console.error('Error guardando estado:', e); mostrarToast('Error conectando al servidor'); return }
      setVentas(list => list.filter(x=>x.id!==v.id))
      setModalEstado({ open:false, id:null })
      return
    }
    try {
      const res  = await fetch(`${API}/ventas/${v.id}`, {
        method:'PATCH', headers:ncHeaders(),
        body: JSON.stringify({ estado_grab: nuevoEstadoSel }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) { mostrarToast('Error: ' + (data.mensaje||'no se pudo guardar')); return }
      setVentas(list => list.map(x => x.id===v.id ? { ...x, _estadoGrab:nuevoEstadoSel } : x))
    } catch(e) { console.error('Error guardando estado:', e); mostrarToast('Error conectando al servidor'); return }
    setModalEstado({ open:false, id:null })
  }

  // ── Modal Subir ───────────────────────────────────────────────────────────
  function abrirModalSubir(id) {
    const v = ventas.find(x=>x.id===id); if (!v) return
    setModalSubir({ open:true, id })
    setArchivoSel(null)
    setSubirInfo('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileSelect(files) {
    if (!files || !files.length) return
    const file = files[0]
    if (!file.name.match(/\.mp3$/i)) {
      setArchivoSel(null)
      setSubirInfo('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      mostrarToast('Solo se permiten archivos MP3')
      return
    }
    setArchivoSel(file)
    setSubirInfo(`${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`)
  }

  async function eliminarAudio(id) {
    const v = ventas.find(x=>x.id===id)
    if (!v || !v._grabAudio) return
    if (!window.confirm('¿Eliminar esta grabación? Podrás subir otro archivo MP3.')) return

    try {
      const res = await fetch(`${API}/ventas/${id}/audio`, {
        method:'DELETE',
        headers:ncHeaders(),
      })
      const data = await res.json().catch(()=>({}))
      if (!res.ok || !data.ok) {
        mostrarToast('Error: ' + (data.mensaje||'no se pudo eliminar el audio'))
        return
      }
      setVentas(list => list.map(x => x.id===id
        ? { ...x, _grabAudio:null, _grabNombre:'', audio_path:null, _estadoGrab:'pendiente', estado_grab:'pendiente', estado_supgrab:'sin_revisar' }
        : x
      ))
      mostrarToast('Grabación eliminada. Ya puedes subir otro MP3')
    } catch(e) {
      console.error('Error eliminando audio:', e)
      mostrarToast('Error conectando al servidor')
    }
  }

  async function guardarAudio() {
    if (!archivoSel) { mostrarToast('Selecciona un archivo primero'); return }
    const v = ventas.find(x=>x.id===modalSubir.id); if (!v) return
    setSubirLoading(true)

    const formData = new FormData()
    formData.append('audio', archivoSel)

    let rutaAudio = null
    try {
      const uploadRes  = await fetch(`${API}/ventas/${v.id}/audio`, {
        method:'POST', headers:ncHeadersFile(), body:formData,
      })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok || !uploadData.ok) {
        mostrarToast('Error: ' + (uploadData.mensaje||'no se pudo subir el audio'))
        setSubirLoading(false)
        return
      }
      rutaAudio = uploadData.ruta
    } catch(e) {
      console.error('Error subiendo audio:', e)
      mostrarToast('Error conectando al servidor')
      setSubirLoading(false)
      return
    }

    try {
      const res  = await fetch(`${API}/ventas/${v.id}`, {
        method:'PATCH', headers:ncHeaders(),
        body: JSON.stringify({
          // No se toca `estado` (campo de Validación) — solo Grabaciones.
          estado_grab:'grabado',
          estado_supgrab:'sin_revisar',
          ...(rutaAudio ? { audio_path:rutaAudio } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        mostrarToast('Error: ' + (data.mensaje||'no se pudo guardar'))
        setSubirLoading(false)
        return
      }
    } catch(e) {
      console.error('Error guardando estado tras subir audio:', e)
      mostrarToast('Error conectando al servidor')
      setSubirLoading(false)
      return
    }

    setVentas(list => list.filter(x=>x.id!==v.id))
    setModalSubir({ open:false, id:null })
    setArchivoSel(null); setSubirInfo(''); setSubirLoading(false)
  }

  // ── Modal Audio ───────────────────────────────────────────────────────────
  async function prepararAudioUrl(ruta) {
    const url = `${NC_API}/${ruta}`
    const resp = await fetch(url, { headers:ncHeadersFile() })
    if (!resp.ok) throw new Error(`Audio no disponible (${resp.status})`)
    const blob = await resp.blob()
    return URL.createObjectURL(blob)
  }

  async function abrirModalAudio(id) {
    const v = ventas.find(x=>x.id===id); if (!v) return
    if (!v._grabAudio) { mostrarToast('Esta venta no tiene grabación'); return }
    if (audioSrc && audioSrc.startsWith('blob:')) URL.revokeObjectURL(audioSrc)
    setAudioSrc('')
    setAudioLoading(true)
    setModalAudio({ open:true, id })
    try {
      const blobUrl = await prepararAudioUrl(v._grabAudio)
      setAudioSrc(blobUrl)
    } catch (err) {
      console.error('No se pudo abrir el audio', err)
      mostrarToast('No se pudo abrir el audio. Revisa que el archivo exista.')
    } finally {
      setAudioLoading(false)
    }
  }

  function cerrarModalAudio() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src='' }
    if (audioSrc && audioSrc.startsWith('blob:')) URL.revokeObjectURL(audioSrc)
    setModalAudio({ open:false, id:null }); setAudioSrc('')
    setAudioLoading(false)
  }

  async function descargarAudio(id) {
    const v = ventas.find(x=>x.id===id)
    if (!v || !v._grabAudio) { mostrarToast('Esta venta no tiene grabación'); return }
    const nombre = v._grabNombre || `grabacion_${id}.mp3`
    try {
      const url = await prepararAudioUrl(v._grabAudio)
      const a = document.createElement('a')
      a.href=url; a.download=nombre
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      setTimeout(()=>URL.revokeObjectURL(url), 1500)
    } catch (err) {
      console.error('No se pudo descargar el audio', err)
      mostrarToast('No se pudo descargar el audio.')
    }
  }

  // ── Modal Obs ─────────────────────────────────────────────────────────────
  function abrirModalObs(id) {
    const v = ventas.find(x=>x.id===id); if (!v) return
    setModalObs({ open:true, id }); setNuevaObs('')
  }

  async function guardarObservacion() {
    const v = ventas.find(x=>x.id===modalObs.id); if (!v) return
    if (!nuevaObs.trim()) { mostrarToast('Escribe una observación'); return }
    const prevObs   = v._grabObs ? v._grabObs + '\n' : ''
    const nombre    = sesion?.nombre || 'Grabaciones'
    const obsNueva  = prevObs + '[' + formatF(fechaHoy()) + ' ' + horaAhora() + ' - ' + nombre + '] ' + nuevaObs.trim()
    await fetch(`${API}/ventas/${v.id}`, {
      method:'PATCH', headers:ncHeaders(), body: JSON.stringify({ observacion: obsNueva }),
    }).catch(e => console.error('Error obs:', e))
    setVentas(list => list.map(x => x.id===v.id ? { ...x, _grabObs:obsNueva } : x))
    setModalObs({ open:false, id:null }); setNuevaObs('')
  }

  // ── JSX ───────────────────────────────────────────────────────────────────
  const vAudio  = ventas.find(x=>x.id===modalAudio.id)
  const vSubir  = ventas.find(x=>x.id===modalSubir.id)
  const vEstado = ventas.find(x=>x.id===modalEstado.id)
  const vObs    = ventas.find(x=>x.id===modalObs.id)

  return (
    <div>
      {/* TOPBAR */}
      <div className="topbar module-topbar-standard">
        <div className="brand">
          <div className="logo-circle">
            <img src="/assets/logo-futura.png" alt="NC" onError={e=>{ e.target.parentNode.textContent='NC' }} />
          </div>
          <div className="brand-text">
            <img src="/assets/futura-wordmark.png" alt="FUTURA" style={{height:22,width:"auto",display:"block"}} />
            <span className="brand-sub">Grabaciones</span>
          </div>
        </div>
        <div className="topbar-right">
          <JefaturaViewControls>
            <span className="topbar-fecha">{fechaLabel}</span>
            <span className="topbar-badge">GRABACIONES</span>
            <span className="topbar-user">{sesion?.nombre || 'Grabaciones'}</span>
          </JefaturaViewControls>
          <CambiarAreaMenu />
          <button className="topbar-salir" onClick={()=>{ logout(); navigate('/') }}>Salir</button>
        </div>
      </div>

      <div className="main-content">

        {/* PAGE HEADER */}
        <div className="page-header">
          <div className="page-header-left">
            <h2>Módulo de Grabaciones</h2>
            <p>Solo ventas con estado VALIDADO</p>
          </div>
        </div>

        {/* KPI STRIP */}
        <div className="kpi-strip">
          <div className="kpi-item k-blue"><div><div className="kpi-num">{kpis.hoy}</div><div className="kpi-label">Ventas de hoy</div></div></div>
          <div className="kpi-item k-orange"><div><div className="kpi-num">{kpis.pendientes}</div><div className="kpi-label">Pendientes anteriores</div></div></div>
          <div className="kpi-item k-green"><div><div className="kpi-num">{kpis.grabados}</div><div className="kpi-label">Grabados</div></div></div>
          <div className="kpi-item k-purple"><div><div className="kpi-num">{kpis.observados}</div><div className="kpi-label">Observados</div></div></div>
        </div>

        {/* TABS */}
        <div className="tabs-bar">
          <button className={`tab-btn${tabActiva==='hoy'?' active':''}`} onClick={()=>cambiarTab('hoy')}>
            Hoy <span className="tab-count">{kpis.hoy}</span>
          </button>
          <button className={`tab-btn${tabActiva==='pendientes'?' active':''}`} onClick={()=>cambiarTab('pendientes')}>
            Pendientes anteriores <span className="tab-count">{kpis.pendientes}</span>
          </button>
        </div>

        {/* FILTROS */}
        <div className="filtros-panel">
          <div className="filtros-titulo">Filtros</div>
          <div className="filtros-grid">
            <div className="fg">
              <label>Estado grabación</label>
              <select value={fEstado} onChange={e=>setFEstado(e.target.value)}>
                <option value="">Todos</option>
                {ESTADOS_GRAB.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>DNI / RUC / CE</label>
              <input value={fDoc} onChange={e=>setFDoc(e.target.value)} placeholder="Buscar por documento..." style={{fontFamily:'monospace'}} />
            </div>
            <div className="fg">
              <label>Vendedor / Asesor</label>
              <input value={fVendedor} onChange={e=>setFVendedor(e.target.value)} placeholder="Buscar vendedor..." />
            </div>
            <div className="fg">
              <label>Desde</label>
              <input type="date" value={fDesde} onChange={e=>setFDesde(e.target.value)} />
            </div>
            <div className="fg">
              <label>Hasta</label>
              <input type="date" value={fHasta} onChange={e=>setFHasta(e.target.value)} />
            </div>
            <div style={{alignSelf:'flex-end'}}>
              <button className="btn-limpiar" onClick={()=>{ setFEstado(''); setFDoc(''); setFVendedor(''); setFDesde(''); setFHasta(''); setBusqueda('') }}>✕ Limpiar</button>
            </div>
          </div>
        </div>

        {/* TABLA */}
        <div className="tabla-wrap">
          <div className="tabla-header">
            <div className="tabla-header-left">
              <span className="tabla-title">Ventas validadas</span>
              <span className="tabla-count">{ventasFiltradas.length} registros</span>
              {ventasFiltradas.length > 0 && (
                <span style={{fontSize:11,color:'#9ca3af',fontWeight:600}}>Mostrando {inicio+1}–{fin} de {ventasFiltradas.length}</span>
              )}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <input
                type="text"
                className="tabla-search"
                value={busqueda}
                onChange={e=>setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, DNI, vendedor..."
              />
              <div className="pag-size">
                <select value={porPagina} onChange={e=>{ setPorPagina(parseInt(e.target.value)||18); setPagina(1) }} title="Por página">
                  <option value="18">18 / pág</option>
                  <option value="30">30 / pág</option>
                  <option value="50">50 / pág</option>
                </select>
              </div>
            </div>
          </div>

          <div className="tabla-scroll">
            <table className="tabla grabaciones-ventas-tabla">
              <colgroup>
                <col style={{width:295}} />
                <col style={{width:170}} />
                <col style={{width:100}} />
                <col style={{width:135}} />
                <col style={{width:50}} />
                <col style={{width:120}} />
                <col style={{width:160}} />
                <col style={{width:80}} />
                <col style={{width:100}} />
                <col style={{width:115}} />
                <col style={{width:180}} />
                <col style={{width:75}} />
                <col style={{width:180}} />
                <col style={{width:150}} />
                <col style={{width:120}} />
                <col style={{width:150}} />
                <col style={{width:160}} />
              </colgroup>
              <thead>
                <tr>
                  <th>ACCIONES</th>
                  <th>ESTADO GRAB.</th>
                  <th>CANAL</th>
                  <th>RESULTADO SUP.</th>
                  <th>HORA</th>
                  <th>FECHA</th>
                  <th>NOMBRE Y APELLIDOS</th>
                  <th>DNI / DOC.</th>
                  <th>TEL. CONTACTO</th>
                  <th>DISTRITO</th>
                  <th>DIRECCIÓN</th>
                  <th>SALA</th>
                  <th>EMAIL</th>
                  <th>VENDEDOR</th>
                  <th>SUPERVISOR</th>
                  <th>ARCHIVO AUDIO</th>
                  <th>ÚLTIMA OBS.</th>
                </tr>
              </thead>
              <tbody>
                {paginaVentas.length === 0
                  ? <tr><td colSpan={17} className="tabla-empty">{tabActiva==='hoy'?'No hay ventas validadas para hoy.':'No hay ventas pendientes.'}</td></tr>
                  : paginaVentas.map(v => {
                      const esAnterior = v._fechaGrab < hoy
                      const tieneAudio = !!v._grabAudio
                      const eg         = estadoGrab(v._estadoGrab)
                      const ultimaObs  = v._grabObs ? v._grabObs.split('\n').filter(Boolean).slice(-1)[0]?.substring(0,50) || '—' : '—'
                      return (
                        <tr key={v.id} className={esAnterior?'fila-pendiente':''}>
                          <td>
                            <div className="acciones-cell">

                              <button className="btn-acc btn-acc-obs"    onClick={()=>abrirModalObs(v.id)}    title="Observación">Obs.</button>
                              <button className="btn-acc btn-acc-subir"  onClick={()=>abrirModalSubir(v.id)}  title="Subir grabación">Subir</button>
                              <button className="btn-acc btn-acc-eliminar-audio" onClick={()=>eliminarAudio(v.id)} disabled={!tieneAudio} title={tieneAudio?'Eliminar grabación':'No hay grabación para eliminar'} aria-label="Eliminar grabación">🗑</button>
                              <button className="btn-acc btn-acc-estado" onClick={()=>abrirModalEstado(v.id)} title="Cambiar estado">Estado</button>
                              <button className="btn-fotos btn-archivos" onClick={()=>setMediaVenta(v)} title="Ver fotos y documentos">Archivos</button>
                            </div>
                          </td>
                          <td><span className={`badge-grab ${eg.cls}`}>{eg.id==='grabando' && v.grabando_por_nombre ? `GRABANDO ${primerNombre(v.grabando_por_nombre).toUpperCase()}` : eg.label}</span></td>
                          <td><CanalBadge canal={v.canal} /></td>
                          <td>
                            {v._estadoSupGrab === 'observado'
                              ? <span className="badge-grab bg-observado">OBSERVADO</span>
                              : v._estadoSupGrab === 'no_conforme'
                                ? <span className="badge-grab" style={{background:'#fef2f2',color:'#b91c1c',border:'1px solid #fca5a5'}}>NO CONFORME</span>
                                : <span style={{color:'#9ca3af'}}>—</span>}
                          </td>
                          <td style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:'#dc2626'}}>
                            {['no_conforme','observado'].includes(v._estadoSupGrab) ? formatHora(v._horaSupResultado) : '—'}
                          </td>
                          <td>
                            <span style={{color:'#185FA5',fontWeight:700,fontSize:11}}>{formatF(v.fechaIngreso)}</span>
                            {esAnterior && <span className="badge-anterior">ANTERIOR</span>}
                          </td>
                          <td style={{fontWeight:600}}>{v.nombreApellidos||'—'}</td>
                          <td style={{fontFamily:'monospace',fontSize:11}}>{v.dni||'—'}</td>
                          <td style={{fontFamily:'monospace',color:'#185FA5',fontWeight:700}}>{v.telefonoContacto||'—'}</td>
                          <td>{v.distrito||'—'}</td>
                          <td className="grab-texto-ajustable" title={v.direccion||''}>{v.direccion||'—'}</td>
                          <td style={{fontWeight:600}}>{v.sala||'—'}</td>
                          <td className="grab-texto-ajustable" title={v.email||''}>{v.email||'—'}</td>
                          <td style={{fontWeight:600,color:'#7C3AED'}}>{v.vendedor||'—'}</td>
                          <td style={{fontSize:11}}>{v.supervisor||'—'}</td>
                          <td>
                            {tieneAudio
                              ? <span style={{color:'#16a34a',fontWeight:600,fontSize:11}}>{v._grabNombre||'Archivo subido'}</span>
                              : <span style={{color:'#9ca3af',fontSize:11,fontStyle:'italic'}}>Sin grabación</span>}
                          </td>
                          <td style={{fontSize:10,color:'#6b7280'}}>{ultimaObs}</td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>

          <div className="paginacion">
            <span className="pag-info">
              {ventasFiltradas.length > 0 ? `${pagActual} / ${totalPags}` : ''}
            </span>
            <Paginacion
              total={ventasFiltradas.length}
              pagina={pagActual}
              porPagina={porPagina}
              onChange={p=>{ const tp=Math.max(1,Math.ceil(ventasFiltradas.length/porPagina)); setPagina(Math.max(1,Math.min(p,tp))) }}
            />
          </div>
        </div>

      </div>

      <MediaViewer
        open={!!mediaVenta}
        onClose={()=>setMediaVenta(null)}
        ventaId={mediaVenta?.id}
        title={`Archivos de ${mediaVenta?.nombreApellidos || 'la venta'}`}
        subtitle={`DNI: ${mediaVenta?.dni || '—'} · Tel: ${mediaVenta?.telefonoContacto || '—'}`}
        audioPath={mediaVenta?._grabAudio}
        audioName={mediaVenta?._grabNombre}
      />

      {/* ══ MODAL ESTADO ═════════════════════════════════════════════════════ */}
      {modalEstado.open && (
        <div className="modal-bg open" onClick={e=>{ if(e.target===e.currentTarget) setModalEstado({open:false,id:null}) }}>
          <div className="modal-box" style={{maxWidth:360}}>
            <div className="modal-title">Cambiar estado de grabación</div>
            <div className="modal-sub">Estado actual: <strong>{vEstado ? (vEstado._estadoGrab==='grabando' && vEstado.grabando_por_nombre ? `GRABANDO ${primerNombre(vEstado.grabando_por_nombre).toUpperCase()}` : estadoGrab(vEstado._estadoGrab).label) : '—'}</strong></div>
            <div className="modal-campo">
              <label>Nuevo estado</label>
              <select value={nuevoEstadoSel} onChange={e=>setNuevoEstadoSel(e.target.value)}>
                {ESTADOS_GRAB.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </div>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={()=>setModalEstado({open:false,id:null})}>Cancelar</button>
              <button type="button" className="btn-guardar modal-guardar-estable" onClick={guardarEstado}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL SUBIR ══════════════════════════════════════════════════════ */}
      {modalSubir.open && (
        <div className="modal-bg open" onClick={e=>{ if(e.target===e.currentTarget) setModalSubir({open:false,id:null}) }}>
          <div className="modal-box" style={{maxWidth:440}}>
            <div className="modal-title">Subir grabación</div>
            <div className="modal-sub">Cliente: <strong>{vSubir?.nombreApellidos||'—'}</strong></div>
            <div
              className="upload-zone"
              style={subirDrag?{borderColor:'#2563eb',background:'#eff6ff'}:{}}
              onClick={()=>fileInputRef.current?.click()}
              onDragOver={e=>{ e.preventDefault(); setSubirDrag(true) }}
              onDragLeave={()=>setSubirDrag(false)}
              onDrop={e=>{ e.preventDefault(); setSubirDrag(false); handleFileSelect(e.dataTransfer.files) }}
            >
              <div className="upload-icon"></div>
              <div style={{fontSize:13,fontWeight:600,color:'#374151',marginTop:6}}>Arrastra tu archivo aquí o haz clic</div>
              <p>Acepta únicamente archivos MP3</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,audio/mpeg"
                style={{display:'none'}}
                onChange={e=>handleFileSelect(e.target.files)}
              />
            </div>
            {subirInfo && (
              <div style={{marginTop:8,color:'#16a34a',fontWeight:600,fontSize:13}}>{subirInfo}</div>
            )}
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={()=>{ setModalSubir({open:false,id:null}); setArchivoSel(null); setSubirInfo('') }}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarAudio} disabled={subirLoading}>
                {subirLoading ? 'Subiendo...' : 'Subir grabación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL AUDIO ══════════════════════════════════════════════════════ */}
      {modalAudio.open && (
        <div className="modal-bg open" onClick={e=>{ if(e.target===e.currentTarget) cerrarModalAudio() }}>
          <div className="modal-box" style={{maxWidth:460}}>
            <div className="modal-title">Grabación</div>
            <div className="modal-sub">
              Cliente: <strong>{vAudio?.nombreApellidos||'—'}</strong> ·{' '}
              Vendedor: <strong>{vAudio?.vendedor||'—'}</strong> ·{' '}
              Fecha: <strong>{formatF(vAudio?.fechaIngreso||'')}</strong>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:.3,marginBottom:6}}>Archivo</div>
              <div style={{fontSize:12,color:'#374151',fontWeight:600}}>{vAudio?._grabNombre||'—'}</div>
            </div>
            <div className="audio-player">
              {audioLoading
                ? <div className="audio-no">Preparando audio...</div>
                : audioSrc
                  ? <audio ref={audioRef} src={audioSrc} controls style={{width:'100%',height:40}} />
                  : <div className="audio-no">Sin grabación cargada para esta venta.</div>
              }
            </div>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={cerrarModalAudio}>Cerrar</button>
              {audioSrc && (
                <button className="btn-guardar" style={{background:'#059669'}} onClick={()=>descargarAudio(modalAudio.id)}>Descargar</button>
              )}
              <button
                className="btn-guardar"
                style={{background:'#2563eb'}}
                onClick={()=>{ cerrarModalAudio(); abrirModalSubir(modalAudio.id) }}
              >
                Cambiar archivo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL OBS ════════════════════════════════════════════════════════ */}
      {modalObs.open && (
        <div className="modal-bg open" onClick={e=>{ if(e.target===e.currentTarget) setModalObs({open:false,id:null}) }}>
          <div className="modal-box" style={{maxWidth:440}}>
            <div className="modal-title">Observación</div>
            <div className="modal-sub">Cliente: <strong>{vObs?.nombreApellidos||'—'}</strong></div>
            <div style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:.3,marginBottom:6}}>Historial</div>
            <div className="obs-historial">{vObs?._grabObs||'Sin observaciones previas.'}</div>
            <div className="modal-campo">
              <label>Nueva observación</label>
              <textarea
                value={nuevaObs}
                onChange={e=>setNuevaObs(e.target.value)}
                placeholder="Escribe aquí tu observación..."
              />
            </div>
            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={()=>setModalObs({open:false,id:null})}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarObservacion}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TOAST ═══════════════════════════════════════════════════════════ */}
    </div>
  )
}
