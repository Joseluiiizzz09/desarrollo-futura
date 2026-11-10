import { useState } from 'react'

// Badge de estado con un lápiz al lado: al presionarlo se despliega un
// selector para cambiar el estado sin salir de la tabla.
export default function EstadoEditableCell({ children, opciones, actual, onGuardar, bloqueado = '', titulo = 'Cambiar estado' }) {
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)

  async function elegir(valor) {
    if (!valor || valor === actual) { setAbierto(false); return }
    setGuardando(true)
    try { await onGuardar(valor) } finally { setGuardando(false); setAbierto(false) }
  }

  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
      {abierto ? (
        <select autoFocus disabled={guardando} defaultValue={actual || ''}
          onChange={e => elegir(e.target.value)} onBlur={() => !guardando && setAbierto(false)}
          onKeyDown={e => { if (e.key === 'Escape') setAbierto(false) }}
          style={{ fontSize:11, fontWeight:700, padding:'4px 6px', borderRadius:8, border:'1.5px solid #0086E0', background:'#fff', color:'#111827', maxWidth:170 }}>
          {!opciones.some(o => o.id === actual) && <option value={actual || ''} disabled>— Selecciona —</option>}
          {opciones.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      ) : children}
      <button type="button" disabled={Boolean(bloqueado) || guardando}
        title={bloqueado || titulo} aria-label={titulo}
        onClick={() => setAbierto(a => !a)}
        style={{ border:'1px solid #dbe2ea', background:'#fff', borderRadius:6, width:24, height:24, padding:0, display:'inline-flex', alignItems:'center', justifyContent:'center', cursor: bloqueado ? 'not-allowed' : 'pointer', opacity: bloqueado ? .4 : 1, flex:'0 0 auto' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    </div>
  )
}
