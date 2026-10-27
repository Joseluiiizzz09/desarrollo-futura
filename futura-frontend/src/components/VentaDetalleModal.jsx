import { useEffect } from 'react'
import { createPortal } from 'react-dom'

// Modal de solo lectura con todos los datos que el asesor registró en la
// venta (equivalente al "Datos completos de la venta" de WIN/Grupo Futura,
// con los campos de una venta Claro).
function valor(v) {
  const t = String(v ?? '').trim()
  return t || '—'
}

function fechaHora(v) {
  if (!v) return '—'
  const [f, h] = String(v).replace('T', ' ').split(' ')
  const p = (f || '').split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}${h ? ' ' + h.slice(0, 5) : ''}` : valor(v)
}

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(15,23,42,.45)', backdropFilter:'blur(3px)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  box: { background:'#fff', borderRadius:18, width:'min(520px, 100%)', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 60px rgba(15,23,42,.25)' },
  head: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'22px 24px 14px', borderBottom:'1px solid #eef0f3' },
  title: { margin:0, fontSize:16, fontWeight:800, color:'#111827' },
  sub: { margin:'4px 0 0', fontSize:12, color:'#9ca3af' },
  close: { border:'1px solid #d1d5db', background:'#fff', borderRadius:6, width:26, height:26, cursor:'pointer', fontSize:14, lineHeight:1 },
  body: { padding:'6px 24px 22px', overflowY:'auto' },
  sec: { fontSize:12, fontWeight:800, color:'#111827', letterSpacing:'.4px', textTransform:'uppercase', margin:'18px 0 10px' },
  grid: { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(190px, 1fr))', gap:8 },
  campo: { background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:10, padding:'9px 12px', minWidth:0 },
  lbl: { fontSize:9.5, fontWeight:700, color:'#9ca3af', letterSpacing:'.4px', textTransform:'uppercase', marginBottom:3 },
  val: { fontSize:13, fontWeight:700, color:'#111827', wordBreak:'break-word', whiteSpace:'pre-wrap' },
}

function Campo({ label, children, ancho }) {
  return (
    <div style={{ ...S.campo, ...(ancho ? { gridColumn:'1 / -1' } : null) }}>
      <div style={S.lbl}>{label}</div>
      <div style={S.val}>{children}</div>
    </div>
  )
}

export default function VentaDetalleModal({ venta, onClose }) {
  useEffect(() => {
    if (!venta) return undefined
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [venta, onClose])

  if (!venta) return null
  const v = venta

  return createPortal(
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div style={S.box} role="dialog" aria-modal="true" aria-label="Datos completos de la venta">
        <div style={S.head}>
          <div>
            <h3 style={S.title}>Datos completos de la venta</h3>
            <p style={S.sub}>Información registrada por el asesor</p>
          </div>
          <button type="button" style={S.close} onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div style={S.body}>
          <div style={S.sec}>Cliente</div>
          <div style={S.grid}>
            <Campo label="Nombres y apellidos" ancho>{valor(v.nombre)}</Campo>
            <Campo label="Tipo de documento">{valor(v.tipo_doc || 'DNI')}</Campo>
            <Campo label="Número de documento">{valor(v.dni)}</Campo>
            <Campo label="Correo electrónico">{valor(v.email)}</Campo>
            <Campo label="Teléfono de contacto">{valor(v.telefono1)}</Campo>
            <Campo label="Teléfono de referencia">{valor(v.telefono2)}</Campo>
            <Campo label="Nombre del padre">{valor(v.padre)}</Campo>
            <Campo label="Nombre de la madre">{valor(v.madre)}</Campo>
          </div>

          <div style={S.sec}>Ubicación</div>
          <div style={S.grid}>
            <Campo label="Departamento">{valor(v.departamento)}</Campo>
            <Campo label="Provincia">{valor(v.provincia)}</Campo>
            <Campo label="Distrito">{valor(v.distrito)}</Campo>
            <Campo label="Coordenadas">{valor(v.coordenadas)}</Campo>
            <Campo label="Dirección" ancho>{valor(v.direccion)}</Campo>
            <Campo label="Plano" ancho>{valor(v.plano)}</Campo>
          </div>

          <div style={S.sec}>Servicio contratado</div>
          <div style={S.grid}>
            <Campo label="Paquete" ancho>{valor(v.paquete)}</Campo>
            <Campo label="Claro Hogar">{valor(v.claro_hogar)}</Campo>
            <Campo label="Tecnología">{valor(v.tecnologia)}</Campo>
            <Campo label="Full Claro">{valor(v.full_claro)}</Campo>
            <Campo label="Cuota de instalación">{valor(v.cuota_inst)}</Campo>
            <Campo label="Cantidad de decos">{valor(v.cant_decos ?? 0)}</Campo>
            <Campo label="Cantidad de mesh">{valor(v.cant_mesh ?? 0)}</Campo>
          </div>

          <div style={S.sec}>Venta</div>
          <div style={S.grid}>
            <Campo label="Asesor">{valor(v.asesor_nombre)}</Campo>
            <Campo label="Sala">{valor(v.sala)}</Campo>
            <Campo label="Canal">{valor(v.canal)}</Campo>
            <Campo label="Fecha de ingreso">{fechaHora(v.created_at)}</Campo>
            <Campo label="Observación" ancho>{valor(v.observacion)}</Campo>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
