import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Celda compacta "OBS. SEGUIMIENTO" reutilizada en Asesor/Supervisor/Jefatura.
// Agrupa tramo/comentario/motivo de Seguimiento en una sola columna,
// consistente con la posición ESTADO | OBS. SEGUIMIENTO | FECHA en las 3 vistas.
export default function ObsSeguimientoCell({ tramo, comentario, motivo, expandible = false }) {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!abierto) return undefined
    const cerrarConEscape = e => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', cerrarConEscape)
    return () => window.removeEventListener('keydown', cerrarConEscape)
  }, [abierto])

  if (!tramo && !comentario && !motivo) {
    return <span style={{ color: '#9ca3af' }}>—</span>
  }

  const contenido = (
    <div style={{ fontSize: 10, lineHeight: 1.5, minWidth: 140, maxWidth: 200, textAlign:'left' }}>
      {tramo && (
        <div><span style={{ fontWeight: 700, color: '#6b7280' }}>Tramo:</span> {tramo}</div>
      )}
      {comentario && (
        <div
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={comentario}
        >
          <span style={{ fontWeight: 700, color: '#6b7280' }}>Comentario:</span> {comentario}
        </div>
      )}
      {motivo && (
        <div><span style={{ fontWeight: 700, color: '#6b7280' }}>Motivo:</span> {motivo}</div>
      )}
    </div>
  )

  if (!expandible) return contenido

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title="Presiona para ver el comentario completo"
        aria-label="Ver observación de seguimiento completa"
        style={{ display:'block', width:'100%', padding:0, border:0, background:'transparent', color:'inherit', font:'inherit', cursor:'pointer' }}
      >
        {contenido}
      </button>
      {abierto && createPortal(
        <div
          role="presentation"
          onMouseDown={e => { if (e.target === e.currentTarget) setAbierto(false) }}
          style={{ position:'fixed', inset:0, zIndex:12000, display:'grid', placeItems:'center', padding:20, background:'rgba(15,23,42,.52)', backdropFilter:'blur(2px)' }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="obs-seguimiento-titulo" style={{ width:'min(520px,100%)', maxHeight:'80vh', overflow:'auto', borderRadius:16, background:'#fff', boxShadow:'0 24px 70px rgba(15,23,42,.28)' }}>
            <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, padding:'18px 20px', borderBottom:'1px solid #e5e7eb' }}>
              <div>
                <h2 id="obs-seguimiento-titulo" style={{ margin:0, color:'#111827', fontSize:16, fontWeight:900 }}>Observación de seguimiento</h2>
                <p style={{ margin:'4px 0 0', color:'#94a3b8', fontSize:11 }}>Detalle completo registrado por Seguimiento</p>
              </div>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" style={{ width:34, height:34, flex:'0 0 auto', border:'1px solid #e5e7eb', borderRadius:9, background:'#f8fafc', color:'#64748b', fontSize:20, cursor:'pointer' }}>×</button>
            </header>
            <div style={{ display:'grid', gap:12, padding:20 }}>
              {tramo && <Detalle label="Tramo" valor={tramo} />}
              {comentario && <Detalle label="Comentario" valor={comentario} />}
              {motivo && <Detalle label="Motivo" valor={motivo} />}
            </div>
          </section>
        </div>,
        document.body
      )}
    </>
  )
}

function Detalle({ label, valor }) {
  return (
    <div style={{ padding:'13px 15px', border:'1px solid #e5e7eb', borderRadius:11, background:'#f8fafc' }}>
      <div style={{ marginBottom:6, color:'#64748b', fontSize:10, fontWeight:900, letterSpacing:.4, textTransform:'uppercase' }}>{label}</div>
      <div style={{ color:'#1f2937', fontSize:13, lineHeight:1.55, fontWeight:600, whiteSpace:'pre-wrap', overflowWrap:'anywhere' }}>{valor}</div>
    </div>
  )
}
