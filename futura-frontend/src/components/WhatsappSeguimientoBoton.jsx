import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const PLANTILLAS = [
  { id: 'seguimiento_agosto',                 label: 'SEGUIMIENTO' },
  { id: 'seguimiento_del_tecnico',             label: 'SEGUIMIENTO TECNICO' },
  { id: 'instalacin_no_concretada__rechazada', label: 'INST RECHAZADA' },
]

// Botón de WhatsApp de Seguimiento: al hacer click despliega un menú flotante
// (mismo patrón de portal que AsesorBuscador/FiltroEncabezado en Backoffice.jsx)
// con las 3 plantillas aprobadas en Meta para la cuenta SEGUIMIENTO. Marca en
// verde y con check cuál fue la última plantilla enviada.
export default function WhatsappSeguimientoBoton({ enviando, waFecha, waPlantilla, onEnviar }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    function cerrarFuera(e) {
      if (boxRef.current && !boxRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false)
    }
    function cerrarEscape(e) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', cerrarFuera)
    window.addEventListener('keydown', cerrarEscape)
    return () => {
      document.removeEventListener('mousedown', cerrarFuera)
      window.removeEventListener('keydown', cerrarEscape)
    }
  }, [open])

  function abrir() {
    if (enviando) return
    const r = btnRef.current.getBoundingClientRect()
    const width = 180
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) })
    setOpen(v => !v)
  }

  function elegir(id) {
    setOpen(false)
    onEnviar(id)
  }

  const enviado = !!waFecha
  const labelPlantilla = PLANTILLAS.find(p => p.id === waPlantilla)?.label || waPlantilla
  const title = enviado
    ? `Ya se envió "${labelPlantilla}" (${new Date(waFecha).toLocaleString('es-PE')}) — elegir para reenviar`
    : 'Enviar mensaje de WhatsApp de seguimiento'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`btn-acc btn-acc-wa${enviado ? ' btn-acc-wa-enviado' : ''}`}
        onClick={abrir}
        disabled={enviando}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {enviando ? (
          <span className="btn-acc-wa-spin" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
          </svg>
        )}
      </button>
      {open && createPortal(
        <div ref={boxRef} role="menu" className="wa-menu-dropdown" style={{ position: 'fixed', top: pos.top, left: pos.left }}>
          {PLANTILLAS.map(p => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              className={`wa-menu-item${waPlantilla === p.id ? ' wa-menu-item-activo' : ''}`}
              onClick={() => elegir(p.id)}
            >
              <span>{p.label}</span>
              {waPlantilla === p.id && <span className="wa-menu-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}
