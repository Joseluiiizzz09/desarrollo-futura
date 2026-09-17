import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

function formatFechaDDMMYYYY(f) {
  if (!f) return ''
  const p = f.split('-')
  return `${p[2]}/${p[1]}/${p[0]}`
}

// Selector de rango de fechas en un solo control — un calendario donde se
// elige inicio y fin (primer clic = desde, segundo clic = hasta), en vez de
// dos campos separados.
export default function RangoFechasPicker({ desde, hasta, onChange }) {
  const [open, setOpen] = useState(false)
  const [mesVista, setMesVista] = useState(() => {
    const base = desde ? new Date(desde+'T00:00:00') : new Date()
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })
  const [pos, setPos] = useState({ top:0, left:0 })
  const btnRef = useRef(null)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function cerrar(e) {
      if (boxRef.current && !boxRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [open])

  function abrir() {
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top:r.bottom+4, left:r.left })
    setOpen(v=>!v)
  }

  function fmtISO(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

  function clickDia(iso) {
    if (!desde || (desde && hasta)) onChange({ desde:iso, hasta:'' })
    else if (iso < desde) onChange({ desde:iso, hasta:'' })
    else { onChange({ desde, hasta:iso }); setOpen(false) }
  }

  const diasEnMes = new Date(mesVista.getFullYear(), mesVista.getMonth()+1, 0).getDate()
  const offsetSemana = (new Date(mesVista.getFullYear(), mesVista.getMonth(), 1).getDay()+6)%7
  const celdas = []
  for (let i=0;i<offsetSemana;i++) celdas.push(null)
  for (let d=1; d<=diasEnMes; d++) celdas.push(new Date(mesVista.getFullYear(), mesVista.getMonth(), d))

  const resumen = desde && hasta ? `${formatFechaDDMMYYYY(desde)} – ${formatFechaDDMMYYYY(hasta)}` : desde ? `${formatFechaDDMMYYYY(desde)} – …` : 'Seleccionar rango'

  return (
    <>
      <button ref={btnRef} type="button" className="form-control" style={{textAlign:'left',cursor:'pointer',background:'#fff',width:'100%'}} onClick={abrir}>
        {resumen}
      </button>
      {open && createPortal(
        <div ref={boxRef} style={{position:'fixed',top:pos.top,left:pos.left,zIndex:10000,background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,boxShadow:'0 12px 32px rgba(15,23,42,.2)',padding:12,width:250,color:'#111827'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <button type="button" onClick={()=>setMesVista(m=>new Date(m.getFullYear(),m.getMonth()-1,1))} style={{border:'none',background:'none',cursor:'pointer',fontSize:14}}>‹</button>
            <strong style={{fontSize:12,textTransform:'capitalize'}}>{mesVista.toLocaleDateString('es-PE',{month:'long',year:'numeric'})}</strong>
            <button type="button" onClick={()=>setMesVista(m=>new Date(m.getFullYear(),m.getMonth()+1,1))} style={{border:'none',background:'none',cursor:'pointer',fontSize:14}}>›</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,fontSize:10,color:'#9ca3af',marginBottom:4,textAlign:'center'}}>
            {['L','M','X','J','V','S','D'].map(d=><span key={d}>{d}</span>)}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}}>
            {celdas.map((dia,i) => {
              if (!dia) return <span key={i} />
              const iso = fmtISO(dia)
              const enRango = desde && hasta && iso >= desde && iso <= hasta
              const esExtremo = iso === desde || iso === hasta
              return (
                <button key={i} type="button" onClick={()=>clickDia(iso)}
                  style={{border:'none',background:esExtremo?'#dc2626':enRango?'#fee2e2':'transparent',color:esExtremo?'#fff':'#111827',borderRadius:6,padding:'5px 0',fontSize:11,cursor:'pointer'}}>
                  {dia.getDate()}
                </button>
              )
            })}
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
            <button type="button" onClick={()=>{onChange({desde:'',hasta:''}); setOpen(false)}} style={{fontSize:11,color:'#6b7280',border:'none',background:'none',cursor:'pointer'}}>Limpiar</button>
            <button type="button" onClick={()=>{const d=new Date(); const hoy = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; onChange({desde:hoy,hasta:hoy}); setOpen(false)}} style={{fontSize:11,color:'#dc2626',border:'none',background:'none',cursor:'pointer',fontWeight:700}}>Hoy</button>
          </div>
        </div>, document.body)}
    </>
  )
}
