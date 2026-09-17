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

const BADGE_MAP = {
  aprobado:     { cls: 'bg-grabado',  label: 'APROBADO'     },
  observado:    { cls: 'bg-observado',label: 'OBSERVADO'    },
  conforme:     { cls: 'bg-grabado',  label: 'CONFORME'     },
  no_conforme:  { cls: 'bg-observado',label: 'NO CONFORME'  },
  rechazado:     { cls: 'bg-observado',label: 'RECHAZADO'     },
  programado:   { cls: 'bg-revisado', label: 'PROGRAMADO'   },
  sin_revisar:  { cls: 'bg-revisado', label: 'EN REVISION'  },
  audio_subido: { cls: 'bg-grabado',  label: 'AUDIO SUBIDO' },
}

function formatF(f) {
  if (!f) return '--'
  const d = f.split('T')[0] || f
  const p = d.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : f
}

// Fecha/hora REAL (venta_historial vía backend, columna fecha_programado) en
// que Programación puso estado=PROGRAMADO — nunca la hora actual del navegador.
function formatProgramado(fechaHistorial) {
  if (!fechaHistorial) return null
  const [fecha, hora] = String(fechaHistorial).split(' ')
  const p = (fecha || '').split('-')
  if (p.length !== 3) return null
  const hm = (hora || '').slice(0, 5)
  return `PROGRAMADO: ${hm} / ${p[2]}/${p[1]}/${p[0]}`
}

function nowLabel() {
  return new Date().toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
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
      {ini > 1 && <><button className="pag-btn" onClick={() => onChange(1)}>1</button>{ini > 2 && <span style={{ padding: '0 4px', color: '#9ca3af' }}>...</span>}</>}
      {pages.map(p => <button key={p} className={`pag-btn${p === pagina ? ' active' : ''}`} onClick={() => onChange(p)}>{p}</button>)}
      {fin2 < totalPags && <>{fin2 < totalPags - 1 && <span style={{ padding: '0 4px', color: '#9ca3af' }}>...</span>}<button className="pag-btn" onClick={() => onChange(totalPags)}>{totalPags}</button></>}
      <button className="pag-btn" onClick={() => onChange(pagina + 1)} disabled={pagina === totalPags}>&#8250;</button>
    </div>
  )
}

