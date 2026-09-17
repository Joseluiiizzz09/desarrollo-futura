import { useState } from 'react'
import { API, ncHeaders } from '../services/api'

// Mismas opciones y mismo contrato que usa Programacion.jsx (ESTADO_BTNS +
// guardarCambios) contra PATCH /ventas/:id?area=programacion — se reutiliza
// tal cual para que Jefatura pueda corregir la tipificación sin duplicar
// la lógica de negocio en dos lugares distintos.
const ESTADOS_PROGRAMACION_OPCIONES = [
  { id: 'PROGRAMADO',        label: 'Programado' },
  { id: 'RECHAZADO',         label: 'Rechazado' },
  { id: 'BLOQUEADO',         label: 'Bloqueado' },
  { id: 'SIN_AGENDA',        label: 'Sin agenda' },
  { id: 'CARACTER_ESPECIAL', label: 'Carácter especial' },
  { id: 'FRAUDE',            label: 'Fraude' },
  { id: 'ZONA_RESTRINGIDA',  label: 'Zona restringida' },
]

export function VentaProgramarModal({ venta, onClose, onSuccess }) {
  const [estadoNuevo, setEstadoNuevo] = useState('')
  const [obs, setObs]         = useState('')
  const [sot, setSot]         = useState(venta?.sot || '')
  const [fecha, setFecha]     = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')

  async function guardar() {
    if (guardando) return
    if (!estadoNuevo) { setError('Selecciona el nuevo estado de programación.'); return }
    if (estadoNuevo === 'PROGRAMADO' && (!sot.trim() || !fecha)) {
      setError('Para marcar como PROGRAMADO debe ingresar el SOT y la fecha programada.')
      return
    }
    setGuardando(true)
    setError('')
    const esRechazo = estadoNuevo === 'RECHAZADO'
    const payload = esRechazo
      ? {
          ...(['VALIDADO','APROBADO','PROGRAMADO','PENDIENTE','BLOQUEADO','SIN_AGENDA','CARACTER_ESPECIAL'].includes((venta.estado || '').toUpperCase())
            ? { estado: 'VALIDADO' } : {}),
          estado_grab: 'grabado',
          estado_supgrab: 'sin_revisar',
          obs_programacion: obs,
        }
      : {
          estado: estadoNuevo,
          obs_programacion: obs,
          ...(estadoNuevo === 'PROGRAMADO'
            ? { sot: sot.trim(), fecha_programada: fecha, estado_supgrab: 'programado', estado_grab: 'grabado' }
            : {}),
        }
    try {
      const res = await fetch(`${API}/ventas/${venta.id}?area=programacion`, {
        method: 'PATCH', headers: ncHeaders(), body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo actualizar la programación.')
      onSuccess?.(data)
      onClose?.()
    } catch (err) {
      setError(err.message || 'Error al conectar con el servidor.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="va-overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div
        className="va-modal"
        style={{ width: 'min(480px,100%)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Editar tipificación de programación"
      >
        <header className="va-header">
          <div>
            <h3>Tipificación de programación</h3>
            <p>{venta?.nombre || 'Cliente'} · DNI {venta?.dni || '—'}</p>
          </div>
          <button type="button" className="va-close" onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        <div className="va-body">
          <div className="va-current">
            <span>Estado actual</span>
            <strong>{venta?.estado_prog || 'PENDIENTE'}</strong>
            {venta?.usuario_prog && <small>Por: {venta.usuario_prog}</small>}
          </div>

          <label className="va-label">Nuevo estado</label>
          <select className="va-select" value={estadoNuevo} onChange={e => { setEstadoNuevo(e.target.value); setError('') }}>
            <option value="">— Selecciona —</option>
            {ESTADOS_PROGRAMACION_OPCIONES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>

          {estadoNuevo === 'PROGRAMADO' && (
            <>
              <label className="va-label" style={{ marginTop: 14 }}>SOT</label>
              <input className="va-select" type="text" maxLength={100} value={sot} onChange={e => { setSot(e.target.value); setError('') }} placeholder="Ingrese SOT" />
              <label className="va-label" style={{ marginTop: 14 }}>Fecha programada</label>
              <input className="va-select" type="date" value={fecha} onChange={e => { setFecha(e.target.value); setError('') }} />
            </>
          )}

          <label className="va-label" style={{ marginTop: 14 }}>Observación de programación</label>
          <textarea
            className="va-select"
            style={{ height: 80, padding: 10, resize: 'vertical', fontFamily: 'inherit' }}
            value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="Observaciones sobre la instalación…"
          />

          {error && <div className="va-alert error">{error}</div>}
        </div>

        <div className="va-footer">
          <button type="button" className="va-button secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className="va-button primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      </div>
    </div>
  )
}
