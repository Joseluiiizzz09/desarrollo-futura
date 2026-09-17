import { useEffect, useMemo, useState } from 'react'
import { API, ncHeaders } from '../services/api'
import '../styles/venta-assignment.css'

function textoFecha(fecha) {
  if (!fecha) return 'Fecha no disponible'
  const [dia, hora = ''] = String(fecha).split(' ')
  const partes = dia.split('-')
  const fechaLocal = partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : dia
  return `${fechaLocal}${hora ? ` · ${hora.slice(0, 5)}` : ''}`
}

function ModalBase({ title, subtitle, onClose, children, footer }) {
  useEffect(() => {
    const cerrar = event => { if (event.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [onClose])

  return (
    <div className="va-overlay" onClick={event => { if (event.target === event.currentTarget) onClose?.() }}>
      <div className="va-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="va-header">
          <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
          <button type="button" className="va-close" onClick={onClose} aria-label="Cerrar">×</button>
        </header>
        <div className="va-body">{children}</div>
        {footer && <footer className="va-footer">{footer}</footer>}
      </div>
    </div>
  )
}

export function ReasignarVentaModal({ venta, asesores = [], salas = [], alcance = 'global', onClose, onSuccess }) {
  const [asesorId, setAsesorId] = useState('')
  const [salaAtribuida, setSalaAtribuida] = useState(venta?.sala_atribucion || '')
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const opciones = useMemo(() => [...asesores]
    .filter(asesor => asesor.activo && asesor.cargo === 'asesor' && Number(asesor.id) !== Number(venta?.asesor_id))
    .sort((a, b) => String(a.sala || '').localeCompare(String(b.sala || '')) || String(a.nombre || '').localeCompare(String(b.nombre || ''))),
  [asesores, venta?.asesor_id])
  const opcionesFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLocaleUpperCase('es-PE')
    if (!termino) return opciones
    return opciones.filter(asesor => `${asesor.nombre || ''} ${asesor.sala || ''}`.toLocaleUpperCase('es-PE').includes(termino))
  }, [opciones, busqueda])
  const salasOpciones = useMemo(() => [...new Set([
    ...salas,
    ...asesores.map(asesor => asesor.sala),
    venta?.sala,
    venta?.asesor_sala_actual,
    venta?.sala_atribucion,
  ].map(sala => String(sala || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es')),
  [asesores, salas, venta?.asesor_sala_actual, venta?.sala, venta?.sala_atribucion])

  async function guardar() {
    const cambiarAsesor = Boolean(asesorId)
    const salaInicial = String(venta?.sala_atribucion || '').trim().toUpperCase()
    const salaFinal = String(salaAtribuida || '').trim().toUpperCase()
    const cambiarSala = salaFinal !== salaInicial
    if (!cambiarAsesor && !cambiarSala) { setError('Selecciona un asesor o una sala para guardar el cambio.'); return }
    setGuardando(true)
    setError('')
    try {
      const mensajes = []
      if (cambiarAsesor) {
        const res = await fetch(`${API}/ventas/${venta.id}/reasignar`, {
          method: 'PATCH',
          headers: ncHeaders(),
          body: JSON.stringify({ asesor_id: Number(asesorId) }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo reasignar la venta.')
        mensajes.push(data.mensaje)
      }
      if (cambiarSala) {
        const res = await fetch(`${API}/ventas/${venta.id}/sala-atribucion`, {
          method: 'PATCH',
          headers: ncHeaders(),
          body: JSON.stringify({ sala: salaFinal }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cambiar la sala atribuida.')
        mensajes.push(data.mensaje)
      }
      onSuccess?.({ mensaje: mensajes.filter(Boolean).join(' ') || 'Venta actualizada.' })
    } catch (err) {
      setError(err.message || 'No se pudo conectar con el servidor.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <ModalBase
      title="Reasignar venta"
      subtitle={`${venta?.nombre || 'Cliente'} · DNI ${venta?.dni || '—'}`}
      onClose={onClose}
      footer={<><button type="button" className="va-button secondary" onClick={onClose} disabled={guardando}>Cancelar</button><button type="button" className="va-button primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</button></>}
    >
      <div className="va-current">
        <span>Asesor actual</span>
        <strong>{String(venta?.asesor_nombre || venta?.asesor || 'Sin asignar').toLocaleUpperCase('es-PE')}</strong>
        <small>{venta?.sala || 'Sin sala'}</small>
      </div>
      <label className="va-label" htmlFor="va-buscar">Buscar trabajador</label>
      <div className="va-search-row">
        <input id="va-buscar" className="va-search" value={busqueda} onChange={event=>setBusqueda(event.target.value)} placeholder="Escribir nombre o sala..." />
        <button type="button" onClick={()=>document.getElementById('va-asesor')?.focus()}>Buscar</button>
      </div>
      <label className="va-label" htmlFor="va-asesor">Nuevo asesor</label>
      <select id="va-asesor" className="va-select" value={asesorId} onChange={event => { setAsesorId(event.target.value); setError('') }}>
        <option value="">Seleccionar asesor de destino</option>
        {opcionesFiltradas.map(asesor => <option key={asesor.id} value={asesor.id}>{String(asesor.nombre || '').toLocaleUpperCase('es-PE')} · {String(asesor.sala || 'Sin sala').toLocaleUpperCase('es-PE')}</option>)}
      </select>
      {busqueda && !opcionesFiltradas.length && <div className="va-alert">No se encontraron trabajadores con esa búsqueda.</div>}
      <p className="va-help">{alcance === 'sala' ? 'Solo se muestran asesores activos de tu sala.' : 'Puedes elegir un asesor activo de cualquier sala.'}</p>
      {!opciones.length && <div className="va-alert">No hay otro asesor activo disponible para esta venta.</div>}
      <div className="va-divider" />
      <label className="va-label" htmlFor="va-sala">Sala atribuida para reportes</label>
      <select id="va-sala" className="va-select" value={salaAtribuida} onChange={event => { setSalaAtribuida(event.target.value); setError('') }}>
        <option value="">Usar sala actual del asesor</option>
        {salasOpciones.map(sala => <option key={sala} value={sala}>{sala.toLocaleUpperCase('es-PE')}</option>)}
      </select>
      <p className="va-help">Usa este campo cuando la venta debe contar para una sala específica aunque el asesor haya vuelto a otra sala.</p>
      {error && <div className="va-alert error">{error}</div>}
    </ModalBase>
  )
}

function etiquetaCargo(cargo) {
  const etiquetas = {
    asesor: 'Asesor',
    supervisor: 'Supervisor',
    backoffice: 'Back Data',
    validacion: 'Validación',
    grabaciones: 'Grabaciones',
    supgrabaciones: 'Supervisión de grabaciones',
    supcalidad: 'Supervisión de calidad',
    programacion: 'Programación',
    seguimiento: 'Seguimiento',
    jefatura: 'Jefatura',
    usuarios: 'Gestión de usuarios',
  }
  return etiquetas[String(cargo || '').toLowerCase()] || cargo || 'Sistema'
}

function claseEvento(tipo) {
  const valor = String(tipo || '').toLowerCase()
  if (valor === 'creacion') return 'creation'
  if (valor === 'reasignacion') return 'assignment'
  if (valor === 'archivo') return 'file'
  return 'update'
}

export function HistorialVentaModal({ venta, onClose }) {
  const [estado, setEstado] = useState({ cargando: true, error: '', data: [] })

  useEffect(() => {
    let activo = true
    fetch(`${API}/ventas/${venta.id}/historial`, { headers: ncHeaders() })
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el historial.')
        if (activo) setEstado({ cargando: false, error: '', data: Array.isArray(data.data) ? data.data : [] })
      })
      .catch(error => { if (activo) setEstado({ cargando: false, error: error.message, data: [] }) })
    return () => { activo = false }
  }, [venta.id])

  return (
    <ModalBase title="Historial completo de la venta" subtitle={`${venta?.nombre || 'Cliente'} · DNI ${venta?.dni || '—'}`} onClose={onClose} footer={<button type="button" className="va-button primary" onClick={onClose}>Cerrar</button>}>
      <div className="va-audit-intro">
        <span>Auditoría de la venta</span>
        <p>Incluye la creación de la venta y el historial real de Validación y Super Grabaciones. Grabaciones, Programación, Seguimiento y reasignaciones aún no guardan historial detallado — solo su último estado.</p>
      </div>
      {estado.cargando && <div className="va-empty">Cargando historial completo...</div>}
      {estado.error && <div className="va-alert error">{estado.error}</div>}
      {!estado.cargando && !estado.error && !estado.data.length && <div className="va-empty"><strong>Sin movimientos registrados</strong><span>Los próximos cambios de la venta aparecerán aquí.</span></div>}
      {!!estado.data.length && <ol className="va-audit">
        {estado.data.map((item, index) => <li key={`${item.id}-${index}`} className={claseEvento(item.tipo)}>
          <span className="va-audit-marker" aria-hidden="true" />
          <div className="va-audit-card">
            <div className="va-audit-top">
              <span className="va-module">{item.modulo || etiquetaCargo(item.usuario_cargo)}</span>
              <time>{textoFecha(item.created_at)}</time>
            </div>
            <strong className="va-audit-title">{item.etiqueta || 'Actualización de la venta'}</strong>
            {(item.valor_anterior !== null || item.valor_nuevo !== null) && (
              <div className="va-change">
                {item.valor_anterior !== null && <span className="before">{item.valor_anterior || 'Sin dato'}</span>}
                {item.valor_anterior !== null && item.valor_nuevo !== null && <b>→</b>}
                {item.valor_nuevo !== null && <span className="after">{item.valor_nuevo || 'Sin dato'}</span>}
              </div>
            )}
            {item.descripcion && <p>{item.descripcion}</p>}
            <small>
              Realizado por <b>{item.usuario_nombre || 'Sistema'}</b>
              {' · '}{etiquetaCargo(item.usuario_cargo)}
              {item.usuario_sala ? ` · ${item.usuario_sala}` : ''}
            </small>
          </div>
        </li>)}
      </ol>}
    </ModalBase>
  )
}