export default function SupGrabaciones() {
  const navigate = useNavigate()
  const { sesion, logout } = useAuth()
  const usuarioActual = sesion?.nombre || 'Supervisor'

  const [ventas, setVentas]       = useState([])
  const [fechaLabel, setFechaLabel] = useState('')

  const [fEstado, setFEstado]     = useState('')
  const [fDoc, setFDoc]           = useState('')
  const [fVendedor, setFVendedor] = useState('')
  const [fDesde, setFDesde]       = useState('')
  const [fHasta, setFHasta]       = useState('')
  const [busqueda, setBusqueda]   = useState('')
  const [pagina, setPagina]       = useState(1)
  const [porPagina, setPorPagina] = useState(18)
  const firmaVentasRef = useRef('')

  const [modalRevisar, setModalRevisar]       = useState(null)
  const [estadoRevision, setEstadoRevision]   = useState('')
  const [revObs, setRevObs]                   = useState('')
  const [audioSrc, setAudioSrc]               = useState('')
  const [guardando, setGuardando]             = useState(false)
  const audioRef = useRef(null)

  const [modalObs, setModalObs] = useState(null)
  const [mediaVenta, setMediaVenta] = useState(null)
  const [fotosVenta, setFotosVenta] = useState(null)

  const [toastMsg, setToastMsg] = useState('')
  const toastRef = useRef(null)

  function mostrarToast(msg) {
    setToastMsg(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToastMsg(''), 3000)
  }

  function actualizarFecha() {
    const d = new Date()
    const dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    const hora  = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })
    setFechaLabel(`${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} - ${hora}`)
  }

  const cargandoVentasRef = useRef(false)
  const cargarVentas = useCallback(async () => {
    if (cargandoVentasRef.current) return  // evita polls solapados (respuestas fuera de orden que causan parpadeo)
    cargandoVentasRef.current = true
    try {
      const res  = await fetch(`${API}/ventas?area=supgrabaciones`, { headers: ncHeaders() })
      const data = await res.json()
      if (data.ok && responseChanged(firmaVentasRef, data.data)) {
        setVentas(data.data
          // Historial operativo de Supervisión: una venta que ingresó aquí
          // permanece visible aunque luego continúe en Programación o vuelva
          // a Grabaciones. Esto no modifica las colas de las otras áreas.
          .filter(v => {
            const grab = (v.estado_grab || '').toLowerCase()
            const revision = (v.estado_supgrab || '').toLowerCase()
            return revision !== 'conforme' && (revision !== '' || grab === 'grabado')
          })
          .map(v => ({
            ...v,
            nombreApellidos:  v.nombre        || '',
            telefonoContacto: v.telefono1     || '',
            email:            v.email         || '',
            vendedor:         v.asesor_nombre || '',
            fechaIngreso:     (v.created_at   || '').split(' ')[0],
            estadoRev:        v.estado_supgrab || 'sin_revisar',
            obsSup:           v.obs_supgrab    || '',
            audioPath:        v.audio_path || '',
            audioUrl:         v.audio_path ? `${NC_API}/${v.audio_path}` : null,
            audioNombre:      v.audio_path ? v.audio_path.split('/').pop() : '',
            programacionExpiraAt: v.programacion_expira_at || null,
            // Momento real en que Programación marcó PROGRAMADO.
            obsProgramacion:  String(v.estado || '').trim().toUpperCase() === 'PROGRAMADO'
              ? formatProgramado(v.fecha_programado)
              : null,
          }))
        )
      }
    } catch (e) { console.error(e) }
    finally { cargandoVentasRef.current = false }
  }, [])

  useEffect(() => {
    cargarVentas()
    actualizarFecha()
    const fi = setInterval(actualizarFecha, 60000)
    const fc = setVisibleInterval(cargarVentas, 2000)
    return () => { clearInterval(fi); clearVisibleInterval(fc) }
  }, [cargarVentas])

  useEffect(() => {
    const umbrales = [1, 5, 10, 20, 30]
    for (const venta of ventas) {
      if (venta.estadoRev !== 'programado' || !venta.programacionExpiraAt) continue
      const expira = new Date(String(venta.programacionExpiraAt).replace(' ', 'T')).getTime()
      if (!Number.isFinite(expira)) continue
      const restantes = Math.ceil((expira - Date.now()) / 60000)
      const umbral = umbrales.find(minutos => restantes > 0 && restantes <= minutos)
      if (!umbral) continue
      const clave = `nc_supgrab_aviso_${venta.id}_${umbral}_${venta.programacionExpiraAt}`
      if (sessionStorage.getItem(clave)) continue
      sessionStorage.setItem(clave, '1')
      mostrarToast(`La venta ${venta.nombreApellidos || venta.id} expira en ${umbral} minuto${umbral === 1 ? '' : 's'}`)
      break
    }
  }, [ventas])

  const ventasFiltradas = useMemo(() => ventas.filter(v => {
    if (fEstado   && v.estadoRev !== fEstado) return false
    if (fDoc      && !(v.dni       || '').toLowerCase().includes(fDoc.toLowerCase())) return false
    if (fVendedor && !(v.vendedor  || '').toLowerCase().includes(fVendedor.toLowerCase())) return false
    if (fDesde    && v.fechaIngreso < fDesde) return false
    if (fHasta    && v.fechaIngreso > fHasta) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      if (![v.nombreApellidos, v.dni, v.telefonoContacto, v.vendedor].some(x => (x || '').toLowerCase().includes(b))) return false
    }
    return true
  }), [ventas, fEstado, fDoc, fVendedor, fDesde, fHasta, busqueda])

  const kpis = useMemo(() => ({
    total:     ventas.length,
    aprobado:  ventas.filter(v => ['aprobado','conforme'].includes(v.estadoRev)).length,
    noConforme:ventas.filter(v => v.estadoRev === 'no_conforme').length,
    observado: ventas.filter(v => v.estadoRev === 'observado').length,
  }), [ventas])

  const totalPag  = ventasFiltradas.length
  const inicio    = (pagina - 1) * porPagina
  const fin       = Math.min(inicio + porPagina, totalPag)
  const ventasPag = ventasFiltradas.slice(inicio, fin)

  function limpiarFiltros() {
    setFEstado(''); setFDoc(''); setFVendedor('')
    setFDesde(''); setFHasta(''); setBusqueda(''); setPagina(1)
  }

  function esSegundoCicloVenta(venta) {
    const revision = String(venta?.estadoRev || venta?.estado_supgrab || '').trim().toLowerCase()
    return Boolean(venta?.fecha_programado) ||
      String(venta?.estado || '').trim().toUpperCase() === 'PROGRAMADO' ||
      ['programado', 'audio_subido', 'no_conforme', 'conforme'].includes(revision)
  }

  async function abrirModalRevisar(v) {
    setModalRevisar(v)
    setEstadoRevision(esSegundoCicloVenta(v) ? '' : (v.estadoRev || 'sin_revisar'))
    setRevObs('')
    setAudioSrc('')
    if (v.audioUrl) {
      try {
        const res = await fetch(v.audioUrl, { headers: ncHeadersFile() })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        setAudioSrc(URL.createObjectURL(blob))
      } catch (e) {
        console.error('No se pudo preparar audio protegido:', e)
        setAudioSrc(v.audioUrl || '')
      }
    }
  }

  function cerrarModalRevisar() {
    if (audioRef.current) audioRef.current.pause()
    if (audioSrc && audioSrc.startsWith('blob:')) URL.revokeObjectURL(audioSrc)
    setAudioSrc('')
    setModalRevisar(null)
    setEstadoRevision('')
    setRevObs('')
  }

  async function guardarRevision() {
    if (!modalRevisar || guardando) return
    if (!estadoRevision || estadoRevision === 'sin_revisar' || estadoRevision === 'programado') {
      mostrarToast('Selecciona un resultado'); return
    }
    setGuardando(true)
    const lineas = (modalRevisar.obsSup || '').split('\n').filter(l => l.trim())
    lineas.push(`[${nowLabel()} - ${usuarioActual}] ${estadoRevision.toUpperCase()}${revObs ? ' -- ' + revObs : ''}`)
    const nuevoHistorial = lineas.join('\n')
    const esSegundoCiclo = esSegundoCicloVenta(modalRevisar)
    try {
      const res  = await fetch(`${API}/ventas/${modalRevisar.id}?area=supgrabaciones`, {
        method: 'PATCH', headers: ncHeaders(),
        body: JSON.stringify({
          obs_supgrab: nuevoHistorial,
          ...(estadoRevision === 'conforme'
            ? {
                // CAMBIO 5: solo enviar estado si la venta aún no ha avanzado más allá de VALIDADO
                ...( ['VENTA','GRABADO','APROBADO','VALIDADO','PROGRAMADO'].includes((modalRevisar.estado || '').toUpperCase())
                  ? { estado: 'EN_EJECUCION' } : {} ),
                estado_supgrab: 'conforme',
                estado_grab: 'grabado',
              }
            : estadoRevision === 'rechazado'
              ? {
                  estado: 'CAIDA',
                  estado_supgrab: 'rechazado',
                  estado_grab: 'grabado',
                  motivo_seguimiento: 'RECHAZO POR AUDIO',
                }
            : estadoRevision === 'no_conforme'
              ? {
                  ...(esSegundoCiclo
                    ? { estado: 'VALIDADO' }
                    : (['VALIDADO','APROBADO'].includes((modalRevisar.estado || '').toUpperCase()) ? { estado: 'VALIDADO' } : {})),
                  estado_supgrab: 'no_conforme',
                  estado_grab: esSegundoCiclo ? 'grabando' : 'pendiente',
                }
              : {
                  estado_supgrab: estadoRevision,
                  estado_grab: estadoRevision === 'observado' ? 'grabando' : 'grabado',
                }),
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) { mostrarToast(data.mensaje || 'Error guardando'); setGuardando(false); return }
      // CONFORME completa esta etapa y pasa a Seguimiento; los demás resultados
      // permanecen visibles aquí como historial operativo.
      setVentas(list => estadoRevision === 'conforme'
        ? list.filter(x => x.id !== modalRevisar.id)
        : list.map(x => x.id === modalRevisar.id
          ? { ...x, estadoRev: estadoRevision, obsSup: nuevoHistorial }
          : x))
      setGuardando(false)  // CAMBIO 3: liberar botón antes de cerrar para que el siguiente modal arranque desbloqueado
      cerrarModalRevisar()
      setPagina(1)
    } catch (e) {
      mostrarToast('Error conectando al servidor')
      setGuardando(false)
    }
  }

  function salir() { logout(); navigate('/login') }

  return (
    <div>
      <div className="topbar module-topbar-standard">
        <div className="brand">
          <div className="logo-circle">
            <img src="/assets/logo-futura.png" alt="NC" onError={e => { e.target.style.display = 'none' }} />
          </div>
          <div className="brand-text">
            <img src="/assets/futura-wordmark.png" alt="FUTURA" style={{height:22,width:"auto",display:"block"}} />
            <span className="brand-sub">Supervisor Grabaciones</span>
          </div>
        </div>
        <div className="topbar-right">
          <JefaturaViewControls>
            <span className="topbar-fecha">{fechaLabel}</span>
            <span className="topbar-badge" style={{ background: '#16a34a' }}>SUP. GRABACIONES</span>
            <span className="topbar-user">{usuarioActual}</span>
          </JefaturaViewControls>
          <CambiarAreaMenu />
          <button className="btn-cancelar-m" style={{ borderColor: '#fca5a5', color: '#ef4444' }} onClick={salir}>Salir</button>
        </div>
      </div>

      <div className="main-content">
        <div className="page-header">
          <div className="page-header-left">
            <h2>Supervisor de Grabaciones</h2>
            <p>Historial de ventas supervisadas — escucha, aprueba u observa</p>
          </div>
        </div>

        <div className="kpi-strip">
          <div className="kpi-item k-blue">  <div><div className="kpi-num">{kpis.total}</div>    <div className="kpi-label">Total grabadas</div></div></div>
          <div className="kpi-item k-green"> <div><div className="kpi-num">{kpis.aprobado}</div> <div className="kpi-label">Aprobadas</div></div></div>
          <div className="kpi-item k-orange"><div><div className="kpi-num">{kpis.noConforme}</div><div className="kpi-label">No conformes</div></div></div>
          <div className="kpi-item k-purple"><div><div className="kpi-num">{kpis.observado}</div><div className="kpi-label">Observadas</div></div></div>
        </div>

        <div className="filtros-panel">
          <div className="filtros-titulo">Filtros</div>
          <div className="filtros-grid">
            <div className="fg">
              <label>Estado revisión</label>
              <select value={fEstado} onChange={e => { setFEstado(e.target.value); setPagina(1) }}>
                <option value="">Todos</option>
                <option value="sin_revisar">En revisión</option>
                <option value="aprobado">Aprobado</option>
                <option value="observado">Observado</option>
                <option value="audio_subido">Audio subido</option>
                <option value="no_conforme">No conforme</option>
                <option value="rechazado">Rechazado</option>
                <option value="programado">Programado</option>
              </select>
            </div>
            <div className="fg">
              <label>DNI / RUC / CE</label>
              <input value={fDoc} onChange={e => { setFDoc(e.target.value); setPagina(1) }}
                placeholder="Buscar por documento..." style={{ fontFamily: 'monospace' }} />
            </div>
            <div className="fg">
              <label>Vendedor / Asesor</label>
              <input value={fVendedor} onChange={e => { setFVendedor(e.target.value); setPagina(1) }}
                placeholder="Buscar vendedor..." />
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

        <div className="tabla-wrap">
          <div className="tabla-header">
            <div className="tabla-header-left">
              <span className="tabla-title">Ventas grabadas</span>
              <span className="tabla-count">{totalPag} registros</span>
              {totalPag > 0 && (
                <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>
                  Mostrando {inicio + 1}?{fin} de {totalPag}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text" className="tabla-search" value={busqueda}
                onChange={e => { setBusqueda(e.target.value); setPagina(1) }}
                placeholder="Buscar nombre, DNI, vendedor..."
              />
              <select
                value={porPagina}
                onChange={e => { setPorPagina(parseInt(e.target.value) || 18); setPagina(1) }}
                style={{ padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '12px', fontFamily: 'inherit', outline: 'none' }}
              >
                <option value="18">18 / pág.</option>
                <option value="30">30 / pág.</option>
                <option value="50">50 / pág.</option>
              </select>
            </div>
          </div>

          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th style={{ minWidth: '240px' }}>ACCIONES</th>
                  <th style={{ minWidth: '110px' }}>ESTADO REV.</th>
                  <th style={{ minWidth: '90px' }}>CANAL</th>
                  <th style={{ minWidth: '105px' }}>RESULTADO</th>
                  <th style={{ minWidth: '110px' }}>SOT</th>
                  <th style={{ minWidth: '100px' }}>FECHA</th>
                  <th style={{ minWidth: '160px' }}>NOMBRE Y APELLIDOS</th>
                  <th style={{ minWidth: '90px'  }}>DNI / DOC.</th>
                  <th style={{ minWidth: '110px' }}>TEL. CONTACTO</th>
                  <th style={{ minWidth: '190px' }}>EMAIL</th>
                  <th style={{ minWidth: '130px' }}>VENDEDOR</th>
                  <th style={{ minWidth: '90px' }}>SALA</th>
                  <th style={{ minWidth: '110px' }}>SUPERVISOR</th>
                  <th style={{ minWidth: '150px' }}>ARCHIVO AUDIO</th>
                  <th style={{ minWidth: '180px' }}>OBS. PROGRAMACIÓN</th>
                </tr>
              </thead>
              <tbody>
                {ventasPag.length === 0 ? (
                  <tr><td colSpan="15" className="tabla-empty">Sin ventas grabadas para revisar.</td></tr>
                ) : ventasPag.map(v => {
                  const badge    = BADGE_MAP[v.estadoRev] || BADGE_MAP.sin_revisar
                  const ultimaObs = v.obsSup
                    ? (v.obsSup.split('\n').filter(l => l.trim()).slice(-1)[0] || '').replace(/^\[.+?\]\s*/, '')
                    : '--'
                  return (
                    <tr key={v.id}>
                      <td className="supg-actions-td">
                        <div className="acciones-cell supg-actions">
                          <button className="btn-acc btn-acc-audio" onClick={() => abrirModalRevisar(v)} disabled={!v.audioUrl}>Escuchar</button>
                          <button className="btn-acc btn-acc-fotos" onClick={() => setFotosVenta(v)}>Fotos</button>
                          <button className="btn-acc btn-acc-obs" onClick={() => setModalObs(v)}>Obs</button>
                        </div>
                      </td>
                      <td>
                        <span className={`badge-grab ${badge.cls}`} onClick={() => abrirModalRevisar(v)} style={{ cursor: 'pointer' }}>
                          {badge.label}
                        </span>
                      </td>
                      <td><CanalBadge canal={v.canal} /></td>
                      <td>
                        {['aprobado','conforme','observado','no_conforme','rechazado'].includes(v.estadoRev)
                          ? <span className={`badge-grab ${['aprobado','conforme'].includes(v.estadoRev) ? 'bg-grabado' : 'bg-observado'}`}>
                              {['aprobado','conforme'].includes(v.estadoRev) ? 'APROBADO' : v.estadoRev === 'no_conforme' ? 'NO CONFORME' : v.estadoRev === 'rechazado' ? 'RECHAZADO' : 'OBSERVADO'}
                            </span>
                          : <span style={{color:'#9ca3af'}}>—</span>}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: '#374151' }}>{v.sot || '—'}</td>
                      <td><span style={{ color: '#185FA5', fontWeight: 700, fontSize: '11px' }}>{formatF(v.fechaIngreso)}</span></td>
                      <td style={{ fontWeight: 600 }}>{v.nombreApellidos || '--'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{v.dni || '--'}</td>
                      <td style={{ fontFamily: 'monospace', color: '#185FA5', fontWeight: 700 }}>{v.telefonoContacto || '--'}</td>
                      <td style={{ maxWidth: '190px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.email || ''}>{v.email || '—'}</td>
                      <td style={{ fontWeight: 600, color: '#7C3AED' }}>{v.vendedor || '--'}</td>
                      <td style={{ fontWeight: 600 }}>{v.sala || '--'}</td>
                      <td style={{ fontSize: '11px' }}>{v.supervisor || '--'}</td>
                      <td>
                        {v.audioUrl
                          ? <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '11px' }}>OK {v.audioNombre}</span>
                          : <span style={{ color: '#9ca3af', fontSize: '11px', fontStyle: 'italic' }}>Sin grabación</span>
                        }
                      </td>
                      <td style={{ fontSize: '10px', color: v.obsProgramacion ? '#c2410c' : '#9ca3af', fontWeight: v.obsProgramacion ? 700 : 400, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.obsProgramacion || ''}>
                        {v.obsProgramacion || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="paginacion">
            <span className="pag-info">{totalPag > 0 ? `Mostrando ${inicio + 1}?${fin} de ${totalPag}` : ''}</span>
            <Paginacion total={totalPag} pagina={pagina} porPagina={porPagina} onChange={p => setPagina(p)} />
          </div>
        </div>
      </div>

      <MediaViewer
        open={!!mediaVenta}
        onClose={() => setMediaVenta(null)}
        ventaId={mediaVenta?.id}
        title={`Archivos de ${mediaVenta?.nombreApellidos || 'la venta'}`}
        subtitle={`DNI: ${mediaVenta?.dni || '?'} ? Tel: ${mediaVenta?.telefonoContacto || '?'}`}
        audioPath={mediaVenta?.audioPath || mediaVenta?.audioUrl}
        audioName={mediaVenta?.audioNombre}
      />

      <MediaViewer
        open={!!fotosVenta}
        onClose={() => setFotosVenta(null)}
        ventaId={fotosVenta?.id}
        title={`Fotos de ${fotosVenta?.nombreApellidos || 'la venta'}`}
        subtitle={`DNI: ${fotosVenta?.dni || '—'} · Tel: ${fotosVenta?.telefonoContacto || '—'}`}
      />

      {/* MODAL REVISAR */}
      {modalRevisar && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) cerrarModalRevisar() }}>
          <div className="modal-box" style={{ maxWidth: '520px' }}>
            <div className="modal-title">Revisar Grabación</div>
            <div className="modal-sub">
              Cliente: <strong>{modalRevisar.nombreApellidos || '--'}</strong> ?{' '}
              Vendedor: <strong>{modalRevisar.vendedor || '--'}</strong> ?{' '}
              Fecha: <strong>{formatF(modalRevisar.fechaIngreso)}</strong>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '6px' }}>Grabación</div>
              <div className="audio-player">
                {audioSrc
                  ? <audio ref={audioRef} src={audioSrc} controls style={{ width: '100%' }} />
                  : <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic', padding: '8px 0' }}>Sin archivo de audio disponible.</div>
                }
              </div>
              {audioSrc && (
                <div style={{ marginTop: '8px' }}>
                  <a href={audioSrc} download={`grabacion_${modalRevisar.id}.mp3`}
                    style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', borderRadius: '8px', fontSize: '12px', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    Descargar audio
                  </a>
                </div>
              )}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: '8px' }}>Resultado de revisión</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(esSegundoCicloVenta(modalRevisar)
                  ? [
                      { id: 'conforme',     label: 'CONFORME',     border: '#86efac', bg: '#f0fdf4', color: '#15803d' },
                      { id: 'audio_subido', label: 'AUDIO SUBIDO', border: '#86efac', bg: '#f0fdf4', color: '#15803d' },
                      { id: 'no_conforme',  label: 'NO CONFORME',  border: '#fca5a5', bg: '#fef2f2', color: '#b91c1c' },
                      { id: 'rechazado',     label: 'RECHAZADO',     border: '#fb7185', bg: '#fff1f2', color: '#be123c' },
                    ]
                  : ['audio_subido', 'rechazado'].includes(modalRevisar.estadoRev)
                    ? [
                        { id: 'conforme',    label: 'CONFORME',    border: '#86efac', bg: '#f0fdf4', color: '#15803d' },
                        { id: 'no_conforme', label: 'NO CONFORME', border: '#fca5a5', bg: '#fef2f2', color: '#b91c1c' },
                        { id: 'rechazado',    label: 'RECHAZADO',    border: '#fb7185', bg: '#fff1f2', color: '#be123c' },
                      ]
                    : [
                        { id: 'aprobado',  label: 'APROBADO',  border: '#86efac', bg: '#f0fdf4', color: '#15803d' },
                        { id: 'observado', label: 'OBSERVADO', border: '#c4b5fd', bg: '#ede9fe', color: '#4c1d95' },
                      ]
                ).map(btn => (
                  <button key={btn.id} onClick={() => setEstadoRevision(btn.id)}
                    style={{
                      padding: '9px 18px', border: `2px solid ${btn.border}`,
                      background: btn.bg, color: btn.color, borderRadius: '8px',
                      fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                      outline: estadoRevision === btn.id ? '3px solid #7C3AED' : 'none',
                      transform: estadoRevision === btn.id ? 'scale(1.04)' : 'none',
                      transition: 'all .15s',
                    }}
                  >{btn.label}</button>
                ))}
              </div>
              {estadoRevision && estadoRevision !== 'sin_revisar' && (
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#7C3AED', fontWeight: 600 }}>
                  Seleccionado: {estadoRevision.replace('_', ' ').toUpperCase()}
                </div>
              )}
            </div>

            <div className="modal-campo">
              <label>Observación del supervisor (opcional)</label>
              <textarea value={revObs} onChange={e => setRevObs(e.target.value)}
                placeholder="Observación de calidad o corrección requerida..." rows="3" />
            </div>

            <div className="modal-btns">
              <button className="btn-cancelar-m" onClick={cerrarModalRevisar}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarRevision} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar revisión'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL OBS */}
      {modalObs && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModalObs(null) }}>
          <div className="modal-box" style={{ maxWidth: '460px' }}>
            <div className="modal-title">Observaciones del supervisor</div>
            <div className="modal-sub">{modalObs.nombreApellidos || '--'}</div>
            <div className="obs-historial" style={{ whiteSpace: 'pre-wrap' }}>
              {modalObs.obsSup
                ? modalObs.obsSup.split('\n').filter(l => l.trim()).join('\n')
                : 'Sin observaciones del supervisor.'
              }
            </div>
            <div className="modal-btns">
              <button className="btn-guardar" onClick={() => setModalObs(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
