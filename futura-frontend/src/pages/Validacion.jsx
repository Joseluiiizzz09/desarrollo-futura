import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import JefaturaViewControls from '../components/JefaturaViewControls'
import MediaViewer from '../components/MediaViewer'
import CanalBadge from '../components/CanalBadge'
import { API, ncHeaders } from '../services/api'
import { responseChanged, setVisibleInterval, clearVisibleInterval } from '../utils/polling'
import '../styles/validacion.css'

// ── Constantes ────────────────────────────────────────────────────────────
const ESTADOS_TODOS = [
  { id:'venta',          label:'VENTA',           cls:'be-venta' },
  { id:'validado',       label:'VALIDADO',        cls:'be-validado' },
  { id:'instalado',      label:'INSTALADO',       cls:'be-instalado' },
  { id:'programado',     label:'PROGRAMADO',      cls:'be-programado' },
  { id:'caida',          label:'CAÍDA',           cls:'be-caida' },
  { id:'observado',      label:'OBSERVADO',       cls:'be-observado' },
  { id:'pendiente',      label:'PENDIENTE',       cls:'be-pendiente' },
  { id:'corta_llamada',  label:'CORTA LLAMADA',   cls:'be-corta' },
  { id:'fraude',         label:'FRAUDE',          cls:'be-fraude' },
  { id:'no_desea',       label:'NO DESEA',        cls:'be-nodesea' },
  { id:'no_contesta',    label:'NO CONTESTA',     cls:'be-nocontesta' },
  { id:'buzon_voz',      label:'BUZON DE VOZ',    cls:'be-buzon' },
  { id:'grabando',       label:'GRABANDO',        cls:'be-grabando' },
  { id:'servicio_activo',label:'SERVICIO ACTIVO', cls:'be-servicio' },
  { id:'corregir',       label:'CORREGIR',        cls:'be-observado' },
  { id:'mala_oferta',    label:'MALA OFERTA',     cls:'be-malaoferta' },
]

const TIP_BTNS = [
  { id:'corta_llamada',   label:'CORTA LLAMADA',    cls:'be-corta' },
  { id:'fraude',          label:'FRAUDE',           cls:'be-fraude' },
  { id:'no_desea',        label:'NO DESEA',         cls:'be-nodesea' },
  { id:'no_contesta',     label:'NO CONTESTA',      cls:'be-nocontesta' },
  { id:'buzon_voz',       label:'BUZÓN DE VOZ',     cls:'be-buzon' },
  { id:'servicio_activo', label:'SERVICIO ACTIVO',  cls:'be-servicio' },
  { id:'corregir',        label:'CORREGIR',          cls:'be-observado' },
  { id:'mala_oferta',     label:'MALA OFERTA',       cls:'be-malaoferta' },
  { id:'venta',           label:'VENTA',             cls:'be-venta' },
  { id:'validado',        label:'VALIDADO',         cls:'be-validado' },
]

const CANAL_BTNS = [
  { id:'NETCONTACT', label:'NETCONTACT', cls:'be-canal-netcontact' },
  { id:'KELS',       label:'KELS',       cls:'be-canal-kels' },
]

const ESTADOS_OK    = ['validado','instalado','programado','grabado','aprobado','en_ejecucion','caida','rechazo_campo','tecnico_casa']
const TIPIF_NO_VAL  = ['corta_llamada','fraude','no_desea','no_contesta','buzon_voz','servicio_activo','corregir','mala_oferta']
const TIPS_DISPLAY  = ['CORTA LLAMADA','FRAUDE','NO DESEA','NO CONTESTA','BUZON DE VOZ','GRABANDO','SERVICIO ACTIVO','CORREGIR','MALA OFERTA','VENTA','VALIDADO','INSTALADO','PROGRAMADO','CAÍDA','OBSERVADO','PENDIENTE']
const LT_COLORES    = ['#7C3AED','#2563eb','#16a34a','#d97706','#dc2626','#0891b2','#ec4899']

