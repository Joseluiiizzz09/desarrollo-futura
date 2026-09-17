import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import JefaturaViewControls from '../components/JefaturaViewControls'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import CanalBadge from '../components/CanalBadge'
import { API, ncHeaders } from '../services/api'
import { responseChanged, setVisibleInterval, clearVisibleInterval } from '../utils/polling'
import '../styles/programacion.css'

const BADGE_CLS = {
  GRABADO:          'b-grabado-prog',
  GRABADA_REVISION: 'b-grabada-revision',
  PROGRAMADO:       'b-programado',
  BLOQUEADO:        'b-bloqueado',
  SIN_AGENDA:       'b-sinagenda',
  CARACTER_ESPECIAL:'b-caracter',
  FRAUDE:           'b-fraude',
  ZONA_RESTRINGIDA: 'b-zona',
  PENDIENTE:        'b-pendiente',
}

const ESTADO_LABELS = {
  GRABADO:          'Grabado',
  GRABADA_REVISION: 'Grabada/Revisión',
  PROGRAMADO:       'Programado',
  BLOQUEADO:        'Bloqueado',
  SIN_AGENDA:       'Sin agenda',
  CARACTER_ESPECIAL:'Carácter especial',
  FRAUDE:           'Fraude',
  ZONA_RESTRINGIDA: 'Zona restringida',
  PENDIENTE:        'Pendiente',
}

const ESTADO_BTNS = [
  { id: 'PROGRAMADO',        label: 'Programado',        cls: 'be-programado' },
  { id: 'RECHAZADO',         label: 'Rechazado',         cls: 'be-rechazado'  },
  { id: 'BLOQUEADO',         label: 'Bloqueado',         cls: 'be-bloqueado'  },
  { id: 'SIN_AGENDA',        label: 'Sin agenda',        cls: 'be-sinagenda'  },
  { id: 'CARACTER_ESPECIAL', label: 'Carácter especial', cls: 'be-caracter'   },
  { id: 'FRAUDE',            label: 'Fraude',            cls: 'be-fraude'     },
  { id: 'ZONA_RESTRINGIDA',  label: 'Zona restringida',  cls: 'be-zona'       },
]

// Estado inicial visible al llegar a Programación: si Programación todavía
// no actuó (estado sigue en VALIDADO) y Super de Grabaciones ya corroboró
// la grabación, se muestra GRABADO. Es puramente de presentación — no se
// persiste nada distinto; `estado` sigue intacto (campo de Validación).
function estadoVisible(v) {
  // Seguimiento también actualiza `estado` (por ejemplo a INSTALADO o CAIDA).
  // En esta pantalla debe prevalecer la última tipificación propia de
  // Programación hasta que el área la cambie explícitamente.
  const propioProgramacion = (v.estado_prog || '').toUpperCase()
  if (ESTADO_BTNS.some(({ id }) => id === propioProgramacion)) {
    return propioProgramacion
  }
  const raw = (v.estado || '').toUpperCase()
  if (raw === 'VALIDADO' && (v.estado_grab || '').toLowerCase() === 'grabado') {
    return (v.estado_supgrab || '').toLowerCase() === 'aprobado'
      ? 'GRABADO'
      : 'GRABADA_REVISION'
  }
  return raw
}

function formatF(f) {
  if (!f) return '—'
  const d = f.split('T')[0] || f
  const p = d.split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : f
}

function DetCampo({ label, val }) {
  return <div className="det-campo"><label>{label}</label><span>{val || '—'}</span></div>
}

function DetSeccion({ titulo }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: .3, margin: '14px 0 8px' }}>
      {titulo}
    </div>
  )
}

