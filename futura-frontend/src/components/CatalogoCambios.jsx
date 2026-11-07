import { useState } from 'react'
import { API, ncHeaders } from '../services/api'

// Botón "Ver cambios" + ventana con el historial del catálogo (Paquetes o
// Campañas): quién agregó, editó, activó/desactivó, movió o eliminó, y cuándo.
const COLOR_ACCION = {
  'AGREGÓ':     ['#dcfce7', '#166534'],
  'EDITÓ':      ['#dbeafe', '#1e40af'],
  'ELIMINÓ':    ['#fee2e2', '#991b1b'],
  'ACTIVÓ':     ['#ecfccb', '#3f6212'],
  'DESACTIVÓ':  ['#f3f4f6', '#374151'],
  'MOVIÓ':      ['#fef3c7', '#92400e'],
}

function fechaCorta(f) {
  const m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : f
}

export default function CatalogoCambios({ catalogo, titulo }) {
  const [abierto, setAbierto] = useState(false)
  const [filas, setFilas] = useState(null)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')

  async function abrir() {
    setAbierto(true); setFilas(null); setError('')
    try {
      const res = await fetch(`${API}/${catalogo}/cambios`, { headers: ncHeaders() })
      const d = await res.json()
      if (!d.ok) throw new Error(d.mensaje)
      setFilas(d.data || [])
    } catch (e) { setError(e.message || 'No se pudo cargar el historial') }
  }

  const b = buscar.trim().toLowerCase()
  const visibles = (filas || []).filter(r => !b || [r.accion, r.grupo, r.detalle, r.usuario_nombre].join(' ').toLowerCase().includes(b))

  return (
    <>
      <button type="button" onClick={abrir}
        style={{ padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          border: '1px solid #e5e7eb', background: '#fff', color: '#374151' }}>
        Ver cambios
      </button>

      {abierto && (
        <div onClick={e => { if (e.target === e.currentTarget) setAbierto(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 'min(760px, 100%)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '18px 22px 12px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{titulo}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>Quién agregó, editó o eliminó, y cuándo (últimos 300 cambios)</div>
              <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por usuario, paquete o acción…"
                style={{ marginTop: 12, width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, fontFamily: 'inherit' }} />
            </div>
            <div style={{ overflowY: 'auto', padding: '6px 22px' }}>
              {error ? <div style={{ padding: 24, color: '#b91c1c', fontSize: 13 }}>{error}</div>
                : !filas ? <div style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>Cargando…</div>
                : !visibles.length ? <div style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>{filas.length ? 'Sin resultados.' : 'Todavía no hay cambios registrados.'}</div>
                : visibles.map(r => {
                    const [bg, fg] = COLOR_ACCION[r.accion] || ['#f3f4f6', '#374151']
                    return (
                      <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 0', borderBottom: '1px solid #f3f4f6' }}>
                        <span style={{ background: bg, color: fg, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 800, letterSpacing: .3, flexShrink: 0, minWidth: 70, textAlign: 'center' }}>{r.accion}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, color: '#111827', fontWeight: 600, wordBreak: 'break-word' }}>{r.detalle}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{r.grupo ? `${r.grupo} · ` : ''}{r.usuario_nombre || '—'} · {fechaCorta(r.fecha)}</div>
                        </div>
                      </div>
                    )
                  })}
            </div>
            <div style={{ padding: '12px 22px 18px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9' }}>
              <button type="button" onClick={() => setAbierto(false)}
                style={{ padding: '9px 20px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
