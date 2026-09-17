import { useState } from 'react'
import { API, ncHeaders } from '../services/api'

function campo(label, children) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '10px', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = {
  height: '36px', padding: '0 10px',
  border: '1px solid #cbd5e1', borderRadius: '8px',
  background: '#fff', color: '#111827',
  font: 'inherit', fontSize: '13px', outline: 'none',
}

export function VentaEditarModal({ venta, onClose, onSuccess }) {
  const [form, setForm] = useState({
    nombre:          venta?.nombre          || '',
    tipoDoc:         venta?.tipo_doc        || venta?.tipoDoc || 'DNI',
    dni:             venta?.dni             || '',
    email:           venta?.email           || '',
    telefono1:       venta?.telefono1       || '',
    telefono2:       venta?.telefono2       || '',
    departamento:    venta?.departamento    || '',
    provincia:       venta?.provincia       || '',
    distrito:        venta?.distrito        || '',
    direccion:       venta?.direccion       || '',
    coordenadas:     venta?.coordenadas     || '',
    paquete:         venta?.paquete         || '',
    canal:           venta?.canal           || '',
    cuotaInstalacion:venta?.cuota_inst      || venta?.cuotaInstalacion || '',
    hogar:           venta?.claro_hogar     || venta?.hogar  || '',
    tec:             venta?.tecnologia      || venta?.tec    || '',
    full:            venta?.full_claro      || venta?.full   || '',
    plano:           venta?.plano           || '',
    fechaNac:        venta?.fecha_nac       || venta?.fechaNac || '',
    lugarNac:        venta?.lugar_nac       || venta?.lugarNac || '',
    padre:           venta?.padre           || '',
    madre:           venta?.madre           || '',
    cantDecos:       String(venta?.cant_decos ?? venta?.cantDecos ?? '0'),
    cantMesh:        String(venta?.cant_mesh  ?? venta?.cantMesh  ?? '0'),
    observacion:     venta?.observacion     || '',
  })
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function guardar() {
    if (guardando) return
    setGuardando(true)
    setError('')
    try {
      const res = await fetch(`${API}/ventas/${venta.id}/datos`, {
        method: 'PATCH',
        headers: ncHeaders(),
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudieron guardar los cambios.')
      onSuccess?.(data)
      onClose?.()
    } catch (err) {
      setError(err.message || 'Error al conectar con el servidor.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div
      className="va-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div
        className="va-modal"
        style={{ width: 'min(700px,100%)', maxHeight: 'min(88vh,820px)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Editar venta"
      >
        <header className="va-header">
          <div>
            <h3>Editar datos de la venta</h3>
            <p>{venta?.nombre || 'Cliente'} · DNI {venta?.dni || '—'}</p>
          </div>
          <button type="button" className="va-close" onClick={onClose} aria-label="Cerrar">×</button>
        </header>

        <div className="va-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>

          {campo('Nombre completo',
            <input style={inputStyle} value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre y apellidos" />
          )}
          {campo('Tipo doc.',
            <select style={{ ...inputStyle }} value={form.tipoDoc} onChange={e => set('tipoDoc', e.target.value)}>
              <option value="DNI">DNI</option>
              <option value="CE">CE</option>
              <option value="PAS">PAS</option>
            </select>
          )}
          {campo('N° documento',
            <input style={inputStyle} value={form.dni} onChange={e => set('dni', e.target.value)} placeholder="Número de documento" />
          )}
          {campo('Correo electrónico',
            <input style={inputStyle} value={form.email} onChange={e => set('email', e.target.value)} placeholder="correo@ejemplo.com" />
          )}
          {campo('Teléfono principal',
            <input style={inputStyle} value={form.telefono1} onChange={e => set('telefono1', e.target.value)} placeholder="9XXXXXXXX" />
          )}
          {campo('Teléfono secundario',
            <input style={inputStyle} value={form.telefono2} onChange={e => set('telefono2', e.target.value)} placeholder="Opcional" />
          )}
          {campo('Departamento',
            <input style={inputStyle} value={form.departamento} onChange={e => set('departamento', e.target.value)} />
          )}
          {campo('Provincia',
            <input style={inputStyle} value={form.provincia} onChange={e => set('provincia', e.target.value)} />
          )}
          {campo('Distrito',
            <input style={inputStyle} value={form.distrito} onChange={e => set('distrito', e.target.value)} />
          )}
          {campo('Dirección',
            <input style={inputStyle} value={form.direccion} onChange={e => set('direccion', e.target.value)} />
          )}
          {campo('Coordenadas',
            <input style={inputStyle} value={form.coordenadas} onChange={e => set('coordenadas', e.target.value)} placeholder="-12.0464, -77.0428" />
          )}
          {campo('Paquete',
            <input style={inputStyle} value={form.paquete} onChange={e => set('paquete', e.target.value)} />
          )}
          {campo('Canal',
            <select style={{ ...inputStyle }} value={form.canal} onChange={e => set('canal', e.target.value)}>
              <option value="">— Sin canal —</option>
              <option value="NETCONTACT">NETCONTACT</option>
              <option value="KELS">KELS</option>
            </select>
          )}
          {campo('Cuota instalación',
            <input style={inputStyle} value={form.cuotaInstalacion} onChange={e => set('cuotaInstalacion', e.target.value)} />
          )}
          {campo('Claro Hogar',
            <input style={inputStyle} value={form.hogar} onChange={e => set('hogar', e.target.value)} />
          )}
          {campo('Tecnología',
            <input style={inputStyle} value={form.tec} onChange={e => set('tec', e.target.value)} />
          )}
          {campo('Full Claro',
            <input style={inputStyle} value={form.full} onChange={e => set('full', e.target.value)} />
          )}
          {campo('Decos',
            <input style={inputStyle} type="number" min="0" value={form.cantDecos} onChange={e => set('cantDecos', e.target.value)} />
          )}
          {campo('Mesh',
            <input style={inputStyle} type="number" min="0" value={form.cantMesh} onChange={e => set('cantMesh', e.target.value)} />
          )}
          {campo('Plano',
            <input style={inputStyle} value={form.plano} onChange={e => set('plano', e.target.value)} />
          )}
          {campo('Fecha de nacimiento',
            <input style={inputStyle} type="date" value={form.fechaNac} onChange={e => set('fechaNac', e.target.value)} />
          )}
          {campo('Lugar de nacimiento',
            <input style={inputStyle} value={form.lugarNac} onChange={e => set('lugarNac', e.target.value)} />
          )}
          {campo('Nombre del padre',
            <input style={inputStyle} value={form.padre} onChange={e => set('padre', e.target.value)} />
          )}
          {campo('Nombre de la madre',
            <input style={inputStyle} value={form.madre} onChange={e => set('madre', e.target.value)} />
          )}
          <div style={{ gridColumn: '1/-1' }}>
            {campo('Observación general',
              <textarea
                style={{ ...inputStyle, height: 'auto', padding: '8px 10px', resize: 'vertical', fontFamily: 'inherit' }}
                rows="2"
                value={form.observacion}
                onChange={e => set('observacion', e.target.value)}
              />
            )}
          </div>
          {error && (
            <div className="va-alert error" style={{ gridColumn: '1/-1' }}>{error}</div>
          )}
        </div>

        <footer className="va-footer">
          <button type="button" className="va-button secondary" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button type="button" className="va-button primary" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </footer>
      </div>
    </div>
  )
}
