import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { API, ncHeaders } from '../services/api'
import { permisosDeUsuario, usuarioTieneCargo } from '../utils/roles'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import '../styles/usuarios.css'

const CARGO_CLASE = {
  asesor:        'bc-asesor',
  supervisor:    'bc-supervisor',
  backoffice:    'bc-backoffice',
  validacion:    'bc-validacion',
  grabaciones:   'bc-grabaciones',
  seguimiento:   'bc-seguimiento',
  jefatura:      'bc-jefatura',
  programacion:  'bc-programacion',
  cobranzas:     'bc-cobranzas',
  calidad:       'bc-calidad',
  supcalidad:    'bc-calidad',
  supgrabaciones:'bc-supgrabaciones',
  usuarios:      'bc-usuarios',
  backreclutamiento:   'bc-backreclutamiento',
  entrevistas:   'bc-entrevistas',
  capacitador:   'bc-capacitador',
}

const CARGOS = [
  { value: 'asesor',         label: 'Asesor'           },
  { value: 'supervisor',     label: 'Supervisor'       },
  { value: 'backoffice',     label: 'Back Office'      },
  { value: 'validacion',     label: 'Validación'       },
  { value: 'grabaciones',    label: 'Grabaciones'      },
  { value: 'seguimiento',    label: 'Seguimiento'      },
  { value: 'jefatura',       label: 'Jefatura'         },
  { value: 'usuarios',       label: 'Usuarios'         },
  { value: 'programacion',   label: 'Programación'     },
  { value: 'cobranzas',      label: 'Cobranzas'        },
  { value: 'calidad',        label: 'Calidad'          },
  { value: 'supcalidad',     label: 'Super de Calidad' },
  { value: 'supgrabaciones', label: 'Sup. Grabaciones' },
  { value: 'backreclutamiento',   label: 'Back Data Reclutaminto'  },
  { value: 'entrevistas',   label: 'Entrevistas'  },
  { value: 'capacitador',   label: 'Capacitación'  },
]

const FORM_VACIO = { nombre: '', usuario: '', pass: '', pass2: '', cargo: '', cargo2: '', sala: '', genero: 'M', activo: true }