export default function Programacion() {
  const navigate = useNavigate()
  const { sesion, logout } = useAuth()

  const [ventas, setVentas]       = useState([])
  const [fEstado, setFEstado]     = useState('')
  const [fAsesor, setFAsesor]     = useState('')
  const [fDesde, setFDesde]       = useState('')
  const [fHasta, setFHasta]       = useState('')
  const [busqueda, setBusqueda]   = useState('')

  const [modalDet, setModalDet]       = useState(null)
  const [estadoModal, setEstadoModal] = useState('')
  const [obsProg, setObsProg]         = useState('')
  const [sotProg, setSotProg]         = useState('')
  const [fechaProg, setFechaProg]     = useState('')
  const [errorGuardado, setErrorGuardado] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [toastMsg, setToastMsg] = useState('')
  const toastRef = useRef(null)

  function mostrarToast(msg) {
    setToastMsg(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToastMsg(''), 3200)
  }

  const cargandoVentasRef = useRef(false)
  const firmaVentasRef = useRef('')
  const cargarVentas = useCallback(async () => {
    if (cargandoVentasRef.current) return  // evita polls solapados (respuestas fuera de orden que causan parpadeo)
    cargandoVentasRef.current = true
    try {
      const res  = await fetch(`${API}/ventas?programacion=1`, { headers: ncHeaders() })
      const data = await res.json()
      if (!data.ok) { mostrarToast('Error cargando ventas'); return }
      if (!responseChanged(firmaVentasRef, data.data)) return
      setVentas(data.data.filter(v => {
        const e = (v.estado || '').toUpperCase()
        return e !== 'VENTA' && e !== ''
      }))
    } catch (e) { mostrarToast('Error conectando al servidor') }
    finally { cargandoVentasRef.current = false }
  }, [])

  useEffect(() => {
    cargarVentas()
    const timer = setVisibleInterval(cargarVentas, 1000)
    return () => clearVisibleInterval(timer)
  }, [cargarVentas])

  const ventasFiltradas = useMemo(() => ventas.filter(v => {
    const est   = estadoVisible(v)
    const fecha = (v.created_at || '').split('T')[0].split(' ')[0]
    if (fEstado  && est !== fEstado.toUpperCase()) return false
    if (fAsesor  && !(v.asesor_nombre || '').toLowerCase().includes(fAsesor.toLowerCase())) return false
    if (fDesde   && fecha < fDesde) return false
    if (fHasta   && fecha > fHasta) return false
    if (busqueda) {
      const b = busqueda.toLowerCase()
      if (![(v.dni || ''), (v.nombre || ''), (v.asesor_nombre || '')].join(' ').toLowerCase().includes(b)) return false
    }
    return true
  }), [ventas, fEstado, fAsesor, fDesde, fHasta, busqueda])

  const kpis = useMemo(() => ({
    total:       ventas.length,
    programado:  ventas.filter(v => (v.estado || '').toUpperCase() === 'PROGRAMADO').length,
    pendiente:   ventas.filter(v => (v.estado || '').toUpperCase() === 'PENDIENTE').length,
    noValidas:   ventas.filter(v => ['FRAUDE', 'ZONA_RESTRINGIDA', 'ZONA RESTRINGIDA'].includes((v.estado || '').toUpperCase())).length,
    caracter:    ventas.filter(v => ['CARACTER_ESPECIAL', 'CARÁCTER_ESPECIAL', 'CARACTER ESPECIAL', 'CARÁCTER ESPECIAL'].includes((v.estado || '').toUpperCase())).length,
    sinAgenda:   ventas.filter(v => ['SIN_AGENDA', 'SIN AGENDA'].includes((v.estado || '').toUpperCase())).length,
  }), [ventas])

  function limpiarFiltros() {
    setFEstado(''); setFAsesor(''); setFDesde(''); setFHasta(''); setBusqueda('')
  }

  function abrirDetalle(v) {
    setModalDet(v)
    setEstadoModal(estadoVisible(v))
    setObsProg(v.obs_programacion || '')
    setSotProg(v.sot || '')
    setFechaProg((v.fecha_programada || '').split('T')[0])
    setErrorGuardado('')
  }

  function cerrarModal() {
    setModalDet(null)
    setEstadoModal('')
    setObsProg('')
    setSotProg('')
    setFechaProg('')
    setErrorGuardado('')
  }

  async function guardarCambios() {
    if (!modalDet || guardando) return
    setErrorGuardado('')
    if (!estadoModal) {
      setErrorGuardado('Seleccione el estado que desea guardar.')
      return
    }
    if (estadoModal === 'PROGRAMADO' && (!sotProg.trim() || !fechaProg)) {
      setErrorGuardado('Para marcar la venta como PROGRAMADO debe ingresar el SOT y la fecha programada.')
      return
    }
    const esRechazo = estadoModal === 'RECHAZADO'
    const payload = esRechazo
      ? {
          ...(['VALIDADO','APROBADO','PROGRAMADO','PENDIENTE','BLOQUEADO','SIN_AGENDA','CARACTER_ESPECIAL'].includes((modalDet.estado || '').toUpperCase())
            ? { estado: 'VALIDADO' } : {}),
          estado_grab: 'grabado',
          estado_supgrab: 'sin_revisar',
          obs_programacion: obsProg,
        }
      : {
          estado: estadoModal,
          obs_programacion: obsProg,
          ...(estadoModal === 'PROGRAMADO'
            ? {
                sot: sotProg.trim(),
                fecha_programada: fechaProg,
                estado_supgrab: 'programado',
                estado_grab: 'grabado',
              }
            : {}),
        }
    try {
      setGuardando(true)
      const res  = await fetch(`${API}/ventas/${modalDet.id}?area=programacion`, {
        method: 'PATCH', headers: ncHeaders(),
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setErrorGuardado(data.mensaje || 'No se pudo actualizar la venta. Intente nuevamente.')
        return
      }
      setVentas(list => list.map(x =>
        x.id === modalDet.id
          ? {
              ...x,
              ...payload,
              sot: payload.sot ?? x.sot,
              fecha_programada: payload.fecha_programada ?? x.fecha_programada,
            }
          : x
      ))
      cerrarModal()
    } catch (e) {
      setErrorGuardado('No se pudo conectar con el servidor. Intente nuevamente.')
    } finally {
      setGuardando(false)
    }
  }

  function salir() { logout(); navigate('/login') }

  return (
    <div className="programacion-shell">
      {/* Inline styles replicating the original <style> block */}
      <style>{`
        .be-bloqueado  { background:#fee2e2;color:#991b1b;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer; }
        .be-sinagenda  { background:#fef9c3;color:#854d0e;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer; }
        .be-caracter   { background:#ede9fe;color:#5b21b6;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer; }
        .be-fraude     { background:#1f2937;color:#fff;   border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer; }
        .be-zona       { background:#ffedd5;color:#9a3412;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer; }
        .be-programado { background:#dcfce7;color:#15803d;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer; }
        .btn-estado:hover { opacity:.85;transform:scale(1.04); }
        .b-bloqueado  { background:#fee2e2;color:#991b1b; }
        .b-sinagenda  { background:#fef9c3;color:#854d0e; }
        .b-caracter   { background:#ede9fe;color:#5b21b6; }
        .b-fraude     { background:#1f2937;color:#fff; }
        .b-zona       { background:#ffedd5;color:#9a3412; }
        .programacion-shell .prog-reference-kpis {
          grid-template-columns:repeat(6,minmax(0,1fr))!important;
          gap:8px!important;
        }
        .programacion-shell .prog-reference-kpis > .kpi-card {
          min-width:0!important;
          min-height:64px!important;
          padding:9px 13px!important;
        }
        @media (max-width:900px) {
          .programacion-shell .prog-reference-kpis {
            grid-template-columns:repeat(3,minmax(0,1fr))!important;
          }
        }
        @media (max-width:560px) {
          .programacion-shell .prog-reference-kpis {
            grid-template-columns:repeat(2,minmax(0,1fr))!important;
          }
        }
      `}</style>

      <div className="topbar module-topbar-standard">
        <div className="brand">
          <div className="logo-circle">
            <img src="/assets/logo-futura.png" alt="" onError={e => { e.target.parentNode.textContent = '' }} />
          </div>
          <div className="brand-text">
            <img src="/assets/futura-wordmark.png" alt="FUTURA" style={{height:22,width:"auto",display:"block"}} />
            <span className="brand-sub">Programación</span>
          </div>
        </div>
        <div className="topbar-right">
          <JefaturaViewControls>
            <span className="topbar-badge" style={{ background: '#7c3aed' }}>PROGRAMACIÓN</span>
            <span className="topbar-user">{sesion?.nombre || '—'}</span>
          </JefaturaViewControls>
          <CambiarAreaMenu />
          <button className="topbar-salir" onClick={salir}>Salir</button>
        </div>
      </div>

      <section className="programacion-reference-banner" aria-label="Encabezado de programación">
        <div className="programacion-reference-copy">
          <h2>Ventas para Programar</h2>
          <p>Ventas aprobadas por Grabaciones — gestiona el estado de instalación</p>
        </div>
        <button className="programacion-reference-refresh" onClick={cargarVentas}>Actualizar</button>
      </section>

      <main className="main-content programacion-page prog-reference-page">
        <section className="kpi-grid programacion-kpis prog-reference-kpis">
          <div className="kpi-card k-purple"><div className="kpi-num">{kpis.total}</div><div className="kpi-label">Total</div></div>
          <div className="kpi-card k-blue"><div className="kpi-num">{kpis.programado}</div><div className="kpi-label">Programadas</div></div>
          <div className="kpi-card k-orange"><div className="kpi-num">{kpis.pendiente}</div><div className="kpi-label">Pendientes</div></div>
          <div className="kpi-card k-novalidas"><div className="kpi-num">{kpis.noValidas}</div><div className="kpi-label">No válidas</div></div>
          <div className="kpi-card k-caracter"><div className="kpi-num">{kpis.caracter}</div><div className="kpi-label">Carácter especial</div></div>
          <div className="kpi-card k-sinagenda"><div className="kpi-num">{kpis.sinAgenda}</div><div className="kpi-label">Sin agenda</div></div>
        </section>

        <section className="filtros-panel prog-reference-filters">
          <div className="filtros-row prog-reference-filters-row">
            <div className="filtro-group prog-reference-filter">
              <label>Estado</label>
              <select className="filtro-select" value={fEstado} onChange={e => setFEstado(e.target.value)}>
                <option value="">Todos</option>
                <option value="GRABADA_REVISION">Grabada/Revisión</option>
                <option value="GRABADO">Grabado</option>
                <option value="PROGRAMADO">Programado</option>
                <option value="BLOQUEADO">Bloqueado</option>
                <option value="SIN_AGENDA">Sin agenda</option>
                <option value="CARACTER_ESPECIAL">Carácter especial</option>
                <option value="FRAUDE">Fraude</option>
                <option value="ZONA_RESTRINGIDA">Zona restringida</option>
                <option value="PENDIENTE">Pendiente</option>
              </select>
            </div>
            <div className="filtro-group prog-reference-filter">
              <label>Asesor</label>
              <input type="text" className="filtro-input" value={fAsesor}
                onChange={e => setFAsesor(e.target.value)} placeholder="Nombre asesor..." />
            </div>
            <div className="filtro-group prog-reference-filter">
              <label>Desde</label>
              <input type="date" className="filtro-input" value={fDesde} onChange={e => setFDesde(e.target.value)} />
            </div>
            <div className="filtro-group prog-reference-filter">
              <label>Hasta</label>
              <input type="date" className="filtro-input" value={fHasta} onChange={e => setFHasta(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
              <button className="btn-limpiar" onClick={limpiarFiltros}>Limpiar</button>
            </div>
          </div>
        </section>

        <section className="tabla-wrap prog-reference-table">
          <div className="tabla-header prog-reference-table-header">
            <div className="tabla-header-left">
              <span className="tabla-title">Lista de ventas programadas</span>
              <span className="tabla-count prog-count">{ventasFiltradas.length} registros</span>
            </div>
            <input type="text" className="tabla-search" value={busqueda}
              onChange={e => setBusqueda(e.target.value)} placeholder="Buscar DNI, nombre, asesor..." />
          </div>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>#</th><th>Fecha</th><th>Nombre</th><th>DNI</th>
                  <th>Asesor</th><th>Sala</th><th>Distrito</th>
                  <th>Paquete</th><th>Estado</th><th>Canal</th><th>Obs. Programación</th><th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {ventasFiltradas.length === 0 ? (
                  <tr className="tabla-empty"><td colSpan="12">Sin registros con esos filtros.</td></tr>
                ) : ventasFiltradas.map((v, i) => {
                  const fecha = formatF((v.created_at || '').split(' ')[0])
                  const estadoRaw = estadoVisible(v)
                  const cls   = BADGE_CLS[estadoRaw] || 'b-venta'
                  const estadoLabel = ESTADO_LABELS[estadoRaw] || estadoRaw || '—'
                  return (
                    <tr key={v.id}>
                      <td style={{ color: '#9ca3af', fontSize: '10px' }}>{i + 1}</td>
                      <td style={{ fontSize: '11px', color: '#374151', whiteSpace: 'nowrap' }}>{fecha}</td>
                      <td style={{ fontWeight: 700, fontSize: '12px' }}>{v.nombre || '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{v.dni || '—'}</td>
                      <td style={{ fontSize: '12px' }}>{v.asesor_nombre || '—'}</td>
                      <td style={{ fontSize: '11px', color: '#9ca3af' }}>{v.sala || '—'}</td>
                      <td style={{ fontSize: '11px' }}>{v.distrito || '—'}</td>
                      <td style={{ fontSize: '11px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.paquete || ''}>{v.paquete || '—'}</td>
                      <td><span className={`badge ${cls}`}>{estadoLabel}</span></td>
                      <td style={{ textAlign: 'center' }}><CanalBadge canal={v.canal} /></td>
                      <td style={{ fontSize: '11px', color: '#6b7280', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.obs_programacion || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button className="btn-accion btn-ver-det" onClick={() => abrirDetalle(v)}>Ver / Editar</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* MODAL DETALLE */}
      {modalDet && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) cerrarModal() }}>
          <div className="modal-box" style={{ maxWidth: '640px' }}>
            <div className="modal-head">
              <span className="modal-head-title">Detalle de Venta</span>
              <button className="modal-close" onClick={cerrarModal}>×</button>
            </div>
            <div className="modal-body">
              {/* Ficha completa de la venta — solo lectura. Programación no
                  puede editar ningún dato original desde aquí, únicamente
                  su propio estado y observación (sección al final). */}
              <DetSeccion titulo="Datos personales" />
              <div className="det-grid">
                <DetCampo label="Nombre"            val={modalDet.nombre} />
                <DetCampo label="Tipo Documento"    val={modalDet.tipo_doc || 'DNI'} />
                <DetCampo label="DNI / Doc."        val={modalDet.dni} />
                <DetCampo label="Fecha Nacimiento"  val={modalDet.fecha_nac} />
                <DetCampo label="Lugar Nacimiento"  val={modalDet.lugar_nac} />
                <DetCampo label="Padre"             val={modalDet.padre} />
                <DetCampo label="Madre"             val={modalDet.madre} />
              </div>

              <DetSeccion titulo="Contacto y ubicación" />
              <div className="det-grid">
                <DetCampo label="Teléfono Contacto"   val={modalDet.telefono1} />
                <DetCampo label="Teléfono Referencia" val={modalDet.telefono2} />
                <DetCampo label="Correo electrónico"  val={modalDet.email} />
                <DetCampo label="Departamento"        val={modalDet.departamento} />
                <DetCampo label="Provincia"           val={modalDet.provincia} />
                <DetCampo label="Distrito"            val={modalDet.distrito} />
                <div className="det-campo det-full"><label>Dirección</label><span>{modalDet.direccion || '—'}</span></div>
                <DetCampo label="Coordenadas"         val={modalDet.coordenadas} />
              </div>

              <DetSeccion titulo="Datos del servicio" />
              <div className="det-grid">
                <DetCampo label="Cuota Inst."  val={modalDet.cuota_inst} />
                <DetCampo label="Claro Hogar"  val={modalDet.claro_hogar} />
                <DetCampo label="Tecnología"   val={modalDet.tecnologia} />
                <div className="det-campo det-full"><label>Paquete Real</label><span>{modalDet.paquete || '—'}</span></div>
                <DetCampo label="Full Claro"   val={modalDet.full_claro} />
                <DetCampo label="Decos"        val={modalDet.cant_decos} />
                <DetCampo label="Mesh"         val={modalDet.cant_mesh} />
                <DetCampo label="Plano"        val={modalDet.plano} />
              </div>

              <DetSeccion titulo="Datos comerciales / operativos" />
              <div className="det-grid">
                <DetCampo label="Asesor / Vendedor" val={modalDet.asesor_nombre} />
                <DetCampo label="Supervisor"        val={modalDet.supervisor} />
                <DetCampo label="Sala"              val={modalDet.sala} />
                <DetCampo label="Fecha ingreso"     val={formatF((modalDet.created_at || '').split(' ')[0])} />
                <div className="det-campo det-full"><label>Observación original</label><span>{modalDet.observacion || '—'}</span></div>
              </div>

              <DetSeccion titulo="Programación" />
              <div className="cambiar-estado-wrap">
                <label>Cambiar estado de programación</label>
                <div className="estado-btns">
                  {ESTADO_BTNS.map(btn => (
                    <button
                      key={btn.id}
                      className={`btn-estado ${btn.cls}${estadoModal === btn.id ? ' selected' : ''}`}
                      onClick={() => { setEstadoModal(btn.id); setErrorGuardado('') }}
                    >{btn.label}</button>
                  ))}
                </div>
                {estadoModal && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#7c3aed', fontWeight: 600 }}>
                    {estadoModal === modalDet.estado ? 'Estado actual: ' : 'Nuevo estado: '}
                    {ESTADO_LABELS[estadoModal] || estadoModal}
                  </div>
                )}
                {estadoModal === 'PROGRAMADO' && (
                  <div className="programado-datos">
                    <label>
                      SOT
                      <input
                        type="text"
                        value={sotProg}
                        onChange={e => { setSotProg(e.target.value); setErrorGuardado('') }}
                        placeholder="Ingrese SOT"
                        maxLength={100}
                      />
                    </label>
                    <label>
                      Fecha programada
                      <input
                        type="date"
                        value={fechaProg}
                        onChange={e => { setFechaProg(e.target.value); setErrorGuardado('') }}
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="obs-wrap">
                <label>Observación de Programación</label>
                <textarea value={obsProg} onChange={e => setObsProg(e.target.value)}
                  placeholder="Ingresa observaciones sobre la instalación..." />
              </div>
              {errorGuardado && (
                <div role="alert" style={{
                  marginTop: '12px', padding: '10px 12px', border: '1px solid #fca5a5',
                  borderRadius: '8px', background: '#fff1f2', color: '#b91c1c',
                  fontSize: '12px', fontWeight: 700,
                }}>
                  {errorGuardado}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-cancelar-m" onClick={cerrarModal} disabled={guardando}>Cancelar</button>
              <button className="btn-guardar-m" onClick={guardarCambios} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