// ── Utilidades ────────────────────────────────────────────────────────────
function nowLabel() { return new Date().toLocaleString('es-PE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) }
function formatF(f) { if(!f)return'—'; const d=(f.split('T')[0]||f); const p=d.split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:f }

function estadoObj(id) { return ESTADOS_TODOS.find(e=>e.id===(id||'').toLowerCase()) || { id:'venta', label:'VENTA', cls:'be-venta' } }

function esEstadoNoValidado(estado) {
  const valor = String(estado || '').toLowerCase().trim()
  return valor === 'no_validado' || TIPIF_NO_VAL.includes(valor)
}

function parsearHistorial(obs) { return (obs||'').split('\n').filter(l=>l.trim()).map(l=>l.trim()) }

function getObsDisplay(obsVal) {
  const lineas = parsearHistorial(obsVal)
  let obsDisplay = '—'
  for (let li=lineas.length-1; li>=0; li--) {
    const txt = (lineas[li].match(/^\[.+?\]\s*(.*)$/)||[])[1] || lineas[li]
    if (!TIPS_DISPLAY.includes(txt.trim().toUpperCase())) { obsDisplay = txt; break }
    if (li === 0) obsDisplay = txt
  }
  return obsDisplay
}

function derivarTipifVal(obsValidacion) {
  const TIPS = ['corta_llamada','fraude','no_desea','no_contesta','buzon_voz','servicio_activo','corregir','mala_oferta','venta','validado']
  const lineas = (obsValidacion||'').split('\n').filter(l=>l.trim())
  for (let i=lineas.length-1; i>=0; i--) {
    const txt = ((lineas[i].match(/^\[.+?\]\s*(.*)$/)||[])[1]||'').toLowerCase().replace(/ /g,'_')
    if (TIPS.includes(txt)) return txt
  }
  return ''
}

function mapVenta(v) {
  return {
    ...v,
    estado:             (v.estado||'venta').toLowerCase(),
    fechaIngreso:       (v.created_at||'').split(' ')[0],
    horaIngreso:        (v.created_at||'').split(' ')[1]||'',
    nombreApellidos:    v.nombre        || '',
    correoElectronico:  v.email         || '',
    telefonoContacto:   v.telefono1     || '',
    telefonoReferencia: v.telefono2     || '',
    obsBackOffice:      v.obs_backoffice|| '',
    vendedor:           v.asesor_nombre || '',
    obsVal:             v.obs_validacion|| '',
    tipifVal:           derivarTipifVal(v.obs_validacion),
    estadoVal:          (v.estado_validacion || 'venta').toLowerCase(),
    obsSeg:             v.obs_seguimiento || '',
    _audioPath:         v.audio_path || '',
    _audioNombre:       v.audio_path ? v.audio_path.split('/').pop() : '',
  }
}

// ── Sub-componente: Línea de tiempo ────────────────────────────────────────
function LineaTiempo({ lineas }) {
  if (!lineas.length) return <div style={{color:'#9ca3af',fontSize:12,padding:'8px 0'}}>Sin historial de tipificaciones.</div>
  const grupos = []
  let i = 0
  while (i < lineas.length) {
    const m1  = lineas[i].match(/^\[(.+?)\]\s*(.*)$/)
    const meta = m1 ? m1[1] : ''
    const txt  = m1 ? m1[2] : lineas[i]
    const esTip = TIPS_DISPLAY.includes(txt.trim().toUpperCase())
    let comentario = ''
    if (esTip && i+1 < lineas.length) {
      const m2   = lineas[i+1].match(/^\[(.+?)\]\s*(.*)$/)
      const txt2 = m2 ? m2[2] : lineas[i+1]
      if (!TIPS_DISPLAY.includes(txt2.trim().toUpperCase())) { comentario = txt2; i++ }
    }
    grupos.push({ meta, tipif: txt, comentario })
    i++
  }
  return (
    <div>
      {grupos.map((g, idx) => {
        const color = LT_COLORES[idx % LT_COLORES.length]
        return (
          <div key={idx} style={{display:'flex',gap:12,marginBottom:14,alignItems:'flex-start',paddingBottom:14,borderBottom:'1px solid #f3f4f6'}}>
            <div style={{width:11,height:11,borderRadius:'50%',background:color,marginTop:5,flexShrink:0,boxShadow:`0 0 0 3px ${color}22`}} />
            <div style={{flex:1}}>
              <div style={{fontSize:10,color:'#9ca3af',marginBottom:4,letterSpacing:.2}}>{g.meta}</div>
              <div style={{display:'inline-block',background:`${color}18`,color,border:`1.5px solid ${color}44`,borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:800,letterSpacing:.4,textTransform:'uppercase',marginBottom:g.comentario?6:0}}>{g.tipif}</div>
              {g.comentario && <div style={{fontSize:13,color:'#374151',fontStyle:'italic'}}>"{g.comentario}"</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
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
export default function Validacion() {
  const navigate = useNavigate()
  const { sesion, logout } = useAuth()
  const toastTimer = useRef(null)

  // ── Data ──
  const [ventas, setVentas] = useState([])
  const [errorCarga, setErrorCarga] = useState('')

  // ── Filtros ──
  const [fEstado,  setFEstado]  = useState('')
  const [fAsesor,  setFAsesor]  = useState('')
  const [fDesde,   setFDesde]   = useState('')
  const [fHasta,   setFHasta]   = useState('')
  const [busqueda, setBusqueda] = useState('')

  // ── Paginación ──
  const [pagina,    setPagina]    = useState(1)
  const [porPagina, setPorPagina] = useState(18)

  // ── Modal tipificación ──
  const [modalEst,      setModalEst]      = useState({ open:false, id:null })
  const [tipSel,        setTipSel]        = useState('')
  const [canalSel,      setCanalSel]      = useState('')
  const [nuevaObsModal, setNuevaObsModal] = useState('')
  const [guardandoTipificacion, setGuardandoTipificacion] = useState(false)
  const guardandoTipificacionRef = useRef(false)

  // ── Modal historial ──
  const [modalObs, setModalObs] = useState({ open:false, id:null })
  const [mediaVenta, setMediaVenta] = useState(null)

  // ── Toast ──
  const [toast, setToast] = useState('')

  // ── Utilidades internas ──
  function mostrarToast(msg) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(()=>setToast(''), 3200)
  }

  // ── API ──────────────────────────────────────────────────────────────────
  const cargandoVentasRef = useRef(false)
  const firmaVentasRef = useRef('')
  const cargarVentas = useCallback(async () => {
    if (cargandoVentasRef.current || guardandoTipificacionRef.current) return
    cargandoVentasRef.current = true
    try {
      const res  = await fetch(`${API}/ventas/validacion-listado`, { headers: ncHeaders() })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.mensaje || `Error HTTP ${res.status}`)
      setErrorCarga('')
      if (responseChanged(firmaVentasRef, data.data)) setVentas(data.data.map(mapVenta))
    } catch(e) {
      console.error('Error cargando ventas:', e)
      setErrorCarga('No se pudo cargar el listado de ventas. Reintentando automáticamente…')
    }
    finally { cargandoVentasRef.current = false }
  }, [])

  useEffect(() => { cargarVentas() }, [cargarVentas])

  // ── Polling compartido: todos los validadores ven el mismo estado ──
  useEffect(() => {
    const interval = setVisibleInterval(cargarVentas, 10000)
    return () => clearVisibleInterval(interval)
  }, [cargarVentas])

  // ── Reset página al cambiar filtros ──
  useEffect(() => { setPagina(1) }, [fEstado, fAsesor, fDesde, fHasta, busqueda])

  // ── Derived data ─────────────────────────────────────────────────────────
  const ventasFiltradas = useMemo(() => {
    let vv = ventas.filter(v => {
      if (fEstado === 'novalidado') {
        if (!esEstadoNoValidado(v.estadoVal)) return false
      } else if (fEstado && v.estadoVal !== fEstado) {
        return false
      }
      if (fAsesor && !(v.vendedor||'').toLowerCase().includes(fAsesor.toLowerCase())) return false
      if (fDesde  && v.fechaIngreso < fDesde) return false
      if (fHasta  && v.fechaIngreso > fHasta) return false
      if (busqueda) {
        const b = busqueda.toLowerCase()
        if (![(v.nombreApellidos||''),(v.dni||''),(v.telefonoContacto||''),(v.vendedor||''),(v.distrito||'')].some(c=>c.toLowerCase().includes(b))) return false
      }
      return true
    })
    vv.sort((a,b)=>(b.fechaIngreso+b.horaIngreso).localeCompare(a.fechaIngreso+a.horaIngreso))
    return vv
  }, [ventas, fEstado, fAsesor, fDesde, fHasta, busqueda])

  const kpis = useMemo(() => ({
    total:       ventas.length,
    validados:   ventas.filter(v => v.estadoVal === 'validado').length,
    noValidados: ventas.filter(v => esEstadoNoValidado(v.estadoVal)).length,
  }), [ventas])

  const totalPags   = Math.max(1, Math.ceil(ventasFiltradas.length / porPagina))
  const pagActual   = Math.min(pagina, totalPags)
  const inicio      = (pagActual - 1) * porPagina
  const fin         = Math.min(inicio + porPagina, ventasFiltradas.length)
  const paginaVentas = ventasFiltradas.slice(inicio, fin)

  // ── Ventana actual para modal ──
  const ventaModal = ventas.find(x => x.id === (modalEst.id || modalObs.id))

  // ── Handlers modales ─────────────────────────────────────────────────────
  function abrirModalEstado(id) {
    const v = ventas.find(x=>x.id===id)
    if (!v) return
    setModalEst({ open:true, id })
    setTipSel(v.estadoVal !== 'venta' ? v.estadoVal : '')
    setCanalSel(v.canal || '')
    setNuevaObsModal('')
  }

  function abrirModalObs(id) {
    setModalObs({ open:true, id })
  }

  async function guardarTipificacion() {
    if (guardandoTipificacionRef.current) return
    const v = ventas.find(x => x.id === modalEst.id)
    if (!v) return

    if (!tipSel && !nuevaObsModal.trim()) {
      mostrarToast('Selecciona una tipificación o escribe una observación')
      return
    }

    if ((tipSel === 'venta' || tipSel === 'validado') && !canalSel && !v.canal) {
      mostrarToast('Selecciona el canal (NETCONTACT o KELS) antes de guardar')
      return
    }

    guardandoTipificacionRef.current = true
    setGuardandoTipificacion(true)
    try {
      const res = await fetch(`${API}/ventas/${v.id}/tipificar-validacion`, {
        method: 'PATCH',
        headers: ncHeaders(),
        body: JSON.stringify({
          tipificacion: tipSel || null,
          observacion: nuevaObsModal.trim() || null,
          estadoAnteriorEsperado: v.estado,
          canal: canalSel || null,
        }),
      })

      let data = {}
      try {
        const ct = res.headers.get('content-type') || ''
        data = ct.includes('application/json')
          ? await res.json()
          : { ok: false, mensaje: `Error HTTP ${res.status}` }
      } catch(_) { data = { ok: false, mensaje: `Error HTTP ${res.status}` } }

      if (res.status === 409) {
        mostrarToast(data.mensaje || 'La venta fue modificada por otro validador. Revisa el historial.')
        await cargarVentas()
        return
      }

      if (!res.ok || !data.ok) {
        mostrarToast('Error: ' + (data.mensaje || `Error ${res.status}`))
        return
      }

      if (data.venta) {
        setVentas(prev => prev.map(x => x.id === v.id ? mapVenta(data.venta) : x))
      } else {
        await cargarVentas()
      }
      setModalEst({ open: false, id: null })
      mostrarToast('Tipificación guardada')
    } catch(e) {
      mostrarToast('Error conectando al servidor')
    } finally {
      guardandoTipificacionRef.current = false
      setGuardandoTipificacion(false)
    }
  }

  function limpiarFiltros() {
    setFEstado(''); setFAsesor(''); setFDesde(''); setFHasta(''); setBusqueda('')
  }

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* TOPBAR */}
      <div className="topbar module-topbar-standard">
        <div className="brand">
          <div className="logo-circle">
            <img src="/assets/logo-futura.png" alt="NC" onError={e=>{e.target.parentNode.textContent='NC'}} />
          </div>
          <div className="brand-text">
            <img src="/assets/futura-wordmark.png" alt="FUTURA" style={{height:22,width:"auto",display:"block"}} />
            <span className="brand-sub">Validación de Ventas</span>
          </div>
        </div>
        <div className="topbar-right">
          <JefaturaViewControls>
            <span className="topbar-badge">VALIDACIÓN</span>
            <span className="topbar-user">{sesion?.nombre || 'Validador'}</span>
          </JefaturaViewControls>
          <button className="topbar-salir" onClick={()=>{ logout(); navigate('/') }}>Salir</button>
        </div>
      </div>

      <div className="main-content validacion-page">

        {/* PAGE HEADER */}
        <div className="page-header">
          <div className="page-header-left">
            <h2>Ventas — Validación</h2>
            <p>Gestiona y valida las ventas del sistema · Mes actual por defecto</p>
          </div>
        </div>

        {errorCarga && (
          <div role="alert" style={{marginBottom:12,padding:'10px 14px',border:'1px solid #fecaca',borderRadius:10,background:'#fff1f2',color:'#b91c1c',fontWeight:700,fontSize:13}}>
            {errorCarga}
          </div>
        )}

        {/* KPI STRIP */}
        <div className="kpi-strip">
          <div className="kpi-item k-blue">
            <div className="kpi-num">{kpis.total}</div>
            <div className="kpi-label">Total ventas</div>
          </div>
          <div className="kpi-item k-green">
            <div className="kpi-num">{kpis.validados}</div>
            <div className="kpi-label">Validadas</div>
          </div>
          <div className="kpi-item k-red">
            <div className="kpi-num">{kpis.noValidados}</div>
            <div className="kpi-label">No validadas</div>
          </div>
        </div>

        {/* FILTROS */}
        <div className="filtros-panel">
          <div className="filtros-titulo">Filtros de búsqueda</div>
          <div className="filtros-grid">
            <div className="fg">
              <label>Estado</label>
              <select value={fEstado} onChange={e=>setFEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="validado">VALIDADO</option>
                <option value="novalidado">NO VALIDADO</option>
                <option value="venta">VENTA</option>
              </select>
            </div>
            <div className="fg">
              <label>Vendedor / Asesor</label>
              <input value={fAsesor} onChange={e=>setFAsesor(e.target.value)} placeholder="Buscar vendedor..." />
            </div>
            <div className="fg">
              <label>Desde</label>
              <input type="date" value={fDesde} onChange={e=>setFDesde(e.target.value)} />
            </div>
            <div className="fg">
              <label>Hasta</label>
              <input type="date" value={fHasta} onChange={e=>setFHasta(e.target.value)} />
            </div>
            <div className="filtros-acciones">
              <button className="btn-borrar" onClick={limpiarFiltros}>✕ Limpiar</button>
            </div>
          </div>
        </div>

        {/* TABLA */}
        <div className="tabla-wrap">
          <div className="tabla-header">
            <div className="tabla-header-left">
              <span className="tabla-title">Registros de ventas</span>
              <span className="tabla-count">{ventasFiltradas.length} registros</span>
              {ventasFiltradas.length > 0 && (
                <span className="paginacion-info">Mostrando {inicio+1}–{fin} de {ventasFiltradas.length}</span>
              )}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <input
                type="text"
                className="tabla-search"
                value={busqueda}
                onChange={e=>setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, DNI, teléfono..."
              />
              <div className="pag-size">
                <select
                  value={porPagina}
                  onChange={e=>{ setPorPagina(parseInt(e.target.value)||18); setPagina(1) }}
                  title="Registros por página"
                >
                  <option value="18">18 / pág</option>
                  <option value="30">30 / pág</option>
                  <option value="50">50 / pág</option>
                  <option value="100">100 / pág</option>
                </select>
              </div>
            </div>
          </div>

          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th className="th-accion">ACCIÓN</th>
                  <th className="th-estado">ESTADO VENTA</th>
                  <th>CANAL</th>
                  <th className="th-fecha">FECHA INGRESO</th>
                  <th className="th-nombre">NOMBRE Y APELLIDOS</th>
                  <th className="th-dni">DNI / DOC.</th>
                  <th className="th-tel">TEL. CONTACTO</th>
                  <th className="th-tel">TEL. REFERENCIA</th>
                  <th className="th-dpto">DEPARTAMENTO</th>
                  <th className="th-prov">PROVINCIA</th>
                  <th className="th-dist">DISTRITO</th>
                  <th className="th-dir">DIRECCIÓN</th>
                  <th className="th-tel">EMAIL</th>
                  <th className="th-cuota">CUOTA INST.</th>
                  <th className="th-claro">CLARO HOGAR</th>
                  <th className="th-tec">TECNOLOGÍA</th>
                  <th className="th-paquete">PAQUETE</th>
                  <th className="th-full">FULL CLARO</th>
                  <th className="th-num">DECOS</th>
                  <th className="th-num">MESH</th>
                  <th className="th-plano">PLANO</th>
                  <th className="th-obs">OBSERVACIÓN</th>
                  <th className="th-vendedor">VENDEDOR</th>
                  <th>SALA</th>
                </tr>
              </thead>
              <tbody>
                {paginaVentas.length === 0
                  ? <tr className="tabla-empty"><td colSpan={24}>Sin registros.</td></tr>
                  : paginaVentas.map(v => {
                      const mostrar  = v.estadoVal
                      const eObj     = estadoObj(mostrar)
                      const obsDisp  = getObsDisplay(v.obsVal)
                      return (
                        <tr key={v.id} id={`fila-${v.id}`}>
                          <td style={{textAlign:'center',verticalAlign:'middle'}}>
                            <div className="acciones-cell">
                              <button className="btn-accion-row btn-obs" onClick={()=>abrirModalObs(v.id)} title="Ver historial y observar">📋</button>
                              <button className="btn-fotos" onClick={()=>setMediaVenta(v)} title="Ver fotos y audio">📷</button>
                            </div>
                          </td>
                          <td style={{verticalAlign:'middle'}}>
                            <span
                              className={`badge-estado ${eObj.cls}`}
                              onClick={()=>abrirModalEstado(v.id)}
                              title="Click para tipificar"
                              style={{cursor:'pointer'}}
                            >
                              {eObj.label}
                            </span>
                          </td>
                          <td style={{textAlign:'center'}}><CanalBadge canal={v.canal} /></td>
                          <td style={{color:'#185FA5',fontWeight:700,fontFamily:'monospace',fontSize:10,whiteSpace:'nowrap'}}>
                            {formatF(v.fechaIngreso)}<br />
                            <span style={{color:'#9ca3af',fontWeight:400}}>{v.horaIngreso||''}</span>
                          </td>
                          <td style={{fontWeight:600}}>{v.nombreApellidos||'—'}</td>
                          <td style={{fontFamily:'monospace',fontSize:11}}>{v.dni||'—'}</td>
                          <td style={{fontFamily:'monospace',color:'#185FA5',fontWeight:700}}>{v.telefonoContacto||'—'}</td>
                          <td style={{fontFamily:'monospace',color:'#6b7280'}}>{v.telefonoReferencia||'—'}</td>
                          <td>{v.departamento||'—'}</td>
                          <td>{v.provincia||'—'}</td>
                          <td style={{fontWeight:600}}>{v.distrito||'—'}</td>
                          <td className="td-wrap" style={{fontSize:10}}>{v.direccion||'—'}</td>
                          <td
                            style={{maxWidth:190,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                            title={v.correoElectronico || ''}
                          >
                            {v.correoElectronico||'—'}
                          </td>
                          <td>{v.cuota_inst||'—'}</td>
                          <td className="td-wrap" style={{fontSize:10}}>{v.claro_hogar||'—'}</td>
                          <td>{v.tecnologia||'—'}</td>
                          <td className="td-wrap" style={{fontSize:10}}>{v.paquete||'—'}</td>
                          <td style={{textAlign:'center'}}>{v.full_claro||'—'}</td>
                          <td style={{textAlign:'center'}}>{v.cant_decos??'—'}</td>
                          <td style={{textAlign:'center'}}>{v.cant_mesh??'—'}</td>
                          <td>{v.plano||'—'}</td>
                          <td
                            style={{fontSize:11,color:'#374151',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}
                            title={obsDisp}
                          >
                            {obsDisp}
                          </td>
                          <td style={{fontWeight:600,color:'#7C3AED'}}>{v.vendedor||'—'}</td>
                          <td style={{fontWeight:600}}>{v.sala||'—'}</td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>

          <div className="paginacion">
            <span className="pag-info">
              {ventasFiltradas.length > 0 ? `Mostrando ${inicio+1}–${fin} de ${ventasFiltradas.length}` : ''}
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
        audioPath={mediaVenta?._audioPath}
        audioName={mediaVenta?._audioNombre}
      />

      {/* ══ MODAL TIPIFICACIÓN ═══════════════════════════════════════════════ */}
      {modalEst.open && (() => {
        const v = ventas.find(x=>x.id===modalEst.id)
        if (!v) return null
        const mostrar   = v.tipifVal || v.estado
        const eActual   = estadoObj(mostrar)
        const histLineas = parsearHistorial(v.obsVal)
        return (
          <div
            className="modal-bg open"
            onClick={e=>{ if(e.target===e.currentTarget) setModalEst({open:false,id:null}) }}
          >
            <div className="modal-box" style={{maxWidth:480}}>
              <div className="modal-title">Tipificar Venta</div>
              <div className="modal-sub">Estado actual: <strong>{eActual.label}</strong></div>

              {/* Botones de tipificación */}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:.3,marginBottom:8}}>Seleccionar tipificación</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                  {TIP_BTNS.map(btn => (
                    <button
                      key={btn.id}
                      className={`tip-val-btn ${btn.cls}${tipSel===btn.id?' activo':''}`}
                      onClick={()=>setTipSel(prev=>prev===btn.id?'':btn.id)}
                      style={{padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:700,fontFamily:'inherit',cursor:'pointer',transition:'all .15s'}}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Canal de la venta */}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:.3,marginBottom:8}}>Seleccionar canal</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                  {CANAL_BTNS.map(btn => (
                    <button
                      key={btn.id}
                      className={`tip-val-btn ${btn.cls}${canalSel===btn.id?' activo':''}`}
                      onClick={()=>setCanalSel(prev=>prev===btn.id?'':btn.id)}
                      style={{padding:'8px 14px',borderRadius:8,fontSize:12,fontWeight:700,fontFamily:'inherit',cursor:'pointer',transition:'all .15s'}}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Línea de tiempo */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:.3,marginBottom:8}}>Historial</div>
                <div style={{background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:8,padding:12,maxHeight:150,overflowY:'auto'}}>
                  <LineaTiempo lineas={histLineas} />
                </div>
              </div>

              {/* Nueva obs */}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:.3,marginBottom:6}}>Nueva observación (opcional)</div>
                <textarea
                  value={nuevaObsModal}
                  onChange={e=>setNuevaObsModal(e.target.value)}
                  placeholder="Escribe una observación sobre esta venta..."
                  rows={3}
                  style={{width:'100%',padding:'9px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:13,fontFamily:'inherit',resize:'vertical',outline:'none'}}
                />
              </div>

              <div className="modal-btns">
                <button className="btn-cancelar-modal" onClick={()=>setModalEst({open:false,id:null})}>Cancelar</button>
                <button className="btn-guardar" onClick={guardarTipificacion} disabled={guardandoTipificacion}>
                  {guardandoTipificacion ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ MODAL HISTORIAL ══════════════════════════════════════════════════ */}
      {modalObs.open && (() => {
        const v = ventas.find(x=>x.id===modalObs.id)
        if (!v) return null
        const histLineas = parsearHistorial(v.obsVal)
        return (
          <div
            className="modal-bg open"
            onClick={e=>{ if(e.target===e.currentTarget) setModalObs({open:false,id:null}) }}
          >
            <div className="modal-box" style={{maxWidth:500}}>
              <div className="modal-title">Historial de tipificaciones</div>
              <div className="modal-sub">{v.nombreApellidos||'—'}</div>
              <div style={{padding:'8px 0',maxHeight:400,overflowY:'auto'}}>
                <LineaTiempo lineas={histLineas} />
              </div>
              <div className="modal-btns">
                <button className="btn-guardar" onClick={()=>setModalObs({open:false,id:null})}>Cerrar</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ TOAST ═══════════════════════════════════════════════════════════ */}
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
    </div>
  )
}