export default function Usuarios() {
  const navigate = useNavigate()
  const { logout, sesion } = useAuth()

  const [usuarios, setUsuarios] = useState([])
  const [buscar, setBuscar]         = useState('')
  const [filtroCargo, setFiltroCargo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  // Modal crear/editar
  const [modalOpen, setModalOpen]   = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm]             = useState(FORM_VACIO)
  const [errores, setErrores]       = useState({})
  const [guardando, setGuardando]   = useState(false)

  // Modal eliminar
  const [modalElim, setModalElim]   = useState(null)
  const [eliminando, setEliminando] = useState(false)

  const [toastMsg, setToastMsg] = useState('')
  const toastRef = useRef(null)

  function mostrarToast(msg) {
    setToastMsg(msg)
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToastMsg(''), 3000)
  }

  const cargarUsuarios = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/usuarios`, { headers: ncHeaders() })
      const data = await res.json()
      if (!data.ok) { mostrarToast(data.mensaje || 'Error cargando usuarios'); return }
      setUsuarios(data.data)
    } catch (e) { mostrarToast('Error conectando al servidor') }
  }, [])

  useEffect(() => { cargarUsuarios() }, [cargarUsuarios])

  const usuariosFiltrados = useMemo(() => usuarios.filter(u => {
    const q = buscar.toLowerCase()
    if (q && !u.nombre.toLowerCase().includes(q) && !u.usuario.toLowerCase().includes(q)) return false
    if (filtroCargo  && !usuarioTieneCargo(u, filtroCargo)) return false
    if (filtroEstado && (filtroEstado === 'activo' ? !u.activo : u.activo)) return false
    return true
  }), [usuarios, buscar, filtroCargo, filtroEstado])

  const kpis = useMemo(() => ({
    total:        usuarios.length,
    activos:      usuarios.filter(u => u.activo).length,
    inactivos:    usuarios.filter(u => !u.activo).length,
    asesores:     usuarios.filter(u => usuarioTieneCargo(u, 'asesor')).length,
    supervisores: usuarios.filter(u => usuarioTieneCargo(u, 'supervisor')).length,
  }), [usuarios])

  function limpiarFiltros() { setBuscar(''); setFiltroCargo(''); setFiltroEstado('') }

  // MODAL CREAR
  function abrirModal() {
    setEditandoId(null)
    setForm(FORM_VACIO)
    setErrores({})
    setModalOpen(true)
  }

  // MODAL EDITAR
  function abrirModalEditar(u) {
    setEditandoId(u.id)
    const cargo2 = permisosDeUsuario(u).find(c => c !== u.cargo) || ''
    setForm({ nombre: u.nombre || '', usuario: u.usuario || '', pass: '', pass2: '', cargo: u.cargo || '', cargo2, sala: u.sala || '', genero: u.genero || 'M', activo: !!u.activo })
    setErrores({})
    setModalOpen(true)
  }

  function cerrarModal() {
    setModalOpen(false)
    setEditandoId(null)
    setForm(FORM_VACIO)
    setErrores({})
  }

  function setField(k, v) {
    setForm(f => ({ ...f, [k]: v }))
    setErrores(e => ({ ...e, [k]: '' }))
  }

  const [passVisible, setPassVisible]   = useState(false)
  const [pass2Visible, setPass2Visible] = useState(false)

  async function guardarUsuario() {
    const errs = {}
    if (!form.nombre.trim())  errs.nombre  = 'El nombre es obligatorio'
    if (!form.usuario.trim()) errs.usuario = 'El usuario es obligatorio'
    if (!editandoId && !form.pass) errs.pass = 'La contraseña es obligatoria'
    else if (form.pass && form.pass.length < 6) errs.pass = 'Mínimo 6 caracteres'
    if (form.pass && form.pass !== form.pass2) errs.pass2 = 'Las contraseñas no coinciden'
    if (!form.cargo) errs.cargo = 'Selecciona un cargo'
    if (form.cargo2 && form.cargo2 === form.cargo) errs.cargo2 = 'El cargo adicional debe ser diferente'
    if (Object.keys(errs).length) { setErrores(errs); return }

    setGuardando(true)
    try {
      let res, data
      if (editandoId) {
        const body = { nombre: form.nombre, usuario: form.usuario, cargo: form.cargo, sala: form.sala, genero: form.genero, permisos: form.cargo2 ? [form.cargo2] : [] }
        if (form.pass) body.password = form.pass
        res  = await fetch(`${API}/usuarios/${editandoId}`, { method: 'PATCH', headers: ncHeaders(), body: JSON.stringify(body) })
        data = await res.json()
        if (!data.ok) {
          if (res.status === 409) setErrores(e => ({ ...e, usuario: 'Ese usuario ya existe' }))
          else mostrarToast(data.mensaje || 'Error actualizando')
          setGuardando(false); return
        }
        await fetch(`${API}/usuarios/${editandoId}/estado`, { method: 'PATCH', headers: ncHeaders(), body: JSON.stringify({ activo: form.activo }) })
      } else {
        res  = await fetch(`${API}/usuarios`, {
          method: 'POST', headers: ncHeaders(),
          body: JSON.stringify({ nombre: form.nombre, usuario: form.usuario, password: form.pass, cargo: form.cargo, sala: form.sala, genero: form.genero, activo: form.activo, permisos: form.cargo2 ? [form.cargo2] : [] }),
        })
        data = await res.json()
        if (!data.ok) {
          if (res.status === 409) setErrores(e => ({ ...e, usuario: 'Ese usuario ya existe' }))
          else mostrarToast(data.mensaje || 'Error creando')
          setGuardando(false); return
        }
      }
      await cargarUsuarios()
      cerrarModal()
    } catch (e) { mostrarToast('Error conectando al servidor') }
    setGuardando(false)
  }

  async function toggleEstado(id, nuevoEstado) {
    try {
      const res  = await fetch(`${API}/usuarios/${id}/estado`, { method: 'PATCH', headers: ncHeaders(), body: JSON.stringify({ activo: nuevoEstado }) })
      const data = await res.json()
      if (!data.ok) { mostrarToast(data.mensaje || 'Error'); return }
      setUsuarios(list => list.map(u => u.id === id ? { ...u, activo: nuevoEstado } : u))
    } catch (e) { mostrarToast('Error conectando al servidor') }
  }

  async function confirmarEliminar() {
    if (!modalElim) return
    setEliminando(true)
    try {
      const res  = await fetch(`${API}/usuarios/${modalElim.id}`, { method: 'DELETE', headers: ncHeaders() })
      const data = await res.json()
      if (!data.ok) { mostrarToast(data.mensaje || 'Error eliminando'); setEliminando(false); return }
      setModalElim(null)
      await cargarUsuarios()
    } catch (e) { mostrarToast('Error conectando al servidor') }
    setEliminando(false)
  }

  function salir() { logout(); navigate('/login') }

  return (
    <div className="usu-root">
      <div className="topbar">
        <div className="brand">
          <div className="logo-circle"><img src="/assets/logo-futura.png" alt="FUTURA" /></div>
          <div className="brand-text">
            <img src="/assets/futura-wordmark.png" alt="FUTURA" style={{height:22,width:"auto",display:"block"}} />
            <span className="brand-sub">Gestión de Usuarios</span>
          </div>
        </div>
        <div className="topbar-right">
          <button onClick={() => navigate(-1)} className="btn-volver">← Volver</button>
          <CambiarAreaMenu />
          <button onClick={salir} className="btn-salir">Salir</button>
        </div>
      </div>

      <div className="pagina">
        <div className="page-header">
          <div>
            <h2>Usuarios del sistema</h2>
            <p>Crea, activa o desactiva usuarios de FUTURA</p>
          </div>
          <button className="btn-nuevo" onClick={abrirModal}>+ Nuevo Usuario</button>
        </div>

        <div className="kpi-strip">
          <div className="kpi kpi-blue">  <div className="kpi-num">{kpis.total}</div>        <div className="kpi-label">Total</div></div>
          <div className="kpi kpi-green"> <div className="kpi-num">{kpis.activos}</div>      <div className="kpi-label">Activos</div></div>
          <div className="kpi kpi-red">   <div className="kpi-num">{kpis.inactivos}</div>    <div className="kpi-label">Inactivos</div></div>
          <div className="kpi kpi-purple"><div className="kpi-num">{kpis.asesores}</div>     <div className="kpi-label">Asesores</div></div>
          <div className="kpi kpi-orange"><div className="kpi-num">{kpis.supervisores}</div> <div className="kpi-label">Supervisores</div></div>
        </div>

        <div className="filtros-bar">
          <input type="text" className="input-buscar" value={buscar}
            onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre o usuario..." />
          <select className="select-filtro" value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}>
            <option value="">Todos los cargos</option>
            {CARGOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <select className="select-filtro" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
          <button className="btn-limpiar" onClick={limpiarFiltros}>✕ Limpiar</button>
        </div>

        <div className="tabla-info">
          <span>{usuariosFiltrados.length} usuario{usuariosFiltrados.length !== 1 ? 's' : ''} encontrado{usuariosFiltrados.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="tabla-wrap">
          <table className="tabla-usuarios">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Nombre Completo</th>
                <th>Usuario</th>
                <th>Cargo</th>
                <th>Sala</th>
                <th>Estado</th>
                <th>Creado</th>
                <th style={{ width: '180px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', fontSize: '13px' }}>Sin usuarios registrados</td></tr>
              ) : usuariosFiltrados.map((u, i) => {
                const fecha    = u.created_at ? new Date(u.created_at).toLocaleDateString('es-PE') : '—'
                const cargoCls = CARGO_CLASE[u.cargo] || 'bc-default'
                const cargo2 = permisosDeUsuario(u).find(c => c !== u.cargo)
                return (
                  <tr key={u.id}>
                    <td style={{ color: '#9ca3af', fontSize: '11px' }}>{i + 1}</td>
                    <td>
                      <div className="nombre-main">{u.nombre}</div>
                      <span className="nombre-sub">Género: {u.genero === 'F' ? 'Femenino' : 'Masculino'}</span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 600, color: '#374151' }}>@{u.usuario}</td>
                    <td>
                      <div className="cargos-cell">
                        <span className={`badge-cargo ${cargoCls}`}>{u.cargo.toUpperCase()}</span>
                        {cargo2 && <span className={`badge-cargo ${CARGO_CLASE[cargo2] || 'bc-default'}`}>{cargo2.toUpperCase()}</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', color: '#374151' }}>{u.sala || '—'}</td>
                    <td>
                      {u.activo
                        ? <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: '#dcfce7', color: '#15803d' }}>Activo</span>
                        : <span style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: '#fee2e2', color: '#991b1b' }}>Inactivo</span>
                      }
                    </td>
                    <td style={{ fontSize: '11px', color: '#9ca3af' }}>{fecha}</td>
                    <td>
                      <div className="acc-fila">
                        {u.activo
                          ? <button className="btn-acc-toggle btn-desact" onClick={() => toggleEstado(u.id, false)}>Desactivar</button>
                          : <button className="btn-acc-toggle btn-act"    onClick={() => toggleEstado(u.id, true)}>Activar</button>
                        }
                        <button className="btn-acc-edit" onClick={() => abrirModalEditar(u)}>Editar</button>
                        <button className="btn-acc-del"  onClick={() => setModalElim(u)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR / EDITAR */}
      {modalOpen && (
        <div className="modal-overlay usuarios-modal-overlay" onClick={e => { if (e.target === e.currentTarget) cerrarModal() }}>
          <div className="modal-card usuarios-modal-card">
            <div className="modal-header usuarios-modal-header">
              <div className="modal-titulo">
                <span>{editandoId ? 'Editar Usuario' : 'Nuevo Usuario'}</span>
              </div>
              <button className="modal-close" onClick={cerrarModal}>✕</button>
            </div>

            <div className="modal-body usuarios-modal-body">
              <div className="campo-row">
                <div className="campo">
                  <label>Nombre Completo *</label>
                  <input type="text" value={form.nombre} onChange={e => setField('nombre', e.target.value)} placeholder="Ej: María García López" />
                  {errores.nombre && <span className="campo-error">{errores.nombre}</span>}
                </div>
                <div className="campo">
                  <label>Usuario (login) *</label>
                  <input type="text" value={form.usuario}
                    onChange={e => setField('usuario', e.target.value.toLowerCase().replace(/\s/g, ''))}
                    placeholder="Ej: mgarcia" />
                  {errores.usuario && <span className="campo-error">{errores.usuario}</span>}
                </div>
              </div>

              <div className="campo-row">
                <div className="campo">
                  <label>{editandoId ? 'Nueva contraseña' : 'Contraseña *'}</label>
                  <div className="pass-wrap">
                    <input type={passVisible ? 'text' : 'password'} value={form.pass} onChange={e => setField('pass', e.target.value)} placeholder="Mínimo 6 caracteres" />
                    <button type="button" className="btn-ver" onClick={() => setPassVisible(v => !v)}>{passVisible ? 'Ocultar' : 'Ver'}</button>
                  </div>
                  {errores.pass && <span className="campo-error">{errores.pass}</span>}
                </div>
                <div className="campo">
                  <label>Confirmar Contraseña</label>
                  <div className="pass-wrap">
                    <input type={pass2Visible ? 'text' : 'password'} value={form.pass2} onChange={e => setField('pass2', e.target.value)} placeholder="Repite la contraseña" />
                    <button type="button" className="btn-ver" onClick={() => setPass2Visible(v => !v)}>{pass2Visible ? 'Ocultar' : 'Ver'}</button>
                  </div>
                  {errores.pass2 && <span className="campo-error">{errores.pass2}</span>}
                </div>
              </div>

              {editandoId && (
                <div className="pass-hint">Deja en blanco para mantener la contraseña actual</div>
              )}

              <div className="campo-row">
                <div className="campo">
                  <label>Cargo principal *</label>
                  <select value={form.cargo} onChange={e => {
                    const nuevoCargo = e.target.value
                    setForm(f => ({ ...f, cargo: nuevoCargo, cargo2: f.cargo2 === nuevoCargo ? '' : f.cargo2 }))
                    setErrores(er => ({ ...er, cargo: '' }))
                  }}>
                    <option value="">— Seleccione cargo —</option>
                    {CARGOS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  {errores.cargo && <span className="campo-error">{errores.cargo}</span>}
                </div>
                <div className="campo">
                  <label>Cargo adicional (opcional)</label>
                  <select value={form.cargo2} onChange={e => setField('cargo2', e.target.value)}>
                    <option value="">— Sin cargo adicional —</option>
                    {CARGOS.filter(c => c.value !== form.cargo && c.value !== 'jefatura').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  {errores.cargo2 && <span className="campo-error">{errores.cargo2}</span>}
                </div>
              </div>

              <div className="campo-row">
                <div className="campo">
                  <label>Sala</label>
                  <select value={form.sala} onChange={e => setField('sala', e.target.value)}>
                    <option value="">— Sin sala —</option>
                    <option value="SALA 1">Sala 1</option>
                    <option value="SALA 2">Sala 2</option>
                    <option value="SALA 3">Sala 3</option>
                    <option value="SALA 4">Sala 4</option>
                    <option value="SALA CHANCAY">Sala Chancay</option>
                    <option value="SALA 5">Sala 5</option>
                  </select>
                </div>
                <div className="campo">
                  <label>Género</label>
                  <select value={form.genero} onChange={e => setField('genero', e.target.value)}>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                  </select>
                </div>
              </div>

              <div className="campo-row">
                <div className="campo">
                  <label>Estado</label>
                  <div className="toggle-wrap">
                    <label className="toggle-switch">
                      <input type="checkbox" checked={form.activo} onChange={e => setField('activo', e.target.checked)} />
                      <span className="toggle-slider"></span>
                    </label>
                    <span className="toggle-label">{form.activo ? 'Activo' : 'Inactivo'}</span>
                  </div>
                </div>
                <div className="campo cargo-secundario-ayuda">
                  <strong>Un usuario, dos funciones</strong>
                  <span>Al iniciar sesión podrá elegir con qué cargo trabajar.</span>
                </div>
              </div>
            </div>

            <div className="modal-footer usuarios-modal-footer">
              <button className="btn-cancel" onClick={cerrarModal}>Cancelar</button>
              <button className="btn-guardar" onClick={guardarUsuario} disabled={guardando}>
                {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {modalElim && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModalElim(null) }}>
          <div className="modal-card" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div className="modal-titulo"><span>Eliminar usuario</span></div>
              <button className="modal-close" onClick={() => setModalElim(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '14px', color: '#374151', textAlign: 'center', padding: '10px 0' }}>
                ¿Estás seguro que deseas eliminar a<br />
                <strong style={{ color: '#dc2626' }}>{modalElim.nombre}</strong>?<br />
                <span style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px', display: 'block' }}>Esta acción no se puede deshacer.</span>
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setModalElim(null)}>Cancelar</button>
              <button className="btn-eliminar-confirm" onClick={confirmarEliminar} disabled={eliminando}>
                {eliminando ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
