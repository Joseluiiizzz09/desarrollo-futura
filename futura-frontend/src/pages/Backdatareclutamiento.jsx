import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import JefaturaViewControls from '../components/JefaturaViewControls'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import { API, ncHeaders } from '../services/api'
import { responseChanged, setVisibleInterval, clearVisibleInterval } from '../utils/polling'
import { usuarioTieneCargo } from '../utils/roles'
import '../styles/Backdatareclutamiento.css'

// ── Campañas exclusivas de Back Data Reclutamiento (no la lista de Ventas) ─
const CAMPANAS_RECLUTAMIENTO = [
  { valor: 'R1',      bg: '#7c3aed', color: '#fff' },
  { valor: 'R2',      bg: '#ea580c', color: '#fff' },
  { valor: 'R3',      bg: '#ffffff', color: '#374151', borde: '#d1d5db' },
  { valor: 'R4',      bg: '#92400e', color: '#fff' },
  { valor: 'R5',      bg: '#e5e7eb', color: '#374151' },
  { valor: 'R6',      bg: '#ddd6fe', color: '#5b21b6' },
  { valor: 'CHANCAY', bg: '#0f766e', color: '#fff' },
  { valor: 'COMPU T', bg: '#1d4ed8', color: '#fff' },
  { valor: 'REFERIDO', bg: '#be123c', color: '#fff' },
]
function CampanaBadge({ valor }) {
  const info = CAMPANAS_RECLUTAMIENTO.find(c => c.valor === valor)
  if (!info) return <strong>{valor || '—'}</strong>
  return <span style={{display:'inline-block',padding:'3px 10px',borderRadius:6,background:info.bg,color:info.color,border:info.borde?`1px solid ${info.borde}`:'none',fontSize:11,fontWeight:800}}>{info.valor}</span>
}

// ── Selector de campaña — Back Data Reclutamiento solo maneja estas 7 ──────
function CampanaSelect({ value, onChange, plain }) {
  return (
    <select className={plain?undefined:'form-control'} value={value}
      onChange={e=>onChange(e.target.value)}>
      <option value="">— Selecciona —</option>
      {CAMPANAS_RECLUTAMIENTO.map(c=>(<option key={c.valor} value={c.valor}>{c.valor}</option>))}
    </select>
  )
}

// Selector de asesor con búsqueda integrada (escribe para filtrar la lista)
function AsesorBuscador({ value, asesores, disabled, onChange, title, className, placeholderText, emptyLabel }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 220 })
  const btnRef = useRef(null)
  const boxRef = useRef(null)
  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  function abrir() {
    if (disabled) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 230) })
    setQ(''); setOpen(true)
  }
  function elegir(nombre) {
    if ((nombre || '') !== (value || '')) onChange(nombre)
    setOpen(false)
  }
  const lista = asesores.filter(a => (a.nombre || '').toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} onClick={abrir} title={title}
        className={className !== undefined ? className : 'sel-asesor-tabla'}
        style={{ textAlign:'left', width:'100%', cursor: disabled?'default':'pointer', background:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {value || placeholderText || '— Asignar asesor —'}
      </button>
      {open && createPortal(
        <div ref={boxRef} style={{ position:'fixed', top:pos.top, left:pos.left, width:pos.width, zIndex:9999, background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.16)', padding:8 }}>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar asesor…"
            onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); if(lista[0]) elegir(lista[0].nombre) } else if(e.key==='Escape') setOpen(false) }}
            style={{ width:'100%', padding:'6px 8px', border:'1px solid #e5e7eb', borderRadius:7, outline:'none', fontSize:12, marginBottom:6, boxSizing:'border-box' }} />
          <div style={{ maxHeight:210, overflowY:'auto' }}>
            <div onMouseDown={e=>e.preventDefault()} onClick={()=>elegir('')} style={{ padding:'6px 8px', cursor:'pointer', fontSize:12, color:'#6b7280', borderRadius:6 }}>{emptyLabel || '— Sin asignar —'}</div>
            {lista.map(a=>(
              <div key={a.id} onMouseDown={e=>e.preventDefault()} onClick={()=>elegir(a.nombre)}
                style={{ padding:'6px 8px', cursor:'pointer', fontSize:12, borderRadius:6, fontWeight: a.nombre===value?700:400, background: a.nombre===value?'#fef2f2':'transparent' }}>
                {a.nombre}
              </div>
            ))}
            {lista.length===0 && <div style={{ padding:'6px 8px', fontSize:11, color:'#9ca3af' }}>Sin resultados</div>}
          </div>
        </div>, document.body)}
    </>
  )
}

function SearchIcon({ size=14 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
}

function SortIcon({ active, direction }) {
  const up   = active && direction === 'up'   ? '#fff' : 'rgba(255,255,255,0.32)'
  const down = active && direction === 'down' ? '#fff' : 'rgba(255,255,255,0.32)'
  return (
    <svg width="9" height="13" viewBox="0 0 9 13" fill="none" aria-hidden="true" style={{flexShrink:0,marginLeft:3}}>
      <path d="M4.5 1L1.5 5h6L4.5 1z" fill={up}/>
      <path d="M4.5 12L1.5 8h6L4.5 12z" fill={down}/>
    </svg>
  )
}

// Filtro multi-seleccion embebido en el encabezado de columna (igual que en
// Backoffice): boton que abre un checklist con buscador opcional; value/onChange
// trabajan con arrays (varias opciones a la vez), no un solo valor.
function FiltroEncabezado({ label, value, options, onChange, pending, searchable }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState({ top:0, left:0, width:220 })
  const btnRef = useRef(null)
  const boxRef = useRef(null)
  const opcionesBase = [...new Set(options.filter(Boolean))]
  const opciones = pending ? ['__pendiente__', ...opcionesBase] : opcionesBase
  const visibles = opciones.filter(op=>!q || String(op).toLowerCase().includes(q.toLowerCase()))
  const etiqueta = op => op === '__pendiente__' ? 'Pendiente' : op
  useEffect(()=>{
    if (!open) return
    function cerrar(e) {
      if (boxRef.current && !boxRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', cerrar)
    return ()=>document.removeEventListener('mousedown', cerrar)
  }, [open])
  function abrir() {
    const r = btnRef.current.getBoundingClientRect()
    const width = Math.max(r.width, searchable ? 245 : 215)
    setPos({ top:r.bottom + 4, left:Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), width })
    setQ('')
    setOpen(v=>!v)
  }
  function alternar(op) {
    onChange(value.includes(op) ? value.filter(v=>v!==op) : [...value, op])
  }
  const resumen = value.length === 0 ? label : value.length === 1 ? etiqueta(value[0]) : `${label} (${value.length})`
  return (
    <>
      <button ref={btnRef} type="button" className={`th-sort-btn${value.length?' th-sort-active':''}`}
        onClick={abrir} title={`Filtrar por ${label}`} aria-label={`Filtrar por ${label}`} aria-expanded={open}>
        {resumen} <span style={{fontSize:9}}>▼</span>
      </button>
      {open && createPortal(
        <div ref={boxRef} onKeyDown={e=>{ if(e.key==='Escape') setOpen(false) }}
          style={{position:'fixed',top:pos.top,left:pos.left,width:pos.width,zIndex:10000,background:'#fff',border:'1px solid #e5e7eb',borderRadius:10,boxShadow:'0 12px 32px rgba(15,23,42,.2)',padding:'8px 10px',color:'#111827'}}>
          {searchable && <div style={{position:'relative',marginBottom:7}}>
            <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'#64748b',display:'inline-flex',pointerEvents:'none'}}><SearchIcon size={13} /></span>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder={`Buscar ${label.toLowerCase()}…`}
              style={{width:'100%',padding:'7px 8px 7px 28px',border:'1px solid #cbd5e1',borderRadius:7,outline:'none',fontSize:12,boxSizing:'border-box'}} />
          </div>}
          <label style={{display:'flex',alignItems:'center',gap:7,padding:'6px 3px 8px',fontSize:11,fontWeight:800,borderBottom:'1px solid #e5e7eb',cursor:'pointer'}}>
            <input type="checkbox" checked={value.length===0} onChange={()=>onChange([])} /> Todos
          </label>
          <div style={{maxHeight:searchable?154:220,overflowY:'auto',scrollbarGutter:'stable',paddingTop:3}}>
            {visibles.map(op=><label key={op} style={{display:'flex',alignItems:'center',gap:7,padding:'6px 3px',fontSize:11,cursor:'pointer',whiteSpace:'normal'}}>
              <input type="checkbox" checked={value.includes(op)} onChange={()=>alternar(op)} /> {etiqueta(op)}
            </label>)}
            {visibles.length===0 && <div style={{padding:'8px 3px',fontSize:11,color:'#94a3b8'}}>Sin resultados</div>}
          </div>
        </div>, document.body)}
    </>
  )
}

// ── Utilities ────────────────────────────────────────────────────────────
const COLORES_AV = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#ef4444','#06b6d4','#ec4899']
const DOT_COLORS  = ['#185FA5','#0F6E56','#854F0B','#7C3AED','#DC2626']
const BO_SECCIONES = ['base', 'reclutados', 'carga-masiva', 'rendimiento', 'avance', 'entrevistas', 'capacitacion']

const PERU_TIME_ZONE = 'America/Lima'
const PERU_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: PERU_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const PERU_TIME_FORMATTER = new Intl.DateTimeFormat('es-PE', {
  timeZone: PERU_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function partesFechaHora(formatter) {
  return Object.fromEntries(
    formatter.formatToParts(new Date()).map(({ type, value }) => [type, value]),
  )
}

function fechaHoy() {
  const { year, month, day } = partesFechaHora(PERU_DATE_FORMATTER)
  return `${year}-${month}-${day}`
}
function horaAhora() {
  const { hour, minute } = partesFechaHora(PERU_TIME_FORMATTER)
  return `${hour}:${minute}`
}
function normalizarFecha(f) {
  if (!f) return ''
  const texto = String(f)
  const match = texto.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : texto
}
function formatFecha(f) {
  const fecha = normalizarFecha(f)
  if (!fecha) return ''
  const [y,m,d] = fecha.split('-')
  if (!y || !m || !d) return fecha
  return `${d}/${m}/${y}`
}
function colorAv(n)   { let s=0; for (const c of n) s+=c.charCodeAt(0); return COLORES_AV[s % COLORES_AV.length] }
function iniciales(n) { return n.trim().split(' ').slice(0,2).map(p=>p[0]).join('').toUpperCase() }
function tipifBadgeClass(t) {
  if (!t) return 'b-default'
  const u = t.toUpperCase()
  if (u.includes('VENTA'))       return 'b-venta'
  if (u.includes('BUZON'))       return 'b-buzon'
  if (u.includes('NO CONTESTA')) return 'b-nocontesta'
  if (u.includes('DER'))         return 'b-derivado'
  return 'b-default'
}

const TIPIF_BACK_OPTIONS = ['BUZON','NO CONTESTA','DER CHAMO','VENTA CERRADA','NO DESEA','CORTA LLAMADA','PREVENTA','EN EJECUCION','AGENDADO','NO CALIFICA','EDIFICIO NO LIBERADO']
// Value interno se conserva igual al de Backoffice comercial para heredar automáticamente
// el mismo comportamiento (bloqueo de rotación en NO TOCAR/FRAUDE); solo cambia el label visible.
const TIPIF_VEND_OPCIONES = [
  { value:'VENTA CERRADA',   label:'Acepta propuesta' },
  { value:'BUZON DE VOZ',    label:'Buzón de voz' },
  { value:'NO TOCAR',        label:'No cumple el perfil' },
  { value:'CORTA LLAMADA',   label:'Corta llamada' },
  { value:'GESTION WSP',     label:'Gestión WSP' },
  { value:'NO CONTESTA',     label:'No contesta' },
  { value:'NO INTERESADO',   label:'No interesado' },
  { value:'NO ROTAR',        label:'No rotar' },
  { value:'VOLVER A LLAMAR', label:'Volver a llamar' },
  { value:'FRAUDE',          label:'Provincia' },
]

// El archivo del sistema anterior usa las etiquetas visibles, mientras que
// la base conserva los valores internos que ya maneja el Dashboard.
function normalizarTipifVendLegacy(valor) {
  const texto = String(valor || '').trim().toUpperCase()
  const equivalencias = {
    'ACEPTA PROPUESTA':'VENTA CERRADA',
    'BUZON':'BUZON DE VOZ',
    'BUZÓN':'BUZON DE VOZ',
    'NO CUMPLE EL PERFIL':'NO TOCAR',
    'PROVINCIA':'FRAUDE',
    'SH NO ROTAR':'NO ROTAR',
  }
  return equivalencias[texto] || texto
}
// El historial guarda el valor crudo (ej. 'VENTA CERRADA'); esto lo traduce
// a la etiqueta que ve el usuario (ej. 'Acepta propuesta').
function labelTipifVend(valor) {
  const texto = String(valor || '').trim().toUpperCase()
  return TIPIF_VEND_OPCIONES.find(t => t.value === texto)?.label || valor || ''
}
const TIPIF_PROHIBIDAS_ROTACION = new Set(['VENTA CERRADA','NO TOCAR','FRAUDE','NO ROTAR'])
const LIMA_DISTRITOS = [
  'Ancón','Ate','Barranco','Breña','Carabayllo','Cercado de Lima','Chaclacayo','Chorrillos',
  'Cieneguilla','Comas','El Agustino','Independencia','Jesús María','La Molina','La Victoria',
  'Lima','Lince','Los Olivos','Lurigancho','Lurín','Magdalena del Mar','Miraflores','Pachacámac',
  'Pucusana','Pueblo Libre','Puente Piedra','Punta Hermosa','Rímac','San Bartolo','San Borja',
  'San Isidro','San Juan de Lurigancho','San Juan de Miraflores','San Luis','San Martín de Porres',
  'San Miguel','Santa Anita','Santa María del Mar','Santa Rosa','Santiago de Surco','Surquillo',
  'Villa El Salvador','Villa María del Triunfo',
]
function esLeadProhibido(reg) {
  const tipif = String(reg?._tipifVend || reg?.tipif_vend || '').trim().toUpperCase()
  return TIPIF_PROHIBIDAS_ROTACION.has(tipif)
}
const TIPIF_VEND_STYLES = {
  'VENTA CERRADA':['#d1fae5','#065f46'],'PREVENTA':['#dbeafe','#1e40af'],'AGENDADO':['#fef3c7','#78350f'],
  'NO CONTESTA':['#fed7aa','#9a3412'],'BUZON DE VOZ':['#ccfbf1','#134e4a'],'CORTA LLAMADA':['#f8fafc','#334155'],
  'EN EJECUCION':['#dcfce7','#14532d'],'SIN COBERTURA':['#ffe4e6','#881337'],'NO CALIFICA':['#fefce8','#713f12'],
  'NO DESEA':['#ffe4e6','#7f1d1d'],'CONTACTO CON TERCEROS':['#ccfbf1','#134e4a'],'EDIFICIO NO LIBERADO':['#f5f3ff','#4c1d95'],
  'DESEA MOVIL':['#f8fafc','#1e293b'],'SERVICIO ACTIVO':['#f1f5f9','#1e293b'],'CONTESTA':['#d1fae5','#065f46'],
  'NC':['#fefce8','#854d0e'],'DERIVADO':['#ede9fe','#5b21b6'],'NO TOCAR':['#fef2f2','#dc2626'],
  'GESTION WSP':['#fef9c3','#854d0e'],'NO INTERESADO':['#fdba74','#7c2d12'],'NO ROTAR':['#f1f5f9','#334155'],
  'VOLVER A LLAMAR':['#fef9c3','#713f12'],'FRAUDE':['#1f2937','#f9fafb'],
}
const BL_TIPIF_COLORS = {
  'VENTA CERRADA':'#16a34a','PREVENTA':'#2563eb','AGENDADO':'#7c3aed','NO CONTESTA':'#9ca3af',
  'CORTA LLAMADA':'#f97316','NO DESEA':'#ef4444','BUZON DE VOZ':'#6b7280','SERVICIO ACTIVO':'#0891b2',
  'SIN COBERTURA':'#dc2626','NO CALIFICA':'#d97706','NO TOCAR':'#dc2626','FRAUDE':'#991b1b',
}

function TipifVendBadge({ tipif, hora }) {
  if (!tipif) return <span className="tipif-empty">— Pendiente —</span>
  const [bg, color] = TIPIF_VEND_STYLES[tipif] || ['#f3f4f6','#374151']
  return (
    <div style={{display:'flex',flexDirection:'column',gap:2}}>
      <span style={{display:'inline-flex',padding:'3px 8px',borderRadius:6,fontSize:10,fontWeight:700,background:bg,color,whiteSpace:'nowrap'}}>{tipif}</span>
      {hora && <span style={{fontSize:9,color:'#9ca3af'}}>vendedor · {hora}</span>}
    </div>
  )
}

// Colores fuertes para el selector de Tipif. Vendedor (texto legible encima),
// mismo patrón usado en Backoffice para estiloTipifVend().
const TIPIF_VEND_FUERTE = {
  'VENTA CERRADA':   ['#dcfce7','#166534','#86efac'],
  'BUZON DE VOZ':    ['#f3e8d4','#78350f','#d6a96c'],
  'NO TOCAR':        ['#fee2e2','#980000','#fca5a5'],
  'CORTA LLAMADA':   ['#ffedd5','#c2410c','#fdba74'],
  'GESTION WSP':     ['#fef9c3','#854d0e','#fde047'],
  'NO CONTESTA':     ['#fef9c3','#854d0e','#fde047'],
  'NO INTERESADO':   ['#ffedd5','#9a3412','#fdba74'],
  'NO ROTAR':        ['#fee2e2','#980000','#fca5a5'],
  'VOLVER A LLAMAR': ['#dbeafe','#1d4ed8','#93c5fd'],
  'FRAUDE':          ['#fee2e2','#991b1b','#fca5a5'],
}
function estiloTipifVend(v) {
  const paleta = TIPIF_VEND_FUERTE[v]
  return {
    fontSize:10, padding:'3px 6px', borderRadius:6, fontFamily:'inherit', maxWidth:155, cursor:'pointer',
    border:`1px solid ${paleta?paleta[2]:'#e5e7eb'}`,
    color:paleta?paleta[1]:'inherit',
    fontWeight:paleta?800:'inherit',
    background:paleta?paleta[0]:'#fff',
  }
}

// Tipificación del resultado de la entrevista (colores enviados por el usuario)
const TIPIF_ENTREVISTA_OPCIONES = ['NO CONTESTA','DESISTE','REPROGRAMA','CORTA LLAMADA','ASISTE','EN CAMINO','FALTA']
const TIPIF_ENTREVISTA_COLORES = {
  'NO CONTESTA':   ['#fef9c3','#854d0e','#fde047'],
  'DESISTE':       ['#f1f5f9','#334155','#cbd5e1'],
  'REPROGRAMA':    ['#dbeafe','#1d4ed8','#93c5fd'],
  'CORTA LLAMADA': ['#ffedd5','#c2410c','#fdba74'],
  'ASISTE':        ['#dcfce7','#166534','#86efac'],
  'EN CAMINO':     ['#fef3c7','#92400e','#fcd34d'],
  'FALTA':         ['#fee2e2','#991b1b','#fca5a5'],
}
function estiloTipifEntrevista(v) {
  const paleta = TIPIF_ENTREVISTA_COLORES[v]
  return {
    fontSize:10, padding:'3px 6px', borderRadius:6, fontFamily:'inherit', maxWidth:145, cursor:'pointer',
    border:`1px solid ${paleta?paleta[2]:'#e5e7eb'}`,
    color:paleta?paleta[1]:'#9ca3af',
    fontWeight:paleta?800:'inherit',
    background:paleta?paleta[0]:'#fff',
  }
}

// Días de Capacitación (CAPA día 1-2, OJT día 3-5): mismas 3 tipificaciones
// que Entrevistas, se reutiliza su paleta con estiloTipifEntrevista().
const TIPIF_DIA_CAPACITACION_OPCIONES = ['DESISTE','ASISTE','FALTA']

// Mismas salas ya usadas en Jefatura.
const SALAS_CAPACITACION = ['SALA 1','SALA 2','SALA 3','SALA 4','SALA CHANCAY','SALA 5','SALA 6']

// Etiquetas legibles para el historial/trazabilidad de Capacitación.
const CAMPOS_CAPACITACION_LABELS = {
  dia1_tipif: 'Día 1', dia2_tipif: 'Día 2', dia3_tipif: 'Día 3', dia4_tipif: 'Día 4', dia5_tipif: 'Día 5',
  sala: 'Sala', tipificacion_final: 'Tipificación final', fecha_inicio_capacitador: 'Fecha de inicio (capacitador)',
  fecha_alta: 'Fecha de alta',
}

// Tipificación final, se asigna desde el día 3 (OJT) en adelante.
const TIPIF_FINAL_CAPACITACION_OPCIONES = ['ALTA','DESISTE','DESAPROBADO']
const TIPIF_FINAL_CAPACITACION_COLORES = {
  'ALTA':        ['#dcfce7','#166534','#86efac'],
  'DESISTE':     ['#f1f5f9','#334155','#cbd5e1'],
  'DESAPROBADO': ['#fee2e2','#991b1b','#fca5a5'],
}
function estiloTipifFinalCapacitacion(v) {
  const paleta = TIPIF_FINAL_CAPACITACION_COLORES[v]
  return {
    fontSize:10, padding:'3px 6px', borderRadius:6, fontFamily:'inherit', maxWidth:145, cursor:'pointer',
    border:`1px solid ${paleta?paleta[2]:'#e5e7eb'}`,
    color:paleta?paleta[1]:'#9ca3af',
    fontWeight:paleta?800:'inherit',
    background:paleta?paleta[0]:'#fff',
  }
}

function BlBadge({ tipif }) {
  const raw = (tipif || '').trim()
  const color = BL_TIPIF_COLORS[raw.toUpperCase()] || '#9ca3af'
  if (!raw) return <span style={{color:'#d1d5db',fontStyle:'italic',fontSize:11}}>Sin tipif.</span>
  return <span style={{background:`${color}22`,color,border:`1px solid ${color}44`,padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:700}}>{raw}</span>
}

function BoNavIcon({ tipo }) {
  if (tipo === 'base') return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></svg>
  )
  if (tipo === 'carga') return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 16V8m0 0-3 3m3-3 3 3"/></svg>
  )
  if (tipo === 'rendimiento') return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/></svg>
  )
  if (tipo === 'entrevistas') return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="m8.5 14 2 2 4-4"/></svg>
  )
  if (tipo === 'capacitacion') return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5"/></svg>
  )
  return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m0-5a5 5 0 0 1 6 5"/></svg>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l11-11a2.1 2.1 0 0 0-3-3L5 17l-1 3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="m14.5 7.5 3 3" fill="none" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────
export default function Backdatareclutamiento() {
  const navigate    = useNavigate()
  const { sesion, logout } = useAuth()
  const idCntRef    = useRef(1)
  const toastTimer  = useRef(null)
  const archivoInputRef = useRef(null)
  const legacyInputRef  = useRef(null)
  const fechaSistemaRef = useRef(fechaHoy())

  // ── Cargos: 'entrevistas' y 'capacitador' son roles nuevos que solo ven su
  // propio apartado — sin acceso a Base/Reclutados/Carga Masiva.
  const esBackReclutamiento = usuarioTieneCargo(sesion, 'backreclutamiento')
  const esEntrevistas = usuarioTieneCargo(sesion, 'entrevistas')
  const esCapacitador = usuarioTieneCargo(sesion, 'capacitador')
  const esSoloOperativo = !esBackReclutamiento && (esEntrevistas || esCapacitador)
  const puedeVerEntrevistas = esBackReclutamiento || esEntrevistas
  const puedeVerCapacitacion = esBackReclutamiento || esCapacitador

  // ── Section ──
  const [seccion, setSeccion] = useState(() => {
    if (esSoloOperativo) return puedeVerEntrevistas ? 'entrevistas' : 'capacitacion'
    const guardada = sessionStorage.getItem('nc_backoffice_apartado')
    return BO_SECCIONES.includes(guardada) && guardada !== 'entrevistas' && guardada !== 'capacitacion' ? guardada : 'base'
  })
  const [sidebarAbierto, setSidebarAbierto] = useState(() => sessionStorage.getItem('nc_backoffice_sidebar') !== 'cerrado')

  // ── Data ──
  const [asesores,      setAsesores]      = useState([])
  const [baseData,      setBaseData]      = useState({})
  const [reclutados,    setReclutados]    = useState([])
  const [cargandoReclutados, setCargandoReclutados] = useState(false)
  const [fechaPestanas, setFechaPestanas] = useState([fechaHoy()])
  const [fechaActiva,   setFechaActiva]   = useState(fechaHoy())

  // ── Form (agregar registro) ──
  const [form,     setForm]     = useState({ campana:'', distrito:'', n1:'', n2:'', usuarioWhatsapp:'', tipoContacto:'LLAMADA', direccion:'', coordenadas:'', obsBack:'', tipifBack:'', asesor:'' })
  const [n1Error,  setN1Error]  = useState(false)
  const [agregandoRegistro, setAgregandoRegistro] = useState(false)
  const agregandoRegistroRef = useRef(false)
  const [calPicker,   setCalPicker]   = useState('')
  const [cmCalPicker, setCmCalPicker] = useState('')

  // ── Distritos (solo Lima) ──
  const distritos = LIMA_DISTRITOS

  // ── Filtros base ──
  const [filtros, setFiltros] = useState({ tip:'', tipVend:[], asesor:[], campana:[], numero:'', verTipVend:true, global:false, desde:'', hasta:'', duplicados:false })
  const [ordenDiarioActivo, setOrdenDiarioActivo] = useState(false)
  const [tableSort, setTableSort] = useState({ col:null, dir:null })
  const [basePage, setBasePage] = useState(1)
  const [basePageSize, setBasePageSize] = useState(25)
  const [grupoAceptaVisible, setGrupoAceptaVisible] = useState(false)
  function cycleSort(col) {
    setOrdenDiarioActivo(false)
    setTableSort(prev => {
      const firstDir = { hora:'desc', rots:'asc' }[col]
      if (prev.col !== col) return { col, dir: firstDir }
      const seq = { hora:['desc','asc',null], rots:['asc','desc',null] }[col]
      const next = seq[(seq.indexOf(prev.dir) + 1) % seq.length]
      return next ? { col, dir: next } : { col: null, dir: null }
    })
  }
  // ── Historial ──
  const [histOpen, setHistOpen] = useState({})
  const [histOpenCapacitacion, setHistOpenCapacitacion] = useState({})

  // ── Rotación panel ──
  const [rotPanelOpen,  setRotPanelOpen]  = useState(false)
  const [rotAsesor,     setRotAsesor]     = useState('')
  const [rotSort,       setRotSort]       = useState({ col:null, dir:'asc' })
  const [rotCant,       setRotCant]       = useState(4)
  const [rotSel,        setRotSel]        = useState({})
  const [rotFiltroFecha,setRotFiltroFecha]= useState('')
  const [rotProgress,   setRotProgress]   = useState(0)
  const [rotResultado,  setRotResultado]  = useState([])
  const [rotRotados,    setRotRotados]    = useState(0)

  // ── Modal rotación manual ──
  const [modalRotar,    setModalRotar]    = useState({ open:false, regId:null, desc:'', asesorActual:'' })
  const [modalComentarioTipif, setModalComentarioTipif] = useState({ open:false, regId:null, comentario:'', guardando:false, error:'' })
  const [modalEditar,   setModalEditar]   = useState({ open:false, regId:null, modo:'contacto', campana:'', n1:'', n2:'', usuarioWhatsapp:'', guardando:false, error:'' })

  // ── Entrevistas (postulantes que aceptaron la propuesta) ──
  const [entrevistas,        setEntrevistas]        = useState([])
  const [cargandoEntrevistas,setCargandoEntrevistas] = useState(false)
  const [filtrosEntrevistas, setFiltrosEntrevistas]  = useState({ turnos:[], campanas:[], tipificaciones:[], desde:'', hasta:'', busqueda:'', agendadoPor:[] })
  const [entrevistasPage,    setEntrevistasPage]     = useState(1)
  const [entrevistasPageSize,setEntrevistasPageSize] = useState(25)
  const [modalEntrevista,    setModalEntrevista]      = useState({ open:false, regId:null, nombrePostulante:'', numero:'', numeroRef:'', turno:'', fechaAgendamiento:'', observacion:'', guardando:false, error:'' })

  // ── Capacitación (postulantes que asistieron a la entrevista) ──
  const [capacitaciones,        setCapacitaciones]        = useState([])
  const [cargandoCapacitaciones,setCargandoCapacitaciones] = useState(false)
  const [filtrosCapacitacion,   setFiltrosCapacitacion]    = useState({ busqueda:'', desde:'', hasta:'' })
  const [modalCapacitacion,     setModalCapacitacion]      = useState({ open:false, entrevistaId:null, nombrePostulante:'', numero:'', fechaInicio:'', guardando:false, error:'' })
  const [modalReprogramar, setModalReprogramar] = useState({ open:false, entrevistaId:null, fechaAgendamiento:'', turno:'', guardando:false, error:'' })
  const [modalAlta, setModalAlta] = useState({ open:false, capacitacionId:null, fechaAlta:'', guardando:false, error:'' })
  const [rotModalAsesor,setRotModalAsesor]= useState('')
  const [rotBusqueda,   setRotBusqueda]   = useState('')
  const [rotModalMotivo,setRotModalMotivo]= useState('')

  // ── Carga masiva ──
  const [cargaTab,     setCargaTab]     = useState(() => sessionStorage.getItem('nc_backoffice_carga_tab') || 'pegar')
  const [masivaNums,   setMasivaNums]   = useState('')
  const [masivaCamp,   setMasivaCamp]   = useState('')
  const [masivaAsesor, setMasivaAsesor] = useState('')
  const [masivaLote,   setMasivaLote]   = useState('10')
  const [masivaFilas,  setMasivaFilas]  = useState([])
  const [inclDup,      setInclDup]      = useState(false)
  const [archivoRows,  setArchivoRows]  = useState([])
  const [archivoStatus,setArchivoStatus]= useState('')
  const [archivoInfo,  setArchivoInfo]  = useState('')
  const [legacyRows,   setLegacyRows]   = useState([])
  const [legacyStatus, setLegacyStatus] = useState('')
  const [legacyInfo,   setLegacyInfo]   = useState('')
  const [legacyFecha,  setLegacyFecha]  = useState(fechaHoy())
  const [legacyUsarFecha, setLegacyUsarFecha] = useState('no')
  const [dragOver,     setDragOver]     = useState(false)
  const [legacyDragOver, setLegacyDragOver] = useState(false)

  // ── Rendimiento ──
  const [rendFiltroTipo,  setRendFiltroTipo]  = useState('mes')
  const [rendFiltroFecha, setRendFiltroFecha] = useState(fechaHoy())
  const [rendDesde,       setRendDesde]       = useState('')
  const [rendHasta,       setRendHasta]       = useState('')
  const [rendOrden,       setRendOrden]       = useState('ventas_desc')

  // ── Avance ──
  const [avanceBuscar, setAvanceBuscar] = useState('')
  const [blModal,  setBlModal]  = useState({ open:false, nombre:'', asesorId:null })
  const [blLeads,  setBlLeads]  = useState([])
  const [blFecha,  setBlFecha]  = useState(fechaHoy())
  const [blCargando, setBlCargando] = useState(false)

  // ── Toast ──
  const [toast, setToast] = useState('')

  // Mantiene el panel alineado con el calendario de Lima aunque quede abierto
  // durante el cambio de día. Conserva una fecha histórica elegida a mano.
  useEffect(() => {
    function sincronizarFechaPeru() {
      const hoy = fechaHoy()
      const fechaAnterior = fechaSistemaRef.current

      setFechaPestanas(prev => prev.includes(hoy) ? prev : [...prev, hoy].sort().reverse())

      if (hoy === fechaAnterior) return

      setFechaActiva(prev => prev === fechaAnterior ? hoy : prev)
      setLegacyFecha(prev => prev === fechaAnterior ? hoy : prev)
      setRendFiltroFecha(prev => prev === fechaAnterior ? hoy : prev)
      setBlFecha(prev => prev === fechaAnterior ? hoy : prev)
      fechaSistemaRef.current = hoy
    }

    sincronizarFechaPeru()
    const timer = setInterval(sincronizarFechaPeru, 30000)
    return () => clearInterval(timer)
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────────────
  function mostrarToast(msg) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }

  async function copiarNumero(numero) {
    const texto = String(numero || '').trim()
    if (!texto) return
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(texto)
      } else {
        const area = document.createElement('textarea')
        area.value = texto
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }
    } catch(e) {
      mostrarToast('No se pudo copiar el número')
    }
  }

  async function guardarDatosBack(id, cambios) {
    const found = findReg(id)
    if (!found) return
    const anteriores = Object.fromEntries(Object.keys(cambios).map(clave => [clave, found.reg[clave]]))
    updateReg(id, cambios)
    if (!found.reg._backendId) return
    try {
      const res = await fetch(`${API}/leads-reclutamiento/${found.reg._backendId}/datos-back`, {
        method:'PATCH', headers:ncHeaders(), body:JSON.stringify(cambios)
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'Error al guardar')
    } catch(e) {
      updateReg(id, anteriores)
      mostrarToast(e.message || 'No se pudieron guardar los datos')
    }
  }

  function findReg(id) {
    for (const f in baseData) {
      const reg = baseData[f].find(r => r.id === id)
      if (reg) return { reg, fecha: f }
    }
    return null
  }

  // Cambios locales recientes por lead (clave = _backendId estable). El polling
  // los respeta hasta que el backend los confirme o pasen 8s, evitando parpadeo.
  const pendingRef = useRef({})
  const mutGenRef = useRef(0)   // se incrementa en cada acción local; descarta respuestas de polls viejos
  function marcarPendiente(id, campos) {
    if (!campos || typeof campos !== 'object' || Array.isArray(campos)) return
    let key = null
    for (const f in baseData) { const r = (baseData[f]||[]).find(x => x.id === id); if (r) { key = r._backendId; break } }
    if (!key) return
    const prev = pendingRef.current[key]?.campos || {}
    pendingRef.current[key] = { campos: { ...prev, ...campos }, ts: Date.now() }
  }

  function updateReg(id, updater) {
    mutGenRef.current++
    if (updater && typeof updater === 'object' && !Array.isArray(updater)) marcarPendiente(id, updater)
    setBaseData(prev => {
      const next = {}
      for (const f in prev) {
        const idx = prev[f].findIndex(r => r.id === id)
        if (idx >= 0) {
          const arr = [...prev[f]]
          arr[idx] = typeof updater === 'function' ? updater(arr[idx]) : { ...arr[idx], ...updater }
          next[f] = arr
        } else {
          next[f] = prev[f]
        }
      }
      return next
    })
  }

  // ── Cargar datos ─────────────────────────────────────────────────────────
  const cargarAsesores = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/usuarios`, { headers: ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar el registro')
      // No existe un rol separado "asesor de reclutamiento": el mismo personal
      // de Back Data Reclutamiento (cargo backreclutamiento) llama a los candidatos.
      if (data.ok) setAsesores(data.data.filter(u => u.cargo === 'backreclutamiento' && u.activo).map(u => ({ id:u.id, nombre:u.nombre, usuario:u.usuario, sala:u.sala })))
    } catch(e) { console.error('Error cargando asesores:', e) }
  }, [])

  const cargandoLeadsRef = useRef(false)
  const firmaLeadsRef = useRef('')
  const cargarLeads = useCallback(async () => {
    if (cargandoLeadsRef.current) return  // evita polls solapados (respuestas fuera de orden que causan parpadeo)
    cargandoLeadsRef.current = true
    const gen = mutGenRef.current
    try {
      const res  = await fetch(`${API}/leads-reclutamiento`, { headers: ncHeaders() })
      const data = await res.json()
      if (!data.ok) return
      // Si hubo una acción local durante el fetch, esta respuesta ya es vieja: descartar.
      if (mutGenRef.current !== gen) return
      if (!responseChanged(firmaLeadsRef, data.data) && Object.keys(pendingRef.current).length === 0) return
      const nuevoBase = {}
      const nuevasFechas = []
      data.data.forEach(l => {
        const fecha = normalizarFecha(l.fecha) || fechaHoy()
        if (!nuevoBase[fecha]) nuevoBase[fecha] = []
        if (!nuevasFechas.includes(fecha)) nuevasFechas.push(fecha)
        const reg = {
          id:         idCntRef.current++,
          _backendId: l.id,
          campana:    l.campana || '—',
          distrito:   l.distrito || '—',
          n1:         l.n1,
          n2:         l.n2 || '',
          usuarioWhatsapp: l.usuario_whatsapp || '',
          creadoPor: l.creado_por_nombre || '',
          creadoEn:  l.created_at || '',
          tipo_contacto: l.tipo_contacto || 'LLAMADA',
          direccion:   l.direccion || '',
          coordenadas: l.coordenadas || '',
          obs_back:    l.obs_back || '',
          tipifBack:  l.tipif_back || '',
          asesor:     l.asesor_nombre || '',
          horaAsig:   l.hora_asig || '',
          sinAsignar: !!l.sin_asignar,
          rotaciones: l.rotaciones || 0,
          _tipifVend: l.tipif_vend || '',
          _tipifHora: l.tipif_hora || '',
          entrevistaTipif: l.entrevista_tipificacion || '',
          obsAsesor: l.obs_asesor || '',
          historial:  Array.isArray(l.historial) ? l.historial : [],
        }
        // Reconciliar con cambios locales recientes (evita parpadeo al valor viejo)
        const pend = pendingRef.current[l.id]
        if (pend) {
          const edad = Date.now() - pend.ts
          // Si la reasignación/rotación ya se confirmó en el servidor (mismo asesor),
          // libera TODO el pending para no bloquear la tipificación nueva del asesor.
          const asesorConfirmado = pend.campos.asesor !== undefined && reg.asesor === pend.campos.asesor
          if (asesorConfirmado || edad >= 8000) {
            delete pendingRef.current[l.id]
          } else {
            let quedan = 0
            for (const k in pend.campos) {
              const exp = pend.campos[k]
              if (k === 'historial' && Array.isArray(exp)) {
                const serverHist = Array.isArray(reg.historial) ? reg.historial : []
                if (serverHist.length < exp.length) { reg.historial = exp; quedan++ }
                continue
              }
              if (exp && typeof exp === 'object') continue
              if (reg[k] !== exp) { reg[k] = exp; quedan++ }
            }
            if (quedan === 0) delete pendingRef.current[l.id]
          }
        }
        nuevoBase[fecha].push(reg)
      })
      const hoy = fechaHoy()
      if (!nuevasFechas.includes(hoy)) nuevasFechas.push(hoy)
      nuevasFechas.sort().reverse()
      setBaseData(nuevoBase)
      setFechaPestanas(nuevasFechas)
      setFechaActiva(prev => nuevasFechas.includes(prev) ? prev : nuevasFechas[0])
    } catch(e) { console.error('Error cargando leads:', e) }
    finally { cargandoLeadsRef.current = false }
  }, [])

  const cargarReclutados = useCallback(async () => {
    setCargandoReclutados(true)
    try {
      const res = await fetch(`${API}/ventas-reclutamiento`, { headers: ncHeaders() })
      const data = await res.json()
      // Consolidado general: todos los postulantes captados por cualquier
      // asesor, en cualquier etapa (NUEVO, CONTACTADO, RECLUTADO, ...) — no
      // se filtra por un estado final, la columna ESTADO ya muestra la etapa.
      setReclutados(data.ok ? data.data : [])
    } catch(e) {
      console.error('Error cargando reclutados:', e)
      setReclutados([])
    } finally {
      setCargandoReclutados(false)
    }
  }, [])

  const cargarEntrevistas = useCallback(async () => {
    setCargandoEntrevistas(true)
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas`, { headers: ncHeaders() })
      const data = await res.json()
      setEntrevistas(data.ok ? data.data : [])
    } catch(e) {
      console.error('Error cargando entrevistas:', e)
      setEntrevistas([])
    } finally {
      setCargandoEntrevistas(false)
    }
  }, [])

  const cargarCapacitaciones = useCallback(async () => {
    setCargandoCapacitaciones(true)
    try {
      const res = await fetch(`${API}/leads-reclutamiento/capacitaciones`, { headers: ncHeaders() })
      const data = await res.json()
      setCapacitaciones(data.ok ? data.data : [])
    } catch(e) {
      console.error('Error cargando capacitaciones:', e)
      setCapacitaciones([])
    } finally {
      setCargandoCapacitaciones(false)
    }
  }, [])

  function actualizarEntrevistaLocal(id, cambios) {
    setEntrevistas(prev => prev.map(en => en.id === id ? { ...en, ...cambios } : en))
  }

  async function guardarTipifEntrevista(id, valor) {
    const anterior = entrevistas.find(en => en.id === id)?.tipificacion || ''
    actualizarEntrevistaLocal(id, { tipificacion: valor })
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas/${id}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ tipificacion: valor }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar la tipificación')
      if (valor === 'ASISTE') abrirModalCapacitacion(id)
      if (valor === 'REPROGRAMA') abrirModalReprogramar(id)
    } catch(e) {
      actualizarEntrevistaLocal(id, { tipificacion: anterior })
      mostrarToast(e.message || 'No se pudo guardar la tipificación')
    }
  }

  // ── Modal reprogramar (al tipificar REPROGRAMA, actualiza la fecha de agendamiento) ──
  function abrirModalReprogramar(entrevistaId) {
    const en = entrevistas.find(e => e.id === entrevistaId)
    if (!en) return
    setModalReprogramar({ open:true, entrevistaId, fechaAgendamiento:String(en.fecha_agendamiento||'').slice(0,10), turno:en.turno||'TURNO 1', guardando:false, error:'' })
  }

  async function guardarReprogramar() {
    const fechaAgendamiento = modalReprogramar.fechaAgendamiento
    const turno = modalReprogramar.turno
    if (!fechaAgendamiento) { setModalReprogramar(p=>({...p, error:'Selecciona la nueva fecha de agendamiento'})); return }
    setModalReprogramar(p=>({...p, guardando:true, error:''}))
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas/${modalReprogramar.entrevistaId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ fecha_agendamiento:fechaAgendamiento, turno }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo actualizar la fecha de agendamiento')
      actualizarEntrevistaLocal(modalReprogramar.entrevistaId, { fecha_agendamiento: fechaAgendamiento, turno })
      setModalReprogramar({ open:false, entrevistaId:null, fechaAgendamiento:'', turno:'', guardando:false, error:'' })
      mostrarToast('Entrevista reprogramada')
    } catch (e) {
      setModalReprogramar(p=>({...p, guardando:false, error:e.message || 'No se pudo actualizar la fecha de agendamiento'}))
    }
  }

  // ── Modal registrar capacitación (al tipificar ASISTE) ────────────────────
  function abrirModalCapacitacion(entrevistaId) {
    const en = entrevistas.find(e => e.id === entrevistaId)
    if (!en) return
    setModalCapacitacion({ open:true, entrevistaId, nombrePostulante:en.nombre_postulante||'', numero:en.numero||'', fechaInicio:'', guardando:false, error:'' })
  }

  async function guardarCapacitacion() {
    const nombrePostulante = modalCapacitacion.nombrePostulante.trim()
    const numero = modalCapacitacion.numero.trim()
    const fechaInicio = modalCapacitacion.fechaInicio
    if (!nombrePostulante) { setModalCapacitacion(p=>({...p, error:'Ingresa el nombre del postulante'})); return }
    if (!numero) { setModalCapacitacion(p=>({...p, error:'Ingresa un número de contacto'})); return }
    if (!fechaInicio) { setModalCapacitacion(p=>({...p, error:'Selecciona la fecha de inicio de capacitación'})); return }
    setModalCapacitacion(p=>({...p, guardando:true, error:''}))
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas/${modalCapacitacion.entrevistaId}/capacitacion`, { method:'POST', headers:ncHeaders(), body:JSON.stringify({
        nombre_postulante:nombrePostulante, numero, fecha_inicio_capacitacion:fechaInicio,
      }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo registrar la capacitación')
      setModalCapacitacion({ open:false, entrevistaId:null, nombrePostulante:'', numero:'', fechaInicio:'', guardando:false, error:'' })
      mostrarToast('Capacitación registrada')
      if (seccion === 'capacitacion') cargarCapacitaciones()
    } catch (e) {
      setModalCapacitacion(p=>({...p, guardando:false, error:e.message || 'No se pudo registrar la capacitación'}))
    }
  }

  function actualizarCapacitacionLocal(id, cambios) {
    setCapacitaciones(prev => prev.map(c => c.id === id ? { ...c, ...cambios } : c))
  }

  async function guardarCampoCapacitacion(id, campo, valorAnterior, valorNuevo) {
    if (valorNuevo === (valorAnterior||'')) return
    actualizarCapacitacionLocal(id, { [campo]: valorNuevo })
    try {
      const res = await fetch(`${API}/leads-reclutamiento/capacitaciones/${id}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ [campo]: valorNuevo }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar')
      if (Array.isArray(data.historial)) actualizarCapacitacionLocal(id, { historial:data.historial })
    } catch(e) {
      actualizarCapacitacionLocal(id, { [campo]: valorAnterior||'' })
      mostrarToast(e.message || 'No se pudo guardar')
    }
  }

  // ── Modal fecha de alta (al marcar Tipificación final = ALTA) ────────────
  function abrirModalAlta(capacitacionId) {
    setModalAlta({ open:true, capacitacionId, fechaAlta:'', guardando:false, error:'' })
  }

  async function guardarAlta() {
    const fechaAlta = modalAlta.fechaAlta
    if (!fechaAlta) { setModalAlta(p=>({...p, error:'Ingresa la fecha de alta'})); return }
    setModalAlta(p=>({...p, guardando:true, error:''}))
    try {
      const res = await fetch(`${API}/leads-reclutamiento/capacitaciones/${modalAlta.capacitacionId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ tipificacion_final:'ALTA', fecha_alta:fechaAlta }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar')
      actualizarCapacitacionLocal(modalAlta.capacitacionId, { tipificacion_final:'ALTA', fecha_alta:fechaAlta, ...(Array.isArray(data.historial)?{historial:data.historial}:{}) })
      setModalAlta({ open:false, capacitacionId:null, fechaAlta:'', guardando:false, error:'' })
      mostrarToast('Postulante marcado como ALTA')
    } catch(e) {
      setModalAlta(p=>({...p, guardando:false, error:e.message || 'No se pudo guardar'}))
    }
  }

  async function guardarObservacionEntrevista(id, valorAnterior, valorNuevo) {
    if (valorNuevo === (valorAnterior||'')) return
    actualizarEntrevistaLocal(id, { observacion: valorNuevo })
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas/${id}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ observacion: valorNuevo }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar la observación')
    } catch(e) {
      actualizarEntrevistaLocal(id, { observacion: valorAnterior||'' })
      mostrarToast(e.message || 'No se pudo guardar la observación')
    }
  }

  async function guardarFechaEntrevista(id, valorAnterior, valorNuevo) {
    if (valorNuevo === (valorAnterior||'')) return
    actualizarEntrevistaLocal(id, { fecha_entrevista: valorNuevo })
    try {
      const res = await fetch(`${API}/leads-reclutamiento/entrevistas/${id}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ fecha_entrevista: valorNuevo||null }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar la fecha de entrevista')
    } catch(e) {
      actualizarEntrevistaLocal(id, { fecha_entrevista: valorAnterior||'' })
      mostrarToast(e.message || 'No se pudo guardar la fecha de entrevista')
    }
  }

  useEffect(() => {
    cargarAsesores()
    cargarLeads()
    cargarReclutados()
    // Piso mas bajo que el resto de la app (ver utils/polling.js): esta base
    // la trabajan varias personas en simultaneo sobre los mismos candidatos,
    // y con el piso general de 30s alguien podia tardar hasta 2 minutos en ver
    // que un companero ya habia reasignado/tipificado, generando reasignaciones
    // y tipificaciones cruzadas sobre el mismo numero.
    const t = setVisibleInterval(cargarLeads, 3000, 3000)
    return () => clearVisibleInterval(t)
  }, [cargarAsesores, cargarLeads, cargarReclutados])

  // BL modal reload on fecha change
  useEffect(() => {
    if (!blModal.open || blModal.asesorId == null) return
    setBlCargando(true)
    setBlLeads([])
    let url = `${API}/leads-reclutamiento?asesor_id=${blModal.asesorId}`
    if (blFecha) url += `&fecha=${blFecha}`
    fetch(url, { headers: ncHeaders() })
      .then(r => r.json())
      .then(data => { setBlLeads(data.ok ? data.data : null); setBlCargando(false) })
      .catch(() => { setBlLeads(null); setBlCargando(false) })
  }, [blFecha, blModal.open, blModal.asesorId])

  // ── Section navigation ───────────────────────────────────────────────────
  function irSeccion(id) {
    sessionStorage.setItem('nc_backoffice_apartado', id)
    setSeccion(id)
    if (id === 'carga-masiva') setLegacyFecha(fechaActiva)
    if (id === 'reclutados') cargarReclutados()
    if (id === 'entrevistas') cargarEntrevistas()
    if (id === 'capacitacion') cargarCapacitaciones()
  }

  useEffect(() => {
    if (esSoloOperativo) { puedeVerEntrevistas ? cargarEntrevistas() : cargarCapacitaciones() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Date navigation ──────────────────────────────────────────────────────
  function navegarFecha(dir) {
    setFechaActiva(prev => {
      const idx = fechaPestanas.indexOf(prev)
      const ni  = idx - dir
      if (ni < 0 || ni >= fechaPestanas.length) return prev
      return fechaPestanas[ni]
    })
  }

  function agregarFechaCalendario() {
    const f = calPicker
    if (!f) { mostrarToast('Selecciona una fecha primero'); return }
    if (fechaPestanas.includes(f)) { mostrarToast('Esa fecha ya existe'); return }
    setFechaPestanas(prev => [...prev, f].sort().reverse())
    setBaseData(prev => prev[f] ? prev : { ...prev, [f]: [] })
    setFechaActiva(f)
    setCalPicker('')
  }

  function agregarFechaCargaMasiva() {
    const f = cmCalPicker
    if (!f) { mostrarToast('Selecciona una fecha primero'); return }
    if (fechaPestanas.includes(f)) { mostrarToast('Esa fecha ya existe'); return }
    setFechaPestanas(prev => [...prev, f].sort().reverse())
    setBaseData(prev => prev[f] ? prev : { ...prev, [f]: [] })
    setFechaActiva(f)
    setCmCalPicker('')
  }

  // ── Form (agregar registro individual) ───────────────────────────────────
  async function agregarRegistro() {
    // El ref bloquea inmediatamente un segundo clic, incluso antes de que React
    // alcance a renderizar el estado disabled del botón.
    if (agregandoRegistroRef.current) return
    const n1 = form.n1.trim()
    const usuarioWhatsapp = form.usuarioWhatsapp.trim().replace(/^@+/, '')
    if (!n1 && !usuarioWhatsapp) { setN1Error(true); mostrarToast('Ingresa un N1 o un usuario de WhatsApp'); return }
    agregandoRegistroRef.current = true
    setAgregandoRegistro(true)
    setN1Error(false)
    const campana  = form.campana.trim() || '—'
    const distrito = '—'
    const n2       = form.n2.trim()
    const asesor   = '' // el formulario de alta rapida ya no asigna asesor — se hace desde la Base
    const hora     = ''
    // Un alta rápida siempre pertenece al día actual de Lima. La pestaña
    // activa puede ser histórica porque el usuario estaba revisando otro día.
    const fecha    = fechaHoy()
    const reg = {
      id:idCntRef.current++, _backendId:null, campana, distrito, n1, n2, usuarioWhatsapp, asesor, horaAsig:hora,
      sinAsignar:!asesor, rotaciones:0, _tipifVend:'', _tipifHora:'',
      historial: asesor ? [{asesor, hora, fecha, motivo:'Asignacion inicial'}] : [],
    }
    try {
      const res  = await fetch(`${API}/leads-reclutamiento`, { method:'POST', headers:ncHeaders(), body:JSON.stringify({ campana, departamento:'Lima', provincia:'Lima', distrito, n1, n2, usuario_whatsapp:usuarioWhatsapp, asesor_nombre:asesor, fecha, hora_asig:hora }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar el registro')
      const bid  = data.ids?.[0] || data.id
      if (!bid) throw new Error('El servidor no devolvió el identificador del registro')
      const fechaGuardada = normalizarFecha(data.fecha) || fecha
      const regGuardado = { ...reg, _backendId:bid }
      setBaseData(prev => ({ ...prev, [fechaGuardada]: [regGuardado, ...(prev[fechaGuardada] || [])] }))
      setFechaPestanas(prev => prev.includes(fechaGuardada) ? prev : [...prev, fechaGuardada].sort().reverse())
      setFechaActiva(fechaGuardada)
      setForm({ campana:'', distrito:'', n1:'', n2:'', usuarioWhatsapp:'', asesor:'' })
    } catch(e) {
      mostrarToast(e.message || 'No se pudo guardar el registro')
    } finally {
      agregandoRegistroRef.current = false
      setAgregandoRegistro(false)
    }
  }

  // ── Reasignar ────────────────────────────────────────────────────────────
  async function reasignarReg(id, nuevoAsesor) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    if ((nuevoAsesor || '') === (reg.asesor || '')) return  // mismo asesor: evita reasignacion fantasma en el historial
    const hora = horaAhora()
    if (nuevoAsesor && esLeadProhibido(reg)) {
      mostrarToast(`N1 ${reg.n1} bloqueado: ${reg._tipifVend}`)
      return
    }
    if (!nuevoAsesor) {
      const nuevoHist = [...reg.historial, { tipo:'QUITAR_ASIGNACION', asesorQuitado:reg.asesor, quitadoPor:sesion?.nombre||'Usuario', hora, fecha:fechaHoy() }]
      updateReg(id, { asesor:'', horaAsig:'', sinAsignar:true, historial:nuevoHist })
      if (reg._backendId) {
        try {
          const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ asesor_nombre:'', hora_asig:'', historial:nuevoHist }) })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo quitar la asignación')
        } catch (e) {
          updateReg(id, { asesor:reg.asesor, horaAsig:reg.horaAsig, sinAsignar:reg.sinAsignar, historial:reg.historial })
          mostrarToast(e.message || 'No se pudo quitar la asignación')
        }
      }
      return
    }
    const esReasignacion = !!reg.asesor
    const newHist = [...reg.historial, { asesor:nuevoAsesor, asesorAnterior:reg.asesor||'', reasignadoPor:sesion?.nombre||'', hora, fecha:fechaHoy(), motivo:'Reasignacion directa' }]
    updateReg(id, { asesor:nuevoAsesor, horaAsig:hora, sinAsignar:false, historial:newHist, rotaciones: esReasignacion ? reg.rotaciones+1 : reg.rotaciones })
    if (reg._backendId) {
      try {
        const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ asesor_nombre:nuevoAsesor, hora_asig:hora, historial:newHist, sumarRotacion:esReasignacion }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo reasignar el lead')
      } catch (e) {
        updateReg(id, { asesor:reg.asesor, horaAsig:reg.horaAsig, sinAsignar:reg.sinAsignar, historial:reg.historial, rotaciones:reg.rotaciones })
        mostrarToast(e.message || 'No se pudo reasignar el lead')
      }
    }
  }

  // ── Eliminar ─────────────────────────────────────────────────────────────
  async function eliminarReg(id) {
    mutGenRef.current++
    const found = findReg(id)
    if (!found) return
    setBaseData(prev => { const n={}; for(const f in prev) n[f]=prev[f].filter(r=>r.id!==id); return n })
    setHistOpen(prev => { const n={...prev}; delete n[id]; return n })
    if (found.reg._backendId) {
      try {
        const res = await fetch(`${API}/leads-reclutamiento/${found.reg._backendId}`, { method:'DELETE', headers:ncHeaders() })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo eliminar el lead')
      } catch (e) {
        setBaseData(prev => ({ ...prev, [found.fecha]: [found.reg, ...(prev[found.fecha] || []).filter(r => r.id !== id)] }))
        mostrarToast(e.message || 'No se pudo eliminar el lead')
      }
    }
  }

  // ── Tipif vendedor ────────────────────────────────────────────────────────
  async function guardarTipif(id, valor) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    const hora = horaAhora()
    updateReg(id, { _tipifVend:valor, _tipifHora:hora })
    if (reg._backendId) {
      try {
        const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}/tipif`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ tipif_vend:valor }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar la tipificación')
        if (Array.isArray(data.historial)) updateReg(id, { historial:data.historial })
        if (valor === 'VENTA CERRADA') abrirModalEntrevista(id)
        if (['NO TOCAR','FRAUDE','NO INTERESADO'].includes(valor)) abrirModalComentarioTipif(id)
      } catch (e) {
        updateReg(id, { _tipifVend:reg._tipifVend, _tipifHora:reg._tipifHora })
        mostrarToast(e.message || 'No se pudo guardar la tipificación')
      }
    }
  }

  async function guardarObsAsesorReg(id, valorAnterior, valorNuevo) {
    if (valorNuevo === (valorAnterior||'')) return
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    updateReg(id, { obsAsesor: valorNuevo })
    if (reg._backendId) {
      try {
        const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}/obs`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ obs:valorNuevo }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar el comentario')
      } catch(e) {
        updateReg(id, { obsAsesor: valorAnterior||'' })
        mostrarToast(e.message || 'No se pudo guardar el comentario')
      }
    }
  }

  // ── Modal comentario al tipificar No cumple el perfil / Provincia / No interesado ──
  function abrirModalComentarioTipif(id) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    setModalComentarioTipif({ open:true, regId:id, comentario:reg.obsAsesor||'', guardando:false, error:'' })
  }

  async function guardarComentarioTipif() {
    const comentario = modalComentarioTipif.comentario.trim()
    setModalComentarioTipif(p=>({...p, guardando:true, error:''}))
    const found = findReg(modalComentarioTipif.regId)
    if (!found) { setModalComentarioTipif(p=>({...p, guardando:false})); return }
    const { reg } = found
    const anterior = reg.obsAsesor||''
    updateReg(modalComentarioTipif.regId, { obsAsesor: comentario })
    try {
      if (reg._backendId) {
        const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}/obs`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ obs:comentario }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar el comentario')
      }
      setModalComentarioTipif({ open:false, regId:null, comentario:'', guardando:false, error:'' })
    } catch(e) {
      updateReg(modalComentarioTipif.regId, { obsAsesor: anterior })
      setModalComentarioTipif(p=>({...p, guardando:false, error:e.message || 'No se pudo guardar el comentario'}))
    }
  }

  // ── Modal agendar entrevista (al tipificar Acepta propuesta) ─────────────
  function abrirModalEntrevista(id) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    setModalEntrevista({
      open:true, regId:id, nombrePostulante:'',
      numero: reg.n1 || (reg.usuarioWhatsapp ? '@'+reg.usuarioWhatsapp : ''),
      numeroRef:'', turno:'', fechaAgendamiento:'', observacion:'', guardando:false, error:'',
    })
  }

  async function guardarEntrevista() {
    const found = findReg(modalEntrevista.regId)
    if (!found) return
    const { reg } = found
    if (!reg._backendId) { setModalEntrevista(p=>({...p, error:'Este candidato aún no está sincronizado con el servidor'})); return }
    const nombrePostulante = modalEntrevista.nombrePostulante.trim()
    const numero = modalEntrevista.numero.trim()
    const numeroRef = modalEntrevista.numeroRef.trim()
    const turno = modalEntrevista.turno
    const fechaAgendamiento = modalEntrevista.fechaAgendamiento
    const observacion = modalEntrevista.observacion.trim()
    if (!nombrePostulante) { setModalEntrevista(p=>({...p, error:'Ingresa el nombre del postulante'})); return }
    if (!numero) { setModalEntrevista(p=>({...p, error:'Ingresa un número de contacto'})); return }
    if (!turno) { setModalEntrevista(p=>({...p, error:'Selecciona un turno'})); return }
    if (!fechaAgendamiento) { setModalEntrevista(p=>({...p, error:'Selecciona la fecha de agendamiento'})); return }
    setModalEntrevista(p=>({...p, guardando:true, error:''}))
    try {
      const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}/entrevista`, { method:'POST', headers:ncHeaders(), body:JSON.stringify({
        nombre_postulante:nombrePostulante, numero, numero_ref:numeroRef, turno, fecha_agendamiento:fechaAgendamiento, observacion,
      }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo agendar la entrevista')
      setModalEntrevista({ open:false, regId:null, nombrePostulante:'', numero:'', numeroRef:'', turno:'', fechaAgendamiento:'', observacion:'', guardando:false, error:'' })
      mostrarToast('Entrevista agendada')
      if (seccion === 'entrevistas') cargarEntrevistas()
    } catch (e) {
      setModalEntrevista(p=>({...p, guardando:false, error:e.message || 'No se pudo agendar la entrevista'}))
    }
  }

  // ── Modal rotación manual ─────────────────────────────────────────────────
  function abrirModalRotar(id) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    setModalRotar({ open:true, regId:id, desc:`N1: ${reg.n1} — Asesor actual: ${reg.asesor||'Sin asignar'}`, asesorActual:reg.asesor })
    setRotModalAsesor('')
    setRotBusqueda('')
    setRotModalMotivo('')
  }

  // ── Modal editar campaña/contacto ─────────────────────────────────────────
  function abrirModalEditar(id, modo='contacto') {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    setModalEditar({ open:true, regId:id, modo, campana:reg.campana==='—'?'':reg.campana, n1:reg.n1||'', n2:reg.n2||'', usuarioWhatsapp:reg.usuarioWhatsapp||'', guardando:false, error:'' })
  }

  async function guardarEdicion() {
    const found = findReg(modalEditar.regId)
    if (!found) return
    const { reg } = found
    const campana = modalEditar.campana.trim() || '—'
    const n1 = modalEditar.n1.trim()
    const n2 = modalEditar.n2.trim()
    const usuarioWhatsapp = modalEditar.usuarioWhatsapp.trim().replace(/^@+/, '')
    if (modalEditar.modo === 'contacto' && !n1 && !usuarioWhatsapp) { setModalEditar(p=>({...p, error:'Ingresa un N1 o un usuario de WhatsApp'})); return }
    setModalEditar(p=>({...p, guardando:true, error:''}))
    updateReg(modalEditar.regId, { campana, n1, n2, usuarioWhatsapp })
    try {
      if (reg._backendId) {
        const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}/datos-back`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ campana, n1, n2, usuario_whatsapp:usuarioWhatsapp }) })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar')
      }
      setModalEditar({ open:false, regId:null, modo:'contacto', campana:'', n1:'', n2:'', usuarioWhatsapp:'', guardando:false, error:'' })
    } catch(e) {
      updateReg(modalEditar.regId, { campana:reg.campana, n1:reg.n1, n2:reg.n2, usuarioWhatsapp:reg.usuarioWhatsapp })
      setModalEditar(p=>({...p, guardando:false, error:e.message || 'Error al guardar'}))
    }
  }

  async function confirmarRotacion() {
    if (!rotModalAsesor) return
    const found = findReg(modalRotar.regId)
    if (!found) return
    const { reg } = found
    const hora    = horaAhora()
    const motivo  = rotModalMotivo.trim() || 'Rotacion manual'
    const newHist = [...reg.historial, { tipo:'ROTACION', asesor:rotModalAsesor, hora, fecha:fechaHoy(), motivo, rotadoPor:sesion?.nombre||'Usuario', tipifVendAntes:reg._tipifVend||'' }]
    updateReg(modalRotar.regId, { asesor:rotModalAsesor, horaAsig:hora, sinAsignar:false, rotaciones:reg.rotaciones+1, historial:newHist })
    try {
      if (reg._backendId) {
        const res = await fetch(`${API}/leads-reclutamiento/${reg._backendId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ asesor_nombre:rotModalAsesor, hora_asig:hora, historial:newHist, sumarRotacion:true }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo rotar el lead')
      }
      setModalRotar({ open:false, regId:null, desc:'', asesorActual:'' })
    } catch (e) {
      updateReg(modalRotar.regId, { asesor:reg.asesor, horaAsig:reg.horaAsig, sinAsignar:reg.sinAsignar, rotaciones:reg.rotaciones, historial:reg.historial })
      mostrarToast(e.message || 'No se pudo rotar el lead')
    }
  }

  // ── Rotation panel ────────────────────────────────────────────────────────
  function buildRotLeads() {
    const ahora = new Date()
    const list  = []
    const fechas = rotFiltroFecha ? [rotFiltroFecha] : Object.keys(baseData).sort().reverse()
    fechas.forEach(fecha => {
      (baseData[fecha]||[]).forEach(reg => {
        let ultimaAsig = new Date(fecha+'T'+(reg.horaAsig||'00:00')+':00')
        if (isNaN(ultimaAsig)) ultimaAsig = new Date(ahora.getTime() - 24*3600000)
        list.push({ id:reg.id, tel:reg.n1, campana:reg.campana, n2:reg.n2||'', estado:reg.tipifBack||'Nuevo', tipifVend:reg._tipifVend||'', prohibido:esLeadProhibido(reg), asesor:reg.asesor||'', ultimaAsig, fecha, histAsesores:reg.historial.map(h=>h.asesor), _reg:reg })
      })
    })
    return list
  }

  function rotApto(lead, asesor) {
    const ahora = new Date()
    const prohibido = !!lead.prohibido
    if (prohibido) return { apto:false, prohibido:true, sinRepetir:false, tiempo:false, estadoOk:false }
    if (!asesor) return { apto:false, prohibido:false }
    const sinRepetir = !lead.histAsesores.includes(asesor)
    const mins = Math.floor((ahora - lead.ultimaAsig)/60000)
    const tiempo = mins >= 120
    const estadoOk = ['Buzon','No contesta','Nuevo','BUZON','NO CONTESTA',''].includes(lead.estado)
    if (!lead.asesor) return { apto:sinRepetir, prohibido:false, sinRepetir, tiempo:true, estadoOk:true }
    return { apto:sinRepetir&&tiempo&&estadoOk, prohibido:false, sinRepetir, tiempo, estadoOk }
  }

  function rotMins(f) { return Math.floor((new Date() - f)/60000) }
  function rotTxt(f) { const m=rotMins(f); if(m<60) return m+' min'; const h=Math.floor(m/60),r=m%60; return h+'h'+(r>0?' '+r+'min':'') }

  async function rotFinalizarWith(selToUse, asesorActual) {
    const hora     = horaAhora()
    const allLeads = buildRotLeads()
    // Se valida otra vez al ejecutar para impedir selecciones antiguas o cambios
    // de tipificación ocurridos mientras el panel estaba abierto.
    const rotados  = allLeads.filter(l => selToUse[l.id] && rotApto(l, asesorActual).apto)
    const res = []
    for (const l of rotados) {
      const reg = l._reg
      const newHist = [...reg.historial, { asesor:asesorActual, hora, fecha:fechaHoy(), motivo:'Rotacion masiva' }]
      updateReg(reg.id, { asesor:asesorActual, horaAsig:hora, sinAsignar:false, rotaciones:(reg.rotaciones||0)+1, historial:newHist })
      try {
        if (reg._backendId) {
          const respuesta = await fetch(`${API}/leads-reclutamiento/${reg._backendId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ asesor_nombre:asesorActual, hora_asig:hora, historial:newHist, sumarRotacion:true }) })
          const data = await respuesta.json().catch(() => ({}))
          if (!respuesta.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo rotar')
        }
        res.push({ tel:reg.n1, asesor:asesorActual, hora })
      } catch (e) {
        updateReg(reg.id, { asesor:reg.asesor, horaAsig:reg.horaAsig, sinAsignar:reg.sinAsignar, rotaciones:reg.rotaciones, historial:reg.historial })
        res.push({ tel:reg.n1, asesor:'ERROR: '+(e.message || 'no guardado'), hora:'—' })
      }
    }
    setRotRotados(prev => prev + res.filter(item => !String(item.asesor).startsWith('ERROR:')).length)
    setRotResultado(res)
    setRotSel({})
  }

  async function rotEjecutar() {
    if (!rotAsesor) return
    const asesorActual = rotAsesor
    let selToUse = { ...rotSel }
    if (Object.keys(selToUse).length === 0) {
      const aptos = buildRotLeads().filter(l => rotApto(l, asesorActual).apto).slice(0, rotCant)
      if (!aptos.length) { mostrarToast('No hay leads aptos para ' + asesorActual); return }
      const newSel = {}
      aptos.forEach(l => { newSel[l.id] = true })
      setRotSel(newSel)
      selToUse = newSel
    }
    setRotProgress(25)
    setTimeout(() => setRotProgress(50), 200)
    setTimeout(() => setRotProgress(75), 400)
    setTimeout(async () => {
      await rotFinalizarWith(selToUse, asesorActual)
      setRotProgress(100)
      setTimeout(() => setRotProgress(0), 1000)
    }, 600)
  }

  function rotToggleSel(id, checked) {
    const selCount = Object.values(rotSel).filter(Boolean).length
    if (checked) {
      if (selCount >= rotCant) { mostrarToast('Maximo '+rotCant+' leads'); return }
      setRotSel(prev => ({ ...prev, [id]:true }))
    } else {
      setRotSel(prev => { const n={...prev}; delete n[id]; return n })
    }
  }

  // ── Carga masiva ──────────────────────────────────────────────────────────
  function obtenerN1Existentes() {
    const set = new Set()
    for (const f in baseData) (baseData[f]||[]).forEach(r => { if(r.n1) set.add(String(r.n1).replace(/\s+/g,'')) })
    return set
  }

  function obtenerUsuariosWhatsappExistentes() {
    const set = new Set()
    for (const f in baseData) (baseData[f]||[]).forEach(r => { if(r.usuarioWhatsapp) set.add(String(r.usuarioWhatsapp).toLowerCase()) })
    return set
  }

  function previsualizarMasiva() {
    const raw = masivaNums.trim()
    if (!raw) { mostrarToast('Pega numeros o usuarios de WhatsApp primero'); return }
    // Acepta tanto numeros de telefono como usuarios de WhatsApp (para leads que
    // ocultan su numero y solo muestran su @usuario). Se clasifica cada linea:
    // si son solo digitos/simbolos de telefono va a N1, si tiene letras va a
    // usuario de WhatsApp.
    const itemsRaw = raw.split(/[\n,;]+/).map(n=>n.trim().replace(/\s+/g,'')).filter(n=>n.length>=4)
    if (!itemsRaw.length) { mostrarToast('No se encontraron numeros o usuarios validos'); return }
    const lote = masivaLote === '0' ? itemsRaw.length : (parseInt(masivaLote) || 10)
    const itemsLote = itemsRaw.slice(0, lote)
    const existentesN1 = obtenerN1Existentes()
    const existentesUsuario = obtenerUsuariosWhatsappExistentes()
    const vistos = new Set()
    const filas  = []
    itemsLote.forEach(item => {
      const esNumero = /^[\d+()-]+$/.test(item) && item.replace(/\D/g,'').length >= 7
      const n1 = esNumero ? item : ''
      const usuarioWhatsapp = esNumero ? '' : item.replace(/^@+/, '')
      const clave = esNumero ? n1 : usuarioWhatsapp.toLowerCase()
      let dup=false, motivo=''
      if (vistos.has(clave)) { dup=true; motivo='Repetido en la lista' }
      else if (esNumero && existentesN1.has(n1)) { dup=true; motivo='Ya esta en el sistema' }
      else if (!esNumero && existentesUsuario.has(clave)) { dup=true; motivo='Ya esta en el sistema' }
      vistos.add(clave)
      filas.push({ n1, usuarioWhatsapp, esNumero, dup, motivo })
    })
    setMasivaFilas(filas)
    setInclDup(false)
  }

  async function ejecutarCargaMasiva() {
    const lista = inclDup ? masivaFilas : masivaFilas.filter(f=>!f.dup)
    if (!lista.length) { mostrarToast('No hay numeros o usuarios para cargar'); return }
    const campana = masivaCamp.trim() || '—'
    const asesor  = masivaAsesor
    const hora    = asesor ? horaAhora() : ''
    const fecha   = fechaActiva
    // Antes se re-filtraba aqui contra baseData comparando solo N1+fecha (sin
    // campaña), duplicando lo que ya decidio el usuario en la vista previa de
    // arriba (que si compara igual que el backend) — y podia descartar en
    // silencio, sin ningun aviso, un numero que en realidad era valido para
    // otra campaña. Ahora se manda la lista tal cual la aprobo el usuario y
    // el backend es la unica fuente de verdad sobre que es duplicado.
    const leadsParaBackend = lista.map(f => ({
      campana, distrito:'—', n1:f.n1||null, n2:'', usuario_whatsapp:f.usuarioWhatsapp||null,
      tipif_back:'', asesor_nombre:asesor, fecha, hora_asig:hora,
    }))
    try {
      const res  = await fetch(`${API}/leads-reclutamiento`, { method:'POST', headers:ncHeaders(), body:JSON.stringify(leadsParaBackend) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar la base')
      // Se recarga desde el servidor en vez de pintar filas optimistas: con
      // lotes, algunas filas pueden quedar omitidas (duplicado del dia/campaña)
      // y antes se mostraban igual como si se hubieran guardado, hasta que el
      // siguiente refresco automatico las hacia desaparecer sin explicacion.
      await cargarLeads()
      setFechaPestanas(prev => prev.includes(fecha) ? prev : [...prev, fecha].sort().reverse())
      mostrarToast(data.omitidos
        ? `${data.creados} cargado(s), ${data.omitidos} omitido(s) por ya existir ese número en la misma fecha y campaña`
        : `${data.creados} cargado(s)`)
      setMasivaNums(''); setMasivaFilas([]); setInclDup(false)
    } catch(e) {
      mostrarToast(e.message || 'No se pudo cargar la base')
    }
  }

  function procesarArchivo(file) {
    setArchivoStatus(`Leyendo ${file.name}...`)
    const reader = new FileReader()
    reader.onload = e => {
      const text   = e.target.result
      const lineas = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0)
      if (!lineas.length) { setArchivoStatus('Archivo vacio'); return }
      const sep  = lineas[0].includes('\t')?'\t':lineas[0].includes(';')?';':','
      const p0   = lineas[0].split(sep)[0].trim()
      const cab  = (isNaN(p0.replace(/\s/g,''))&&p0.length>0&&!/^\d{7,}$/.test(p0)) ? lineas[0].split(sep).map(c=>c.trim().toLowerCase()) : null
      const datos= cab ? lineas.slice(1) : lineas
      const iN1  = cab ? (cab.findIndex(c=>c.includes('n1')||c.includes('numero')||c.includes('telefono'))) : 0
      const iN2  = cab ? cab.findIndex(c=>c.includes('n2')) : -1
      const iCamp= cab ? cab.findIndex(c=>c.includes('camp')||c.includes('zona')) : -1
      const iDist= cab ? cab.findIndex(c=>c.includes('dist')) : -1
      const iTip = cab ? cab.findIndex(c=>c.includes('tipif')||c.includes('estado')) : -1
      const rows = datos.map(linea => {
        const cols = linea.split(sep).map(c=>c.trim().replace(/^["']|["']$/g,''))
        const n1   = cols[iN1>=0?iN1:0]||''
        if (!n1||n1.length<6) return null
        return { n1, n2:iN2>=0?(cols[iN2]||''):'', camp:iCamp>=0?(cols[iCamp]||'—'):'—', dist:iDist>=0?(cols[iDist]||'—'):'—', tipif:iTip>=0?(cols[iTip]||''):'' }
      }).filter(Boolean)
      if (!rows.length) { setArchivoStatus('No se encontraron registros validos'); return }
      setArchivoRows(rows); setArchivoInfo(`${rows.length} registros en "${file.name}"`); setArchivoStatus('')
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function ejecutarCargaArchivo() {
    if (!archivoRows.length) { mostrarToast('No hay datos'); return }
    const fecha = fechaActiva
    // Mismo criterio que ejecutarCargaMasiva: no se pre-filtra localmente
    // contra baseData (comparaba solo N1+fecha, sin campaña, y descartaba en
    // silencio filas validas), y no se pintan filas optimistas — se espera la
    // respuesta real del servidor y se recarga desde ahi.
    const leadsBackend = archivoRows.map(r => ({
      campana:r.camp, distrito:r.dist, n1:r.n1, n2:r.n2, tipif_back:r.tipif,
      asesor_nombre:'', fecha, hora_asig:'',
    }))
    try {
      const res  = await fetch(`${API}/leads-reclutamiento`, { method:'POST', headers:ncHeaders(), body:JSON.stringify(leadsBackend) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el archivo')
      await cargarLeads()
      setFechaPestanas(prev => prev.includes(fecha) ? prev : [...prev, fecha].sort().reverse())
      mostrarToast(data.omitidos
        ? `${data.creados} cargado(s), ${data.omitidos} omitido(s) por ya existir ese número en la misma fecha y campaña`
        : `${data.creados} cargado(s)`)
    } catch(e) {
      mostrarToast(e.message || 'No se pudo cargar el archivo')
    }
    setArchivoRows([]); setArchivoInfo(''); setArchivoStatus('')
    if (archivoInputRef.current) archivoInputRef.current.value = ''
  }

  // Mismo patrón que descargarFormato() en Backoffice.jsx, adaptado al
  // formato real de Sistema Antiguo de Reclutamiento (CAMPAÑA · FECHA ·
  // CONTACTO · OBSERVACIONES · TIPIFICACIÓN · HORA · ASESOR 1..6).
  function descargarFormatoLegacy() {
    const wb = XLSX.utils.book_new()
    const HDR = ['CAMPAÑA','FECHA','CONTACTO','OBSERVACIONES','TIPIFICACIÓN','HORA','ASESOR 1','ASESOR 2','ASESOR 3','ASESOR 4','ASESOR 5','ASESOR 6']
    const COLS = HDR.map((_,i)=>({ wch: i===0?12 : i===1?12 : i===2?18 : i===3?26 : i===4?16 : i===5?9 : 18 }))
    // Hoja 1: plantilla vacía — solo encabezados
    const ws1 = XLSX.utils.aoa_to_sheet([HDR])
    ws1['!cols'] = COLS
    ws1['!freeze'] = { xSplit: 0, ySplit: 1 }
    ws1['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(HDR.length-1)}1` }
    XLSX.utils.book_append_sheet(wb, ws1, 'CARGA SISTEMA ANTIGUO')
    // Hoja 2: datos de ejemplo ficticios — mezcla números y usuario de WhatsApp
    const ws2 = XLSX.utils.aoa_to_sheet([
      HDR,
      ['R1','01/08/2026','987654321','Llamó y cortó','CORTA LLAMADA','17:11','DIEGO ALTAMINARO','ARELIS IBAÑEZ','','','',''],
      ['R2','02/08/2026','usuario_whatsapp_ejemplo','Sin número, solo WhatsApp','NO CONTESTA','09:30','MARIA RIOS','','','','',''],
      ['R4','03/08/2026','976543210','','BUZON','11:45','CARLOS VEGA','PEDRO LUNA','','','',''],
      ['CHANCAY','04/08/2026','945612378','Pidió volver a llamar','AGENDADO','14:00','ANA TORRES','','','','',''],
    ])
    ws2['!cols'] = COLS
    ws2['!freeze'] = { xSplit: 0, ySplit: 1 }
    XLSX.utils.book_append_sheet(wb, ws2, 'EJEMPLO')
    // Hoja 3: instrucciones
    const INSTR = [
      ['INSTRUCCIONES — CARGA SISTEMA ANTIGUO (RECLUTAMIENTO)'],
      [''],
      ['IMPORTANTE: No modifique el nombre ni el orden de las columnas.'],
      [''],
      ['Columna','Descripción','Obligatorio','Notas'],
      ['CAMPAÑA', 'Campaña de reclutamiento', 'No', `Usar exactamente: ${CAMPANAS_RECLUTAMIENTO.map(c=>c.valor).join(' · ')}`],
      ['FECHA','Fecha del registro','Depende','Formato recomendado: DD/MM/YYYY — ej: 01/08/2026. Solo se usa si eliges "Leer fecha de la fila" al importar.'],
      ['CONTACTO','Número de teléfono o usuario de WhatsApp','SÍ','Si es numérico (7+ dígitos) se guarda como N1; si no, se guarda como usuario de WhatsApp (con o sin @).'],
      ['OBSERVACIONES','Comentario libre del asesor','No','Texto libre, no se tipifica'],
      ['TIPIFICACIÓN',`Tipificación del asesor`,'No', TIPIF_VEND_OPCIONES.map(t=>t.label).join(' · ')],
      ['HORA','Hora de la última gestión','No','Formato HH:MM — ejemplo: 17:11'],
      ['ASESOR 1 … ASESOR 6','Historial de asesores que tuvieron este contacto','No','Nombre completo tal como aparece en el sistema'],
      [''],
      ['NOTAS ADICIONALES'],
      ['— Use la hoja "CARGA SISTEMA ANTIGUO" para pegar sus datos.'],
      ['— Use la hoja "EJEMPLO" como referencia: 4 registros con distintos formatos de contacto.'],
      ['— CONTACTO es el único campo siempre obligatorio.'],
      ['— Formatos de archivo aceptados al importar: .csv · .txt'],
    ]
    const ws3 = XLSX.utils.aoa_to_sheet(INSTR)
    ws3['!cols'] = [{ wch:22 },{ wch:36 },{ wch:14 },{ wch:70 }]
    ws3['!rows'] = [{ hpt:18 }]
    XLSX.utils.book_append_sheet(wb, ws3, 'INSTRUCCIONES')
    XLSX.writeFile(wb, 'FORMATO_CARGA_SISTEMA_ANTIGUO_RECLUTAMIENTO.xlsx')
  }

  const MESES_ABREV_EN = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 }

  // Convierte números seriales de Excel, DD/MM/YYYY (con o sin ceros), DD-MM-YYYY
  // o YYYY-MM-DD a 'YYYY-MM-DD'; null si no reconoce el formato. Necesario
  // porque una celda FECHA real de Excel no siempre llega como texto plano.
  function parseFechaLegacyRecl(raw) {
    if (!raw) return null
    const s = String(raw).trim()
    const mDMY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (mDMY) return `${mDMY[3]}-${mDMY[2].padStart(2,'0')}-${mDMY[1].padStart(2,'0')}`
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
    const mDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
    if (mDash) return `${mDash[3]}-${mDash[2].padStart(2,'0')}-${mDash[1].padStart(2,'0')}`
    // Excel a veces exporta la fecha como "1-Aug" o "1-Aug-26" (formato corto
    // con mes en inglés) al convertir vía SheetJS — cubre ambos casos.
    const mMonY = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
    if (mMonY) {
      const mes = MESES_ABREV_EN[mMonY[2].toLowerCase()]
      if (mes) {
        let anio = mMonY[3]
        if (anio.length === 2) anio = (Number(anio) < 70 ? '20' : '19') + anio
        return `${anio}-${String(mes).padStart(2,'0')}-${mMonY[1].padStart(2,'0')}`
      }
    }
    const mMon = s.match(/^(\d{1,2})-([A-Za-z]{3})$/)
    if (mMon) {
      const mes = MESES_ABREV_EN[mMon[2].toLowerCase()]
      if (mes) return `${new Date().getFullYear()}-${String(mes).padStart(2,'0')}-${mMon[1].padStart(2,'0')}`
    }
    const n = Number(s)
    if (!isNaN(n) && n > 40000 && n < 60000) {
      const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000)
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
    }
    return null
  }

  // Si el archivo es .xlsx/.xls, lo convierte a CSV vía SheetJS (misma técnica
  // que leerArchivoComoTexto() en Backoffice.jsx) antes de parsearlo como texto
  // — antes esto se leía como texto plano y con un .xlsx real salía basura.
  async function leerArchivoComoTextoRecl(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    if (ext === 'xlsx' || ext === 'xls') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = e => {
          try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type:'array', cellDates:true })
            const ws = wb.Sheets[wb.SheetNames[0]]
            resolve(XLSX.utils.sheet_to_csv(ws))
          } catch(err) { reject(err) }
        }
        reader.onerror = reject
        reader.readAsArrayBuffer(file)
      })
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsText(file, 'UTF-8')
    })
  }

  // Split de una linea CSV respetando comillas: una OBSERVACIONES con coma
  // adentro (ej. "johan, falta confirmar turno") no debe correr las columnas
  // siguientes (TIPIFICACION/HORA/ASESOR) — un split() ingenuo si lo hacia.
  function splitCSVLine(linea, sep) {
    const out = []
    let cur = '', enComillas = false
    for (let i=0;i<linea.length;i++) {
      const ch = linea[i]
      if (ch === '"') {
        if (enComillas && linea[i+1] === '"') { cur += '"'; i++; continue }
        enComillas = !enComillas; continue
      }
      if (ch === sep && !enComillas) { out.push(cur); cur=''; continue }
      cur += ch
    }
    out.push(cur)
    return out.map(x=>x.trim())
  }

  // Excel exporta horas de un solo digito sin cero a la izquierda ("8:32"),
  // pero el backend exige HH:MM exacto — sin esto, esas filas se rechazaban
  // silenciosamente en el import por lote.
  function normalizarHoraLegacy(raw) {
    const m = String(raw||'').trim().match(/^(\d{1,2}):(\d{2})/)
    if (!m) return ''
    return `${m[1].padStart(2,'0')}:${m[2]}`
  }

  async function procesarLegacy(file) {
    setLegacyStatus(`Leyendo ${file.name}...`)
    let text
    try { text = await leerArchivoComoTextoRecl(file) }
    catch(e) { setLegacyStatus('Error leyendo el archivo'); return }
    const lineas = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0)
    if (!lineas.length) { setLegacyStatus('Archivo vacio'); return }
    const sep   = lineas[0].includes('\t')?'\t':lineas[0].includes(';')?';':','
    const prim  = splitCSVLine(lineas[0], sep)
    // Formato: CAMPAÑA · FECHA · CONTACTO · OBSERVACIONES · TIPIFICACIÓN · HORA · ASESOR 1..6.
    // Encabezado: si la columna FECHA de la primera fila no es una fecha real, es titulo.
    const primFecha = (prim[1]||'').trim()
    const cab = !parseFechaLegacyRecl(primFecha)
    const datos = cab ? lineas.slice(1) : lineas
    const fechaDest = legacyFecha || fechaActiva
    const usarFF = legacyUsarFecha === 'si'
    const rows   = []
    datos.forEach(linea => {
      const c  = splitCSVLine(linea, sep)
      const contacto = (c[2]||'').replace(/\s+/g,'')
      if (!contacto || contacto.length<4) return
      const esNumero = /^[\d+()-]+$/.test(contacto) && contacto.replace(/\D/g,'').length >= 7
      const n1 = esNumero ? contacto : ''
      const usuarioWhatsapp = esNumero ? '' : contacto.replace(/^@+/, '')
      const asesoresHist = []
      for (let i=6;i<=11;i++) { const a=(c[i]||'').trim(); if(a&&a.length>1) asesoresHist.push(a) }
      let fechaFila = fechaDest
      if (usarFF) {
        const parsed = parseFechaLegacyRecl((c[1]||'').trim())
        if (parsed) fechaFila = parsed
      }
      rows.push({ campana:c[0]||'—', n1, usuarioWhatsapp, esNumero, obs:c[3]||'', tipifVend:normalizarTipifVendLegacy(c[4]), hora:normalizarHoraLegacy(c[5]), asesores:asesoresHist, fecha:fechaFila })
    })
    if (!rows.length) { setLegacyStatus('No se encontraron filas validas'); return }
    setLegacyRows(rows); setLegacyInfo(`${rows.length} registros desde "${file.name}"`); setLegacyStatus('')
  }
  async function ejecutarCargaLegacy() {
    if (!legacyRows.length) { mostrarToast('No hay datos'); return }
    const leadsBackend = []
    const updates = {}
    const nuevasFechasLocal = []
    legacyRows.forEach(r => {
      const fecha = r.fecha
      if (!fechaPestanas.includes(fecha)&&!nuevasFechasLocal.includes(fecha)) nuevasFechasLocal.push(fecha)
      if (!updates[fecha]) updates[fecha] = []
      // Permitir duplicados: no se descartan números repetidos en la carga del sistema antiguo.
      const asesorFinal = r.asesores[r.asesores.length-1]||''
      // En el Sistema Antiguo cada columna ASESOR ya representa una vuelta real
      // del lead (incluida la primera): a diferencia de un lead recien creado en
      // Futura (que empieza sin rotaciones hasta la primera reasignacion), aqui
      // TODAS las columnas ocupadas cuentan como rotaciones — por eso se etiquetan
      // 'Rotacion 1'..'Rotacion N' sin distinguir una 'asignacion inicial'.
      const hist = r.asesores.map((a,i)=>({ asesor:a, hora:r.hora||'—', fecha, motivo:`Rotacion ${i+1}` }))
      if (r.tipifVend) hist.push({ tipo:'TIPIF_VEND', asesor:asesorFinal, tipif:r.tipifVend, hora:r.hora||'—', fecha })
      updates[fecha].push({ id:idCntRef.current++, _backendId:null, campana:r.campana, distrito:'—', n1:r.n1, n2:'', usuarioWhatsapp:r.usuarioWhatsapp, tipifBack:'', asesor:asesorFinal, horaAsig:r.hora, sinAsignar:r.asesores.length===0, rotaciones:r.asesores.length, _tipifVend:r.tipifVend, _tipifHora:r.hora||'', historial:hist })
      leadsBackend.push({ campana:r.campana, distrito:'—', n1:r.n1||null, n2:null, usuario_whatsapp:r.usuarioWhatsapp||null, tipif_vend:r.tipifVend||null, tipif_hora:r.hora||null, obs_asesor:r.obs||null, historial:hist, asesor_nombre:asesorFinal, rotaciones:r.asesores.length, fecha, hora_asig:r.hora, importacion_legacy:true })
    })
    if (!leadsBackend.length) return
    // Antes esto ignoraba silenciosamente cualquier error del backend y    // actualizaba el estado local igual — parecía "importado" en pantalla
    // aunque nada se hubiera guardado. Ahora solo se actualiza la UI si el
    // backend confirma éxito, y se avisa con el conteo real (creados/omitidos).
    setLegacyStatus('Importando...')
    try {
      const res = await fetch(`${API}/leads-reclutamiento`,{method:'POST',headers:ncHeaders(),body:JSON.stringify(leadsBackend)})
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo importar el archivo')
      setBaseData(prev => { const n={...prev}; for(const f in updates) n[f]=[...(prev[f]||[]),...updates[f]]; return n })
      setFechaPestanas(prev => [...prev, ...nuevasFechasLocal.filter(f=>!prev.includes(f))].sort().reverse())
      mostrarToast(data.mensaje || `${data.creados} candidato(s) creado(s)`)
      cargarLeads()
    } catch(e) {
      setLegacyStatus('')
      mostrarToast(e.message || 'No se pudo importar el archivo')
      return
    }
    setLegacyRows([]); setLegacyInfo(''); setLegacyStatus('')
    if (legacyInputRef.current) legacyInputRef.current.value = ''
  }

  // ── BL Modal ──────────────────────────────────────────────────────────────
  function abrirBlModal(nombre, asesorId) {
    setBlModal({ open:true, nombre, asesorId })
    setBlFecha(fechaHoy())
  }

  // ── Computed values ───────────────────────────────────────────────────────
  // "Buscar en todas las fechas": cargarLeads ya trae TODOS los registros sin
  // filtrar por fecha (baseData los tiene completos, solo organizados por dia),
  // asi que la busqueda global no necesita otra llamada al backend — solo hay
  // que dejar de recortar la vista a la pestaña activa.
  const registrosActivos = filtros.global
    ? Object.entries(baseData).flatMap(([fecha, regs]) => regs.map(r => ({ ...r, _fechaFila: fecha })))
    : (baseData[fechaActiva] || []).map(r => ({ ...r, _fechaFila: fechaActiva }))
  // Cuenta cuantas veces aparece cada N1 dentro del alcance actual (fecha activa
  // o todas las fechas si 'Buscar global' esta activo) — usado por el filtro
  // "Numeros duplicados".
  const conteoDuplicadosReg = registrosActivos.reduce((mapa, r) => {
    const n = String(r.n1||'').replace(/\D/g,'')
    if (n) mapa.set(n, (mapa.get(n)||0)+1)
    return mapa
  }, new Map())
  // Numera cada aparicion de un mismo N1 dentro del alcance actual (mismo
  // criterio y mismos colores que Backoffice.jsx): la 2da-3ra vez se resalta
  // morado, la 4ta en adelante guinda — para que Back Data vea de un vistazo
  // qué números ya vienen repetidos sin tener que activar el filtro.
  const ocurrenciaDiariaPorId = (() => {
    const conteoPorNumero = new Map()
    const ocurrencias = new Map()
    for (let i = registrosActivos.length - 1; i >= 0; i--) {
      const n1 = String(registrosActivos[i].n1 || '').replace(/\D/g, '')
      if (!n1) continue
      const ocurrencia = (conteoPorNumero.get(n1) || 0) + 1
      conteoPorNumero.set(n1, ocurrencia)
      ocurrencias.set(registrosActivos[i].id, ocurrencia)
    }
    return ocurrencias
  })()
  const bloquePrioridadReg = r => {
    if (!String(r.asesor||'').trim() || r.sinAsignar) return 0
    if (!String(r._tipifVend||'').trim()) return 1
    return 2
  }
  // "Acepta propuesta" (VENTA CERRADA) se puede ver por separado, sin que
  // participe de los demas filtros — igual que los grupos protegidos de
  // Backoffice (SIN COBERTURA, NO TOCAR, etc.), pero aca solo hace falta este uno.
  const grupoAceptaPropuesta = registrosActivos.filter(r => String(r._tipifVend||'').trim().toUpperCase() === 'VENTA CERRADA')
  const registrosFiltrados = (() => {
    const fuente = grupoAceptaVisible ? grupoAceptaPropuesta : registrosActivos
    const filtered = fuente.filter(r => {
      if (filtros.tip    && !(r.tipifBack||'').toUpperCase().includes(filtros.tip.toUpperCase())) return false
      if (filtros.tipVend.length) {
        const actual = String(r._tipifVend||'').trim().toUpperCase()
        const coincidePendiente = !actual && filtros.tipVend.includes('__pendiente__')
        const coincideTipif = filtros.tipVend.some(v=>v!=='__pendiente__' && v.toUpperCase()===actual)
        if (!coincidePendiente && !coincideTipif) return false
      }
      if (filtros.asesor.length && !filtros.asesor.some(v=>v.toUpperCase()===String(r.asesor||'').trim().toUpperCase())) return false
      if (filtros.campana.length && !filtros.campana.some(v=>v.toUpperCase()===String(r.campana||'').trim().toUpperCase())) return false
      if (filtros.numero && !(r.n1||'').includes(filtros.numero) && !(r.n2||'').includes(filtros.numero) && !(r.usuarioWhatsapp||'').toLowerCase().includes(filtros.numero.toLowerCase())) return false
      if (filtros.desde && r._fechaFila < filtros.desde) return false
      if (filtros.hasta && r._fechaFila > filtros.hasta) return false
      if (filtros.duplicados && (conteoDuplicadosReg.get(String(r.n1||'').replace(/\D/g,'')) || 0) < 2) return false
      return true
    })
    if (ordenDiarioActivo) {
      return [...filtered].sort((a, b) => {
        const bloqueA = bloquePrioridadReg(a), bloqueB = bloquePrioridadReg(b)
        if (bloqueA !== bloqueB) return bloqueA - bloqueB
        const rotA = a.rotaciones||0, rotB = b.rotaciones||0
        if (rotA !== rotB) return rotA - rotB
        return String(a.horaAsig||'').localeCompare(String(b.horaAsig||''))
      })
    }
    if (tableSort.col) {
      return [...filtered].sort((a, b) => {
        let cmp = 0
        if (tableSort.col === 'hora') cmp = String(a.horaAsig||'').localeCompare(String(b.horaAsig||''))
        if (tableSort.col === 'rots') cmp = (a.rotaciones||0) - (b.rotaciones||0)
        return tableSort.dir === 'asc' ? cmp : -cmp
      })
    }
    return filtered
  })()
  // Paginacion de la tabla Base — evita renderizar cientos de filas de una vez.
  const baseTotalPages = Math.max(1, Math.ceil(registrosFiltrados.length / basePageSize))
  const basePageSafe = Math.min(basePage, baseTotalPages)
  const baseDesde = (basePageSafe - 1) * basePageSize
  const registrosPagina = registrosFiltrados.slice(baseDesde, baseDesde + basePageSize)
  useEffect(() => { setBasePage(1) }, [fechaActiva, filtros.tip, filtros.tipVend, filtros.asesor, filtros.campana, filtros.numero, filtros.desde, filtros.hasta, filtros.global, filtros.duplicados, tableSort.col, tableSort.dir, basePageSize, grupoAceptaVisible, ordenDiarioActivo])
  const agendadoPorOpciones = [...new Set(entrevistas.map(en => String(en.creado_por_nombre||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))
  const campanasEntrevistaOpciones = [...new Set(entrevistas.map(en => String(en.campana||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))
  const turnosEntrevistaOpciones = [...new Set(entrevistas.map(en => String(en.turno||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))
  const tipificacionesEntrevistaOpciones = [...new Set(entrevistas.map(en => String(en.tipificacion||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))
  const entrevistasFiltradas = entrevistas.filter(en => {
    if (filtrosEntrevistas.turnos.length && !filtrosEntrevistas.turnos.includes(String(en.turno||'').trim())) return false
    if (filtrosEntrevistas.campanas.length && !filtrosEntrevistas.campanas.includes(String(en.campana||'').trim())) return false
    if (filtrosEntrevistas.tipificaciones.length) {
      const tipificacion = String(en.tipificacion||'').trim() || '__pendiente__'
      if (!filtrosEntrevistas.tipificaciones.includes(tipificacion)) return false
    }
    if (filtrosEntrevistas.agendadoPor.length && !filtrosEntrevistas.agendadoPor.includes(String(en.creado_por_nombre||'').trim())) return false
    const fecha = String(en.fecha_agendamiento||'').slice(0,10)
    if (filtrosEntrevistas.desde && fecha < filtrosEntrevistas.desde) return false
    if (filtrosEntrevistas.hasta && fecha > filtrosEntrevistas.hasta) return false
    const texto = filtrosEntrevistas.busqueda.trim().toLowerCase()
    if (!texto) return true
    return [en.nombre_postulante, en.numero, en.numero_ref, en.campana].some(v => String(v||'').toLowerCase().includes(texto))
  })
  const entrevistasTotalPages = Math.max(1, Math.ceil(entrevistasFiltradas.length / entrevistasPageSize))
  const entrevistasPageSafe = Math.min(entrevistasPage, entrevistasTotalPages)
  const entrevistasDesde = (entrevistasPageSafe - 1) * entrevistasPageSize
  const entrevistasPagina = entrevistasFiltradas.slice(entrevistasDesde, entrevistasDesde + entrevistasPageSize)
  useEffect(() => { setEntrevistasPage(1) }, [filtrosEntrevistas, entrevistasPageSize])

  const capacitacionesFiltradas = capacitaciones.filter(c => {
    const fecha = String(c.fecha_inicio_capacitacion||'').slice(0,10)
    if (filtrosCapacitacion.desde && fecha < filtrosCapacitacion.desde) return false
    if (filtrosCapacitacion.hasta && fecha > filtrosCapacitacion.hasta) return false
    const texto = filtrosCapacitacion.busqueda.trim().toLowerCase()
    if (!texto) return true
    return [c.nombre_postulante, c.numero, c.campana].some(v => String(v||'').toLowerCase().includes(texto))
  })

  const statsBase = {
    total:      registrosActivos.length,
    ventas:     registrosActivos.filter(r=>(r.tipifBack||'').toUpperCase().includes('VENTA')).length,
    asignados:  registrosActivos.filter(r=>r.asesor&&r.asesor!=='').length,
    sinAsignar: registrosActivos.filter(r=>r.sinAsignar).length,
    rotaciones: registrosActivos.reduce((s,r)=>s+r.rotaciones,0),
  }

  const rendData = useMemo(() => {
    const mesActual = fechaHoy().slice(0,7)
    let todosReg = []
    for (const f in baseData) {
      if (rendFiltroTipo==='mes'   && !f.startsWith(mesActual))           continue
      if (rendFiltroTipo==='dia'   && f!==rendFiltroFecha)                continue
      if (rendFiltroTipo==='rango' && rendDesde && f < rendDesde)         continue
      if (rendFiltroTipo==='rango' && rendHasta && f > rendHasta)         continue
      todosReg = todosReg.concat(baseData[f])
    }
    const data = asesores.map(a => {
      const regs    = todosReg.filter(r=>(r.asesor||'').trim().toLowerCase()===(a.nombre||'').trim().toLowerCase())
      const leads   = regs.length
      const contesta= regs.filter(r=>['CONTESTA','VENTA CERRADA','PREVENTA','AGENDADO'].includes((r._tipifVend||'').toUpperCase())).length
      const nc      = regs.filter(r=>['NC','NO CONTESTA','BUZON DE VOZ'].includes((r._tipifVend||'').toUpperCase())).length
      const ventas  = regs.filter(r=>(r._tipifVend||'').toUpperCase()==='VENTA CERRADA').length
      const conv    = leads ? Math.round(ventas/leads*100) : 0
      return { nombre:a.nombre, usuario:a.usuario||'', leads, contesta, nc, ventas, conv }
    })
    const sortMap = { 'ventas_desc':(a,b)=>b.ventas-a.ventas,'ventas_asc':(a,b)=>a.ventas-b.ventas,'conv_desc':(a,b)=>b.conv-a.conv,'leads_desc':(a,b)=>b.leads-a.leads,'contesta_desc':(a,b)=>b.contesta-a.contesta,'nc_desc':(a,b)=>b.nc-a.nc }
    data.sort(sortMap[rendOrden] || sortMap['ventas_desc'])
    return data
  }, [baseData, asesores, rendFiltroTipo, rendFiltroFecha, rendDesde, rendHasta, rendOrden])

  const rendTotLeads  = rendData.reduce((s,r)=>s+r.leads,0)
  const rendTotVentas = rendData.reduce((s,r)=>s+r.ventas,0)
  const rendTotConv   = rendTotLeads ? Math.round(rendTotVentas/rendTotLeads*100) : 0
  const rendMaxVentas = Math.max(...rendData.map(r=>r.ventas), 1)

  const allRotLeads    = rotPanelOpen ? buildRotLeads() : []
  function rotSortVal(l, col) {
    switch (col) {
      case 'n1':     return l.tel || ''
      case 'fecha':  return l.fecha || ''
      case 'tipif':  return l.estado || 'NUEVO'
      case 'asesor': return l.asesor || ''
      case 'rotac':  return Math.max(l._reg?.rotaciones || 0, Math.max(0, (l.histAsesores?.length || 0) - 1))
      case 'hora':
      case 'tiempo': return l.ultimaAsig instanceof Date ? l.ultimaAsig.getTime() : 0
      case 'sinrepetir': return rotApto(l, rotAsesor).sinRepetir ? 1 : 0
      case 'aptitud':    return rotApto(l, rotAsesor).apto ? 1 : 0
      default: return 0
    }
  }
  const allRotLeadsSorted = rotSort.col
    ? [...allRotLeads].sort((a, b) => {
        const va = rotSortVal(a, rotSort.col), vb = rotSortVal(b, rotSort.col)
        const cmp = (typeof va === 'number' && typeof vb === 'number')
          ? va - vb
          : String(va).localeCompare(String(vb), 'es', { numeric:true })
        return rotSort.dir === 'desc' ? -cmp : cmp
      })
    : allRotLeads
  function toggleRotSort(col) {
    setRotSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir:'asc' })
  }
  function rotTh(col, label, thStyle) {
    const activo = rotSort.col === col
    return (
      <th onClick={()=>toggleRotSort(col)} style={{ cursor:'pointer', userSelect:'none', whiteSpace:'nowrap', ...thStyle }} title="Ordenar">
        <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>
          {label}
          <span style={{ fontSize:9, lineHeight:1, color: activo ? '#6d28d9' : '#cbd5e1' }}>{activo ? (rotSort.dir==='asc'?'▲':'▼') : '⇅'}</span>
        </span>
      </th>
    )
  }
  const rotStatAptos   = allRotLeads.filter(l=>rotApto(l,rotAsesor).apto).length
  const rotStatNoAptos = allRotLeads.length - rotStatAptos
  const rotAptos       = allRotLeads.filter(l=>rotApto(l,rotAsesor).apto)
  const allAptosSelected = rotAptos.length > 0 && rotAptos.every(l=>rotSel[l.id])
  const rotFechasDisp  = Object.keys(baseData).filter(f=>(baseData[f]||[]).length>0).sort().reverse()
  const rotAsesoresDisp= asesores.map(a=>({ nombre:a.nombre, cnt:Object.values(baseData).flat().filter(r=>r.asesor===a.nombre).length }))
  const masivaFilasParaCargar = inclDup ? masivaFilas : masivaFilas.filter(f=>!f.dup)
  const masivaNDup    = masivaFilas.filter(f=>f.dup).length
  const masivaFilasCnt= masivaFilas.length
  const avanceFiltrado= asesores.filter(a => !avanceBuscar || a.nombre.toLowerCase().includes(avanceBuscar.toLowerCase()) || (a.usuario||'').toLowerCase().includes(avanceBuscar.toLowerCase()))

  const idx      = fechaPestanas.indexOf(fechaActiva)
  const prevDis  = idx >= fechaPestanas.length - 1
  const nextDis  = idx <= 0

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="bo-root">
      {/* TOPBAR */}
      <div className="topbar module-topbar-standard">
        <div className="bo-topbar-left">
          <div className="brand">
            <div className="logo-circle"><img src="/assets/logo-futura.png" alt="FUTURA" /></div>
            <div className="brand-text">
              <img src="/assets/futura-wordmark.png" alt="FUTURA" style={{height:22,width:"auto",display:"block"}} />
              <span className="brand-sub">Back Data Reclutaminto</span>
            </div>
          </div>
          <button
            type="button"
            className={`bo-sidebar-toggle${sidebarAbierto ? ' abierto' : ''}`}
            aria-label={sidebarAbierto ? 'Ocultar menú' : 'Mostrar menú'}
            title={sidebarAbierto ? 'Ocultar menú' : 'Mostrar menú'}
            onClick={() => setSidebarAbierto(valor => {
              const nuevo = !valor
              sessionStorage.setItem('nc_backoffice_sidebar', nuevo ? 'abierto' : 'cerrado')
              return nuevo
            })}
          >
            <svg viewBox="0 0 18 18" aria-hidden="true"><rect x="2.5" y="2.5" width="13" height="13" rx="2.5"/><path d="M7 3v12"/></svg>
          </button>
        </div>
        <div className="topbar-right">
          <JefaturaViewControls><span className="bo-usuario">{sesion?.nombre || 'Back Data'}</span></JefaturaViewControls>
          <CambiarAreaMenu />
          <a href="#" className="bo-salir" onClick={e=>{ e.preventDefault(); logout(); navigate('/') }}>Salir</a>
        </div>
      </div>

      <div className={`bo-layout${sidebarAbierto ? '' : ' sidebar-cerrado'}`}>
        {/* SIDEBAR */}
        <aside className={`bo-sidebar${sidebarAbierto ? '' : ' cerrado'}`} aria-hidden={!sidebarAbierto}>
          <div className="sidebar-sep">Principal</div>
          {!esSoloOperativo && <>
          <button className={`bo-nav${seccion==='base'?' active':''}`} onClick={()=>irSeccion('base')}><BoNavIcon tipo="base" /> <span>Base</span></button>
          <button className={`bo-nav${seccion==='reclutados'?' active':''}`} onClick={()=>irSeccion('reclutados')}><BoNavIcon tipo="avance" /> <span>Reclutados</span></button>
          <button className={`bo-nav${seccion==='carga-masiva'?' active':''}`} onClick={()=>irSeccion('carga-masiva')}><BoNavIcon tipo="carga" /> <span>Carga Masiva</span></button>
          </>}
          {puedeVerEntrevistas && <button className={`bo-nav${seccion==='entrevistas'?' active':''}`} onClick={()=>irSeccion('entrevistas')}><BoNavIcon tipo="entrevistas" /> <span>Entrevistas</span></button>}
          {puedeVerCapacitacion && <button className={`bo-nav${seccion==='capacitacion'?' active':''}`} onClick={()=>irSeccion('capacitacion')}><BoNavIcon tipo="capacitacion" /> <span>Capacitación</span></button>}
          {!esSoloOperativo && (
          <div className="bo-sidebar-registro">
            <div className="sidebar-sep">Agregar registro</div>
            <div style={{fontSize:10,color:'#6b7280',fontWeight:600,margin:'-4px 0 8px'}}>{formatFecha(fechaActiva)}</div>
            <div className="bo-input-group"><label>Campaña</label><CampanaSelect value={form.campana} onChange={v=>setForm(p=>({...p,campana:v}))} plain /></div>
            <div className="bo-input-group"><label>N1</label><input className={`form-control${n1Error?' obligatorio-error':''}`} value={form.n1} onChange={e=>{ setN1Error(false); setForm(p=>({...p,n1:e.target.value})) }} placeholder="Número principal" style={{fontFamily:'monospace'}} /></div>
            <div className="bo-input-group"><label>N2 (opcional)</label><input className="form-control" value={form.n2} onChange={e=>setForm(p=>({...p,n2:e.target.value}))} placeholder="Número secundario" style={{fontFamily:'monospace'}} /></div>
            <div className="bo-input-group"><label>Usuario WhatsApp</label><input className={`form-control${n1Error?' obligatorio-error':''}`} value={form.usuarioWhatsapp} onChange={e=>{ setN1Error(false); setForm(p=>({...p,usuarioWhatsapp:e.target.value})) }} placeholder="Si no tiene N1, ej. usuario_cliente" maxLength={100} /></div>
            <div className="bo-sidebar-registro-acciones">
              <button className="bo-btn-limpiar" onClick={()=>setForm({campana:'',distrito:'',n1:'',n2:'',usuarioWhatsapp:'',asesor:''})}>Limpiar</button>
              <button className="bo-btn-agregar" onClick={agregarRegistro} disabled={agregandoRegistro}>
                {agregandoRegistro ? 'Agregando…' : '+ Agregar'}
              </button>
            </div>
          </div>
          )}
        </aside>
        <main className="bo-main">

          {/* ══ SECCIÓN: BASE ══════════════════════════════════════════════════ */}
          <section className={`bo-seccion${seccion==='base'?'':' hidden'}`}>
            <div className="bo-seccion-header">
              <div>
                <h2>Base de Llamadas</h2>
                <p className="bo-sub">Gestiona y asigna contactos. La tipificación del vendedor se actualiza automáticamente.</p>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:12,color:'#9ca3af',fontWeight:600}}>{statsBase.total} registros</span>
              </div>
            </div>

            {/* PANEL ROTACIÓN */}
            {rotPanelOpen && (
              <div style={{marginBottom:14}}>
                <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:14,overflow:'hidden',boxShadow:'0 1px 6px rgba(0,0,0,.05)'}}>
                  <div style={{background:'#111827',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{color:'#fff',fontSize:13,fontWeight:600}}>Rotación Inteligente de Leads</span>
                    <button onClick={()=>setRotPanelOpen(false)} style={{background:'rgba(255,255,255,.15)',border:'none',color:'#fff',padding:'3px 10px',borderRadius:6,cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>Cerrar ✕</button>
                  </div>
                  <div style={{padding:'14px 16px'}}>
                    <div className="rot-header-stats" style={{marginBottom:14}}>
                      <div className="rot-stat"><div className="rot-stat-num">{allRotLeads.length}</div><div className="rot-stat-label">Leads totales</div></div>
                      <div className="rot-stat"><div className="rot-stat-num green">{rotStatAptos}</div><div className="rot-stat-label">Aptos para rotar</div></div>
                      <div className="rot-stat"><div className="rot-stat-num red">{rotStatNoAptos}</div><div className="rot-stat-label">No aptos</div></div>
                      <div className="rot-stat"><div className="rot-stat-num purple">{rotRotados}</div><div className="rot-stat-label">Rotados hoy</div></div>
                    </div>
                    <div className="rot-grid" style={{marginBottom:14}}>
                      <div className="bo-panel" style={{padding:'14px 16px'}}>
                        <div className="bo-panel-title">Reglas de rotación</div>
                        <div className="rot-regla"><div className="rot-regla-icon r-red">✕</div><div><strong>Sin repetir:</strong> el lead no puede ir a un asesor que ya lo tuvo</div></div>
                        <div className="rot-regla"><div className="rot-regla-icon r-blue">T</div><div><strong>Mínimo 2h</strong> sin ser contactado para rotar</div></div>
                        <div className="rot-regla"><div className="rot-regla-icon r-green">✓</div><div><strong>Estado válido:</strong> Buzón, No contesta o Nuevo</div></div>
                        <div className="rot-regla"><div className="rot-regla-icon r-red">!</div><div><strong>Números prohibidos:</strong> NO TOCAR y FRAUDE nunca se asignan ni rotan</div></div>
                        <div className="rot-regla"><div className="rot-regla-icon r-purple">#</div><div><strong>Máximo 4 leads</strong> por rotación a un mismo asesor</div></div>
                      </div>
                      <div className="bo-panel" style={{padding:'14px 16px'}}>
                        <div className="bo-panel-title">Disponibilidad de asesores</div>
                        {rotAsesoresDisp.map(a=>(
                          <div key={a.nombre} className="rot-asesor-row"><span>{a.nombre}</span><span className="rot-asesor-badge">{a.cnt} registros</span></div>
                        ))}
                      </div>
                    </div>
                    <div className="rot-form" style={{marginBottom:12}}>
                      <div className="rot-form-title">Rotar leads a un asesor</div>
                      <div className="rot-form-row">
                        <div style={{ width:260 }}>
                          <AsesorBuscador value={rotAsesor} asesores={asesores}
                            onChange={v=>{ setRotAsesor(v); setRotSel({}) }}
                            className="form-select" placeholderText="— Seleccionar asesor destino —" emptyLabel="— Ninguno —" />
                        </div>
                        <input type="number" value={rotCant} min={1} max={4} onChange={e=>setRotCant(parseInt(e.target.value)||4)} style={{width:60}} />
                        <span style={{fontSize:12,color:'#888'}}>leads máx.</span>
                        <button className="btn-rotar-masivo" onClick={rotEjecutar} disabled={!rotAsesor || rotProgress>0}>
                          {rotProgress>0 ? 'Rotando...' : 'Rotar ahora'}
                        </button>
                      </div>
                      <div className="rot-progress"><div className="rot-progress-fill" style={{width:`${rotProgress}%`}} /></div>
                    </div>
                    {rotResultado.length > 0 && (
                      <div className="rot-resultado show" style={{marginBottom:12}}>
                        <div className="rot-resultado-title">Rotación ejecutada</div>
                        {rotResultado.map((r,i)=>(
                          <div key={i} className="rot-res-item"><div className="rot-res-dot" /><strong>{r.tel}</strong> → <strong>{r.asesor}</strong> · {r.hora}</div>
                        ))}
                      </div>
                    )}
                    <div className="rot-table-wrap">
                      <div className="rot-table-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          Leads disponibles <span className="tag-aptos">{rotStatAptos} aptos</span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <label style={{fontSize:11,color:'#6b7280',fontWeight:600}}>Fecha:</label>
                          <select value={rotFiltroFecha} onChange={e=>{ setRotFiltroFecha(e.target.value); setRotSel({}) }} style={{padding:'5px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:12,fontFamily:'inherit',outline:'none',background:'#fff',cursor:'pointer'}}>
                            <option value="">Todas las fechas</option>
                            {rotFechasDisp.map(f=><option key={f} value={f}>{formatFecha(f)} ({(baseData[f]||[]).length})</option>)}
                          </select>
                          <button onClick={()=>{ setRotFiltroFecha(''); setRotSel({}) }} style={{padding:'5px 10px',border:'1px solid #e5e7eb',borderRadius:8,background:'#fff',color:'#6b7280',fontSize:11,fontWeight:600,fontFamily:'inherit',cursor:'pointer'}}>Limpiar</button>
                        </div>
                      </div>
                      <div style={{overflowX:'auto'}} className="rot-table">
                        <table>
                          <thead><tr>
                            <th>
                              <input type="checkbox" checked={allAptosSelected} onChange={e=>{ if(e.target.checked){const ns={};rotAptos.slice(0,rotCant).forEach(l=>{ns[l.id]=true});setRotSel(ns);}else setRotSel({}) }} />
                            </th>
                            {rotTh('n1','N1 / Campaña')}{rotTh('fecha','Fecha')}{rotTh('tipif','Tipificación')}
                            {rotTh('asesor','Asesor actual')}{rotTh('rotac','Rotac.')}{rotTh('hora','Hora asig.')}{rotTh('tiempo','Tiempo')}
                            {rotTh('sinrepetir','Sin repetir')}{rotTh('aptitud','Aptitud')}
                          </tr></thead>
                          <tbody>
                            {allRotLeadsSorted.length === 0
                              ? <tr><td colSpan={10} className="bo-empty">Sin leads.</td></tr>
                              : allRotLeadsSorted.map(l => {
                                  const { apto, prohibido, sinRepetir, tiempo } = rotApto(l, rotAsesor)
                                  const mins = rotMins(l.ultimaAsig)
                                  const esFechaHoy = l.fecha === fechaHoy()
                                  const nRot = Math.max(l._reg?.rotaciones || 0, Math.max(0, (l.histAsesores?.length || 0) - 1))
                                  return (
                                    <tr key={l.id} className={(prohibido||(!apto&&rotAsesor))?'row-noapto':''}>
                                      <td><input type="checkbox" checked={!!rotSel[l.id]} disabled={prohibido||(!apto&&!!rotAsesor)} onChange={e=>rotToggleSel(l.id,e.target.checked)} /></td>
                                      <td><div style={{fontFamily:'monospace',fontWeight:700,color:'#111827',fontSize:12}}>{l.tel}</div><div style={{fontSize:10,color:'#9ca3af',marginTop:1}}>{l.campana} · {l.n2||'—'}</div></td>
                                      <td>{esFechaHoy ? <span style={{background:'#dcfce7',color:'#166534',fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:99}}>HOY</span> : <span style={{background:'#f3f4f6',color:'#6b7280',fontSize:9,padding:'1px 6px',borderRadius:99}}>{formatFecha(l.fecha)}</span>}</td>
                                      <td><span className={`tipif-badge ${tipifBadgeClass(prohibido?l.tipifVend:l.estado)}`} style={prohibido?{background:'#fee2e2',color:'#991b1b',fontWeight:800}:{}}>{prohibido?l.tipifVend:(l.estado||'Sin tipif.')}</span></td>
                                      <td style={{fontSize:12}}>{l.asesor}</td>
                                      <td style={{textAlign:'center'}}><span style={{display:'inline-block',minWidth:22,padding:'1px 7px',borderRadius:99,fontSize:11,fontWeight:700,background:nRot>0?'#fef3c7':'#f3f4f6',color:nRot>0?'#92400e':'#9ca3af'}} title={`${nRot} rotación(es)`}>{nRot}</span></td>
                                      <td className="hora-color">{l.ultimaAsig.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}</td>
                                      <td className={tiempo?'timer-ok':'timer-fail'}>{rotTxt(l.ultimaAsig)} {tiempo?'OK':'falta '+(120-mins)+'min'}</td>
                                      <td>{!rotAsesor?'—':sinRepetir?<span className="check-ok">OK</span>:<span className="check-fail">Ya tuvo</span>}</td>
                                      <td>{prohibido?<span className="badge-noapto">Prohibido</span>:!rotAsesor?'—':apto?<span className="badge-apto">Apto</span>:<span className="badge-noapto">No apto</span>}</td>
                                    </tr>
                                  )
                                })
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* NAVEGADOR DE FECHA */}
            <div className="fecha-nav-row">
              <span style={{fontSize:11,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:.4,whiteSpace:'nowrap'}}>Fecha activa:</span>
              <div className="fecha-nav-ctrl">
                <button className="fnav-btn" onClick={()=>navegarFecha(-1)} disabled={prevDis}>←</button>
                <select className="fnav-select" value={fechaActiva} onChange={e=>setFechaActiva(e.target.value)}>
                  {fechaPestanas.map(f=><option key={f} value={f}>{formatFecha(f)} ({(baseData[f]||[]).length})</option>)}
                </select>
                <button className="fnav-btn" onClick={()=>navegarFecha(1)} disabled={nextDis}>→</button>
              </div>
              <span className="fnav-count">{idx+1} / {fechaPestanas.length}</span>
              <div className="fecha-add-wrap">
                <input type="date" value={calPicker} onChange={e=>setCalPicker(e.target.value)} className="fecha-add-input" />
                <button className="fecha-add-btn" onClick={agregarFechaCalendario}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Agregar fecha
                </button>
              </div>
            </div>

            {/* FILTROS EN UNA SOLA FILA, DEBAJO DE LAS FECHAS */}
            <div className="base-filtros">
              <div className="bo-input-group base-filtro-numero"><label>Número</label>
                <input className="form-control" value={filtros.numero} onChange={e=>setFiltros(p=>({...p,numero:e.target.value.replace(/\s+/g,'')}))} placeholder="Buscar N1, N2 o usuario WhatsApp..." />
              </div>
              <div className="bo-input-group base-filtro-fecha"><label>Desde</label>
                <input type="date" className="form-control" value={filtros.desde} max={filtros.hasta||undefined} onChange={e=>setFiltros(p=>({...p,desde:e.target.value,global:true}))} />
              </div>
              <div className="bo-input-group base-filtro-fecha"><label>Hasta</label>
                <input type="date" className="form-control" value={filtros.hasta} min={filtros.desde||undefined} onChange={e=>setFiltros(p=>({...p,hasta:e.target.value,global:true}))} />
              </div>
              <label className="toggle-col base-filtro-toggle base-filtro-global">
                <input type="checkbox" checked={filtros.global} onChange={e=>setFiltros(p=>({...p,global:e.target.checked}))} />
                <span>Buscar global</span>
              </label>
              <label className="toggle-col base-filtro-toggle">
                <input type="checkbox" checked={filtros.duplicados} onChange={e=>setFiltros(p=>({...p,duplicados:e.target.checked}))} />
                <span>Números duplicados</span>
              </label>
              <label className="toggle-col base-filtro-toggle">
                <input type="checkbox" checked={filtros.verTipVend} onChange={e=>setFiltros(p=>({...p,verTipVend:e.target.checked}))} />
                <span>Ver tipif. vendedor</span>
              </label>
              <button className="bo-btn-limpiar btn btn-sm base-filtro-limpiar" onClick={()=>{setFiltros({tip:'',tipVend:[],asesor:[],campana:[],numero:'',verTipVend:true,global:false,desde:'',hasta:'',duplicados:false}); setTableSort({col:null,dir:null})}}>Limpiar filtros</button>
              <button type="button" className="base-orden-btn"
                onClick={()=>{
                  const activar = !ordenDiarioActivo
                  setOrdenDiarioActivo(activar)
                  if (activar) { setFiltros({tip:'',tipVend:[],asesor:[],campana:[],numero:'',verTipVend:true,global:false,desde:'',hasta:'',duplicados:false}); setTableSort({col:null,dir:null}) }
                }}
                style={{background:ordenDiarioActivo?'#16a34a':'linear-gradient(135deg,#7c3aed,#dc2626)'}}>
                {ordenDiarioActivo?'✓ Orden diario activo':'Ordenar base del día'}
              </button>
            </div>

            {/* TABLA BASE */}
            <datalist id="asesores-datalist">
              {asesores.map(a=><option key={a.id} value={a.nombre} />)}
            </datalist>
            <div className="tabla-desliza-aviso">← Desliza horizontalmente para ver todas las columnas →</div>
            <div className="base-tabla-wrap">
              <table className="base-tabla table table-sm table-hover">
                <thead>
                  <tr>
                    <th>#</th><th><FiltroEncabezado label="Campaña" value={filtros.campana} options={CAMPANAS_RECLUTAMIENTO.map(c=>c.valor)}
                      onChange={campana=>setFiltros(p=>({...p,campana}))} /></th>
                    <th>N1</th><th>N2</th>
                    <th><FiltroEncabezado label="Asesor asignado" value={filtros.asesor} options={asesores.map(a=>a.nombre)} searchable
                      onChange={asesor=>setFiltros(p=>({...p,asesor}))} /></th>
                    <th>
                      <button type="button" className={`th-sort-btn${tableSort.col==='hora'?' th-sort-active':''}`}
                        onClick={()=>cycleSort('hora')} title="Ordenar por hora" aria-label="Ordenar por hora de asignación"
                        aria-sort={tableSort.col==='hora'?(tableSort.dir==='asc'?'ascending':'descending'):'none'}>
                        Hora / Fecha asign.<SortIcon active={tableSort.col==='hora'} direction={tableSort.col==='hora'?(tableSort.dir==='desc'?'down':'up'):null}/>
                      </button>
                    </th>
                    {filtros.verTipVend && <th><FiltroEncabezado label="Tipif. Vendedor" value={filtros.tipVend} options={TIPIF_VEND_OPCIONES.map(t=>t.value)} pending
                      onChange={tipVend=>setFiltros(p=>({...p,tipVend}))} /></th>}
                    <th>Comentario</th>
                    <th>
                      <button type="button" className={`th-sort-btn${tableSort.col==='rots'?' th-sort-active':''}`}
                        onClick={()=>cycleSort('rots')} title="Ordenar por rotaciones" aria-label="Ordenar por cantidad de rotaciones"
                        aria-sort={tableSort.col==='rots'?(tableSort.dir==='asc'?'ascending':'descending'):'none'}>
                        Rotaciones<SortIcon active={tableSort.col==='rots'} direction={tableSort.col==='rots'?(tableSort.dir==='asc'?'up':'down'):null}/>
                      </button>
                    </th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosFiltrados.length === 0
                    ? <tr><td colSpan={filtros.verTipVend?10:9} className="bo-empty">{filtros.global ? 'Sin registros para los filtros seleccionados.' : `Sin registros en ${formatFecha(fechaActiva)}.`}</td></tr>
                    : registrosPagina.map((r,i) => {
                        const esExclusiva = esLeadProhibido(r)
                        const ocurrenciaDia = ocurrenciaDiariaPorId.get(r.id) || 1
                        const claseDuplicadoDia = ocurrenciaDia >= 4 ? 'num-duplicado-limite' : (ocurrenciaDia >= 2 ? 'num-duplicado' : '')
                        return [
                          <tr key={r.id} id={`fila-${r.id}`}>
                            <td style={{color:'#9ca3af',fontSize:10}}>{baseDesde+i+1}</td>
                            <td><div className="numero-copiar"><CampanaBadge valor={r.campana} /><button type="button" className="btn-editar-inline" onClick={()=>abrirModalEditar(r.id,'campana')} title="Editar campaña" aria-label="Editar campaña"><PencilIcon /></button><button type="button" onClick={()=>setHistOpen(p=>({...p,[r.id]:!p[r.id]}))} title="Ver historial (quién cargó esta campaña y número)" aria-label="Ver historial"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></button></div></td>
                            <td>{r.n1
                              ? <div className="numero-copiar"><span className={claseDuplicadoDia} title={ocurrenciaDia >= 2 ? `Aparición ${ocurrenciaDia} del alcance actual` : ''}>{r.n1}</span><button type="button" onClick={()=>copiarNumero(r.n1)} title="Copiar N1" aria-label={`Copiar ${r.n1}`}><CopyIcon /></button><button type="button" className="btn-editar-inline" onClick={()=>abrirModalEditar(r.id,'contacto')} title="Editar contacto" aria-label="Editar contacto"><PencilIcon /></button></div>
                              : r.usuarioWhatsapp
                                ? <div className="numero-copiar" title="Sin número — usuario de WhatsApp"><span>@{r.usuarioWhatsapp}</span><button type="button" onClick={()=>copiarNumero(r.usuarioWhatsapp)} title="Copiar usuario" aria-label={`Copiar ${r.usuarioWhatsapp}`}><CopyIcon /></button><button type="button" className="btn-editar-inline" onClick={()=>abrirModalEditar(r.id,'contacto')} title="Editar contacto" aria-label="Editar contacto"><PencilIcon /></button></div>
                                : <div className="numero-copiar"><span style={{color:'#ccc'}}>—</span><button type="button" className="btn-editar-inline" onClick={()=>abrirModalEditar(r.id,'contacto')} title="Editar contacto" aria-label="Editar contacto"><PencilIcon /></button></div>}
                            </td>
                            <td>{r.n2 ? <div className="numero-copiar secundario"><span>{r.n2}</span><button type="button" onClick={()=>copiarNumero(r.n2)} title="Copiar N2" aria-label={`Copiar ${r.n2}`}><CopyIcon /></button></div> : <span style={{color:'#ccc'}}>—</span>}</td>
                            <td>
                              <AsesorBuscador value={r.asesor} asesores={asesores} disabled={esExclusiva}
                                title={esExclusiva?`Número prohibido: ${r._tipifVend}`:''}
                                onChange={v=>reasignarReg(r.id,v)} />
                            </td>
                            <td>{r.horaAsig ? <><span className="hora-cell">{r.horaAsig}</span> <span className="hora-date">{formatFecha(r._fechaFila || fechaActiva)}</span></> : <span className="hora-empty">—</span>}</td>                            {filtros.verTipVend && (
                              <td>
                                <div style={{display:'flex',flexDirection:'column',gap:2}}>
                                  <select className="sel-tipif-vend" value={r._tipifVend} onChange={e=>guardarTipif(r.id,e.target.value)} style={estiloTipifVend(r._tipifVend)}>
                                    <option value="" style={{background:'#fff',color:'#111827',fontWeight:400}}>— Pendiente —</option>
                                    {TIPIF_VEND_OPCIONES.map(t=><option key={t.value} value={t.value} style={{background:'#fff',color:'#111827',fontWeight:400}}>{t.label}</option>)}
                                  </select>
                                  {r._tipifHora && <span style={{fontSize:9,color:'#9ca3af'}}>vendedor · {r._tipifHora}</span>}
                                </div>
                              </td>
                            )}
                            <td><input className="form-control" defaultValue={r.obsAsesor||''} onBlur={e=>guardarObsAsesorReg(r.id, r.obsAsesor||'', e.target.value.trim())} placeholder="Comentario…" style={{minWidth:140,fontSize:11}} /></td>
                            <td style={{textAlign:'center'}}>
                              {r.rotaciones > 0
                                ? <span style={{background:'#EDE9FE',color:'#4C1D95',fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:99,display:'inline-block'}}>{r.rotaciones}x</span>
                                : <span style={{color:'#d1d5db',fontSize:11}}>0</span>}
                            </td>
                            <td>
                              <div className="acciones-cell acc-cell-compact">
                                <button className="btn-hist btn-hist-sm" onClick={()=>abrirModalEditar(r.id)} title="Editar campaña / contacto">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                                </button>
                                <button className="btn-rotar btn-rotar-sm" title="Rotar" onClick={()=>abrirModalRotar(r.id)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                </button>
                                <button className="btn-hist btn-hist-sm" onClick={()=>setHistOpen(p=>({...p,[r.id]:!p[r.id]}))} title="Historial">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                </button>
                                <button className="btn-del" onClick={()=>eliminarReg(r.id)} title="Eliminar">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>,
                          <tr key={`hist-${r.id}`} className={`historial-row${histOpen[r.id]?' open':''}`}>
                            <td colSpan={filtros.verTipVend?10:9}>
                              <div className="historial-inner">
                                {(r.creadoPor || r.creadoEn) && (
                                  <div style={{fontSize:11,color:'#6b7280',marginBottom:8}}>
                                    Registrado por <strong>{r.creadoPor || 'desconocido'}</strong>
                                    {r.creadoEn && <> · {new Date(r.creadoEn).toLocaleString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</>}
                                  </div>
                                )}
                                <div className="hist-label">Historial de asignaciones — N1: {r.n1}</div>
                                {(() => {
                                  const hist = r.historial||[]
                                  const cola = hist.filter(h => h.asesor && h.tipo!=='TIPIF_BACK' && h.tipo!=='DERIVADO' && h.tipo!=='TIPIF_VEND')
                                  const retiros = hist.filter(h => h?.tipo === 'QUITAR_ASIGNACION')
                                  return (<>
                                    {!cola.length
                                      ? <div style={{fontSize:11,color:'#ccc'}}>Sin historial.</div>
                                      : cola.map((h,ci)=>{
                                        const sig = cola[ci+1]
                                        const tipif = ci===cola.length-1
                                          ? (r._tipifVend || '')
                                          : (sig && sig.tipifVendAntes!=null ? sig.tipifVendAntes : '')
                                        const asignadoPor = h.tipo==='ROTACION'
                                          ? (h.rotadoPor || '—')
                                          : (h.reasignadoPor || h.motivo || '—')
                                        const nombreAsesor = String(h.asesor||'').trim().toUpperCase()
                                        const tipsAsesor = hist
                                          .filter(t => t?.tipo==='TIPIF_VEND' && String(t.asesor||'').trim().toUpperCase()===nombreAsesor)
                                          .sort((a,b)=>(a.ts||0)-(b.ts||0))
                                        return (
                                          <div key={ci} className="hist-item" style={{alignItems:'flex-start'}}>
                                            <div className="hist-dot" style={{background:DOT_COLORS[ci%DOT_COLORS.length],marginTop:4}} />
                                            <div style={{lineHeight:1.5}}>
                                              <div><strong>{h.asesor||'—'}</strong> <span className="hora-cell">{h.hora||'—'}</span> <span style={{color:'#9ca3af'}}>{h.fecha||''}</span></div>
                                              <div style={{display:'flex',flexWrap:'wrap',gap:'4px 14px',margin:'2px 0'}}>
                                                {tipsAsesor.length ? tipsAsesor.map((t,ti)=>(
                                                  <span key={ti} style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,whiteSpace:'nowrap'}}>
                                                    <span style={{color:'#9ca3af',fontFamily:'monospace'}}>{t.hora||'—'}{t.fecha?` · ${t.fecha}`:''}</span>
                                                    <strong style={{color:'#065f46'}}>{labelTipifVend(t.tipif)||'—'}</strong>
                                                  </span>
                                                )) : <span style={{fontSize:11}}>Tipificación: <strong style={{color:'#065f46'}}>{labelTipifVend(tipif)||'—'}</strong></span>}
                                              </div>
                                              <div style={{fontSize:11,color:'#6b7280'}}>Asignado por: {asignadoPor}</div>
                                            </div>
                                          </div>
                                        )
                                      })
                                    }
                                    {retiros.map((h,ri)=>(
                                      <div key={`retiro-${ri}`} style={{fontSize:11,color:'#991b1b',marginTop:8,padding:'6px 8px',background:'#fef2f2',borderRadius:6,borderLeft:'3px solid #ef4444'}}>
                                        <strong>{h.quitadoPor || 'Usuario'}</strong> quitó la asignación de <strong>{h.asesorQuitado || '—'}</strong>
                                        {h.hora ? ` · ${h.hora}` : ''}{h.fecha ? ` · ${h.fecha}` : ''}
                                      </div>
                                    ))}
                                  </>)
                                })()}
                                <div style={{marginTop:10, textAlign:'right'}}>
                                  <button type="button"
                                    onClick={()=>{ if(window.confirm(`¿Eliminar el número ${r.n1}? Se borrará por completo y no se puede deshacer.`)) eliminarReg(r.id) }}
                                    style={{fontSize:11, padding:'4px 12px', border:'1px solid #ef4444', color:'#ef4444', background:'#fff', borderRadius:6, cursor:'pointer', fontWeight:600}}>
                                    Eliminar número
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ]
                      })
                  }
                </tbody>
              </table>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8,padding:'10px 2px'}}>
              <div className="paginacion-info">
                Mostrando {registrosFiltrados.length ? baseDesde + 1 : 0}–{Math.min(baseDesde + basePageSize, registrosFiltrados.length)} de {registrosFiltrados.length}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <select className="select-por-pagina" value={basePageSize} onChange={e=>setBasePageSize(Number(e.target.value))} aria-label="Registros por página">
                  {[10,25,50,100].map(n=><option key={n} value={n}>{n} / pág.</option>)}
                </select>
                <button className="fnav-btn" disabled={basePageSafe<=1} onClick={()=>setBasePage(p=>Math.max(1,p-1))}>‹</button>
                <span className="paginacion-info">Página {basePageSafe} de {baseTotalPages}</span>
                <button className="fnav-btn" disabled={basePageSafe>=baseTotalPages} onClick={()=>setBasePage(p=>Math.min(baseTotalPages,p+1))}>›</button>
              </div>
            </div>
            <div style={{borderTop:'1px solid #e5e7eb',padding:'12px 14px',background:'#f8fafc'}}>
              <div style={{fontSize:10,fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:.5,marginBottom:8}}>
                Registros protegidos — no participan en filtros ni rotación normal
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button type="button" onClick={()=>setGrupoAceptaVisible(v=>!v)}
                  style={{border:'1px solid #16a34a',color:grupoAceptaVisible?'#fff':'#16a34a',background:grupoAceptaVisible?'#16a34a':'#fff',borderRadius:8,padding:'7px 11px',fontSize:11,fontWeight:800,cursor:'pointer'}}>
                  {grupoAceptaVisible?'Ocultar':'Ver'} ACEPTA PROPUESTA ({grupoAceptaPropuesta.length})
                </button>
                {grupoAceptaVisible && <button type="button" onClick={()=>setGrupoAceptaVisible(false)} className="bo-btn-limpiar btn btn-sm">Volver a la base</button>}
              </div>
            </div>
          </section>

          {/* ══ SECCIÓN: RECLUTADOS ═════════════════════════════════════════════ */}
          <section className={`bo-seccion${seccion==='reclutados'?'':' hidden'}`}>
            <div className="bo-seccion-header">
              <div>
                <h2>Reclutados generales</h2>
                <p className="bo-sub">Consolidado de postulantes reclutados por todos los asesores.</p>
              </div>
              <div className="reclutados-head-actions">
                <span className="reclutados-count">{reclutados.length} registros</span>
                <button type="button" className="reclutados-refresh" onClick={cargarReclutados}>↻ Actualizar</button>
              </div>
            </div>
            <div className="base-tabla-wrap reclutados-tabla-wrap">
              <table className="base-tabla reclutados-tabla">
                <thead>
                  <tr>
                    <th>Fecha</th><th>Nombre y Apellidos</th><th>Tipo Doc.</th>
                    <th>Documento</th><th>Teléfono</th><th>Distrito</th><th>Puesto</th>
                    <th>Campaña</th><th>Empresa</th><th>Reclutador</th><th>Estado</th><th>Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoReclutados ? (
                    <tr><td colSpan="12" className="reclutados-empty">Cargando reclutados...</td></tr>
                  ) : reclutados.length === 0 ? (
                    <tr><td colSpan="12" className="reclutados-empty">Sin postulantes reclutados aún.</td></tr>
                  ) : reclutados.map((v, i) => (
                    <tr key={v.id || i}>
                      <td>{normalizarFecha(v.created_at) || '—'}</td>
                      <td className="reclutados-nombre">{v.nombre || '—'}</td>
                      <td>{v.tipo_doc || 'DNI'}</td>
                      <td className="reclutados-documento">{v.dni || '—'}</td>
                      <td>{v.telefono1 || '—'}</td>
                      <td>{v.distrito || '—'}</td>
                      <td>{v.puesto || '—'}</td>
                      <td>{v.fuente || v.campana || '—'}</td>
                      <td>{v.empresa || '—'}</td>
                      <td className="reclutados-reclutador">{v.usuario_nombre || '—'}</td>
                      <td><span className="reclutados-estado">{v.estado_reclutamiento || '—'}</span></td>
                      <td>{v.observacion || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ══ SECCIÓN: CARGA MASIVA ══════════════════════════════════════════ */}
          <section className={`bo-seccion${seccion==='carga-masiva'?'':' hidden'}`}>
            <div className="bo-seccion-header">
              <div>
                <h2>Carga Masiva de Base</h2>
                <p className="bo-sub">Pega números directamente · importa CSV/TXT · o usa tu sistema antiguo</p>
              </div>
            </div>

            {/* Date nav carga masiva */}
            <div className="fecha-nav-row" style={{marginBottom:16}}>
              <span style={{fontSize:11,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:.4,whiteSpace:'nowrap'}}>Fecha activa:</span>
              <div className="fecha-nav-ctrl">
                <button className="fnav-btn" onClick={()=>navegarFecha(-1)} disabled={prevDis}>←</button>
                <select className="fnav-select" value={fechaActiva} onChange={e=>setFechaActiva(e.target.value)}>
                  {fechaPestanas.map(f=><option key={f} value={f}>{formatFecha(f)} ({(baseData[f]||[]).length})</option>)}
                </select>
                <button className="fnav-btn" onClick={()=>navegarFecha(1)} disabled={nextDis}>→</button>
              </div>
              <span className="fnav-count">{idx+1} / {fechaPestanas.length}</span>
              <div className="fecha-add-wrap">
                <input type="date" value={cmCalPicker} onChange={e=>setCmCalPicker(e.target.value)} className="fecha-add-input" />
                <button className="fecha-add-btn" onClick={agregarFechaCargaMasiva}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Agregar fecha
                </button>
              </div>
            </div>

            <div className="bo-panel" style={{marginBottom:14}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:8}}>
                <div className="bo-panel-title" style={{marginBottom:0}}>Selecciona el método de importación</div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <button className={`btn-tab-carga${cargaTab==='pegar'?' active':''}`} onClick={()=>{ setCargaTab('pegar'); sessionStorage.setItem('nc_backoffice_carga_tab','pegar') }}>Pegar números</button>
                  <button className={`btn-tab-carga${cargaTab==='archivo'?' active':''}`} onClick={()=>{ setCargaTab('archivo'); sessionStorage.setItem('nc_backoffice_carga_tab','archivo') }}>Subir CSV / TXT</button>
                  <button className={`btn-tab-carga${cargaTab==='legacy'?' active':''}`} style={{background:'#fff7ed',color:'#c2410c',borderColor:'#fed7aa'}} onClick={()=>{ setCargaTab('legacy'); sessionStorage.setItem('nc_backoffice_carga_tab','legacy') }}>Sistema antiguo</button>
                </div>
              </div>

              {/* TAB: Pegar */}
              {cargaTab === 'pegar' && (
                <div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,marginBottom:10}}>
                    <div className="bo-input-group" style={{margin:0}}>
                      <label>Pegar lista de N1 (uno por línea, o separados por coma)</label>
                      <textarea value={masivaNums} onChange={e=>setMasivaNums(e.target.value)} rows={8} placeholder={'987654321\n976543210\nusuario_whatsapp_sin_numero'} />
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:8,minWidth:160}}>
                      <div className="bo-input-group" style={{margin:0}}><label>Campaña</label><CampanaSelect value={masivaCamp} onChange={setMasivaCamp} plain /></div>
                      <div className="bo-input-group" style={{margin:0}}><label>Asesor (opcional)</label>
                        <AsesorBuscador value={masivaAsesor} asesores={asesores}
                          onChange={v=>setMasivaAsesor(v)}
                          className="form-select" placeholderText="— Sin asignar —" emptyLabel="— Sin asignar —" />
                      </div>
                      <div className="bo-input-group" style={{margin:0}}><label>Lote máx.</label>
                        <select value={masivaLote} onChange={e=>{ setMasivaLote(e.target.value); if(masivaFilas.length) previsualizarMasiva() }}>
                          <option value="10">10 por lote</option><option value="25">25 por lote</option>
                          <option value="50">50 por lote</option><option value="0">Todos</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <button className="btn-masiva-preview" onClick={previsualizarMasiva}>Vista previa</button>
                    <button className="btn-masiva-go" onClick={ejecutarCargaMasiva} disabled={masivaFilasParaCargar.length===0}>Cargar {masivaFilasParaCargar.length} registros</button>
                  </div>
                  {masivaFilas.length > 0 && (
                    <>
                      {masivaNDup > 0 && (
                        <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#92400e',marginTop:10}}>
                          Se detectaron <strong>{masivaNDup} duplicados</strong>. <strong>{masivaFilasCnt-masivaNDup} números nuevos</strong>.<br/>
                          <label style={{display:'inline-flex',alignItems:'center',gap:6,marginTop:6,cursor:'pointer',fontSize:11,color:'#374151'}}>
                            <input type="checkbox" checked={inclDup} onChange={e=>setInclDup(e.target.checked)} /> Cargar tambien los duplicados
                          </label>
                        </div>
                      )}
                      {masivaNDup === 0 && <div style={{color:'#15803d',fontWeight:600,fontSize:12,marginTop:10}}>{masivaFilasCnt} números nuevos, sin duplicados.</div>}
                      <div style={{marginTop:10,maxHeight:200,overflowY:'auto',border:'1px solid #e5e7eb',borderRadius:8,background:'#fff'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                          <thead><tr style={{background:'#f9fafb'}}>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>#</th>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>N1 / Usuario</th>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>Campaña</th>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>Fecha</th>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>Estado</th>
                          </tr></thead>
                          <tbody>
                            {masivaFilas.map((f,i)=>(
                              <tr key={i} style={{borderBottom:'1px solid #f3f4f6',background:f.dup?'#fef2f2':''}}>
                                <td style={{padding:'5px 10px',color:'#9ca3af'}}>{i+1}</td>
                                <td style={{padding:'5px 10px',fontFamily:'monospace',fontWeight:600}}>{f.esNumero ? f.n1 : `@${f.usuarioWhatsapp}`}</td>
                                <td style={{padding:'5px 10px',color:'#374151'}}>{masivaCamp||'—'}</td>
                                <td style={{padding:'5px 10px',color:'#374151'}}>{formatFecha(fechaActiva)}</td>
                                <td style={{padding:'5px 10px'}}>
                                  {f.dup
                                    ? <><span style={{background:'#fee2e2',color:'#991b1b',fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:99}}>DUPLICADO</span> <span style={{fontSize:9,color:'#b91c1c'}}>{f.motivo}</span></>
                                    : <span style={{background:'#dcfce7',color:'#15803d',fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:99}}>NUEVO</span>
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB: Archivo */}
              {cargaTab === 'archivo' && (
                <div>
                  <div
                    onClick={()=>archivoInputRef.current?.click()}
                    onDragOver={e=>{ e.preventDefault(); setDragOver(true) }}
                    onDragLeave={()=>setDragOver(false)}
                    onDrop={e=>{ e.preventDefault(); setDragOver(false); if(e.dataTransfer.files.length) procesarArchivo(e.dataTransfer.files[0]) }}
                    style={{border:`2px dashed ${dragOver?'#111827':'#d1d5db'}`,borderRadius:10,padding:36,textAlign:'center',cursor:'pointer',background:dragOver?'#f9fafb':'#fff',transition:'all .18s'}}
                  >
                    <div style={{fontSize:14,fontWeight:600,color:'#374151',marginBottom:4}}>Arrastra tu archivo aquí o haz clic</div>
                    <div style={{fontSize:12,color:'#9ca3af'}}>Acepta CSV · TXT — columnas: N1, N2, Campaña, Distrito, Tipif</div>
                    <input ref={archivoInputRef} type="file" accept=".csv,.txt" style={{display:'none'}} onChange={e=>{ if(e.target.files.length) procesarArchivo(e.target.files[0]) }} />
                  </div>
                  {archivoStatus && <div style={{marginTop:10,fontSize:12,color:'#6b7280'}}>{archivoStatus}</div>}
                  {archivoRows.length > 0 && (
                    <div style={{marginTop:10}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>{archivoInfo}</span>
                        <button className="btn-masiva-go" onClick={ejecutarCargaArchivo}>Cargar {archivoRows.length} registros</button>
                      </div>
                      <div style={{maxHeight:200,overflowY:'auto',border:'1px solid #e5e7eb',borderRadius:8,background:'#fff'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                          <thead><tr style={{background:'#f9fafb',position:'sticky',top:0}}>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>#</th>
                            <th style={{padding:'6px 10px',color:'#6b7280',fontSize:9,textTransform:'uppercase',textAlign:'left'}}>N1</th>
                            <th style={{padding:'6px 10px',color:'#6b7280',fontSize:9,textTransform:'uppercase',textAlign:'left'}}>Campaña</th>
                            <th style={{padding:'6px 10px',color:'#6b7280',fontSize:9,textTransform:'uppercase',textAlign:'left'}}>Distrito</th>
                            <th style={{padding:'6px 10px',color:'#6b7280',fontSize:9,textTransform:'uppercase',textAlign:'left'}}>Tipif.</th>
                          </tr></thead>
                          <tbody>
                            {archivoRows.slice(0,50).map((r,i)=>(
                              <tr key={i} style={{borderBottom:'1px solid #f3f4f6'}}>
                                <td style={{padding:'5px 10px',color:'#9ca3af'}}>{i+1}</td>
                                <td style={{padding:'5px 10px',fontFamily:'monospace',fontWeight:600}}>{r.n1}</td>
                                <td style={{padding:'5px 10px'}}>{r.camp}</td>
                                <td style={{padding:'5px 10px'}}>{r.dist}</td>
                                <td style={{padding:'5px 10px'}}>{r.tipif||'—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Legacy */}
              {cargaTab === 'legacy' && (
                <div>
                  <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:10,padding:14,marginBottom:14}}>
                    <div style={{fontSize:12,fontWeight:700,color:'#c2410c',marginBottom:4}}>Importación de sistema antiguo</div>
                    <div style={{fontSize:11,color:'#92400e',lineHeight:1.6}}>
                      Formato: <strong>CAMPAÑA · FECHA · CONTACTO · OBSERVACIONES · TIPIFICACIÓN · HORA · ASESOR 1 · ... · ASESOR 6</strong>
                      <br/>Contacto acepta número o usuario de WhatsApp (con o sin @). Fecha en formato DD/MM/AAAA.
                      <br/>Acepta subir el .xlsx directamente (usa la primera hoja), o .csv/.txt.
                    </div>
                  </div>
                  <button
                    onClick={descargarFormatoLegacy}
                    style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'14px 20px',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer',marginBottom:14,letterSpacing:.2}}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    DESCARGAR PLANTILLA EXCEL DE EJEMPLO
                  </button>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 180px',gap:12,marginBottom:12}}>
                    <div
                      onClick={()=>legacyInputRef.current?.click()}
                      onDragOver={e=>{ e.preventDefault(); setLegacyDragOver(true) }}
                      onDragLeave={()=>setLegacyDragOver(false)}
                      onDrop={e=>{ e.preventDefault(); setLegacyDragOver(false); if(e.dataTransfer.files.length) procesarLegacy(e.dataTransfer.files[0]) }}
                      style={{border:`2px dashed ${legacyDragOver?'#c2410c':'#fed7aa'}`,borderRadius:10,padding:28,textAlign:'center',cursor:'pointer',background:legacyDragOver?'#fff7ed':'#fff'}}
                    >
                      <div style={{fontSize:13,fontWeight:600,color:'#374151',marginBottom:3}}>Arrastra tu base o haz clic</div>
                      <div style={{fontSize:11,color:'#9ca3af'}}>CSV exportado desde tu sistema anterior</div>
                      <input ref={legacyInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{display:'none'}} onChange={e=>{ if(e.target.files.length) procesarLegacy(e.target.files[0]) }} />
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      <div className="bo-input-group" style={{margin:0}}><label>Fecha destino</label>
                        <select value={legacyFecha} onChange={e=>setLegacyFecha(e.target.value)} style={{fontSize:12,padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontFamily:'inherit',background:'#fff'}}>
                          {fechaPestanas.map(f=><option key={f} value={f}>{formatFecha(f)}</option>)}
                        </select>
                      </div>
                      <div className="bo-input-group" style={{margin:0}}><label>Fecha de la fila</label>
                        <select value={legacyUsarFecha} onChange={e=>setLegacyUsarFecha(e.target.value)} style={{fontSize:12,padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontFamily:'inherit',background:'#fff'}}>
                          <option value="no">Usar fecha seleccionada</option>
                          <option value="si">Leer fecha de la fila</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  {legacyStatus && <div style={{fontSize:12,color:'#6b7280',marginBottom:8}}>{legacyStatus}</div>}
                  {legacyRows.length > 0 && (
                    <div>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6,flexWrap:'wrap',gap:8}}>
                        <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>{legacyInfo}</span>
                        <div style={{display:'flex',gap:6}}>
                          <button className="btn-masiva-preview" onClick={()=>setLegacyRows([])}>Cancelar</button>
                          <button className="btn-masiva-go" onClick={ejecutarCargaLegacy} style={{background:'#c2410c'}}>Importar {legacyRows.length} registros</button>
                        </div>
                      </div>
                      <div style={{maxHeight:200,overflowY:'auto',border:'1px solid #e5e7eb',borderRadius:8,background:'#fff'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,whiteSpace:'nowrap'}}>
                          <thead><tr style={{background:'#f9fafb',position:'sticky',top:0}}>
                            {['#','Camp.','Contacto','Observaciones','Tipif.','Hora','Asesores','Fecha'].map(h=>(
                              <th key={h} style={{padding:'5px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {legacyRows.slice(0,60).map((r,i)=>(
                              <tr key={i} style={{borderBottom:'1px solid #f3f4f6'}}>
                                <td style={{padding:'4px 10px',color:'#9ca3af'}}>{i+1}</td>
                                <td style={{padding:'4px 10px',fontWeight:600}}>{r.campana}</td>
                                <td style={{padding:'4px 10px',fontFamily:'monospace',fontWeight:700,color:'#111827'}}>{r.esNumero ? r.n1 : `@${r.usuarioWhatsapp}`}</td>
                                <td style={{padding:'4px 10px',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={r.obs}>{r.obs||'—'}</td>
                                <td style={{padding:'4px 10px'}}>{r.tipifBack||'—'}</td>
                                <td style={{padding:'4px 10px',color:'#185FA5',fontWeight:600}}>{r.hora||'—'}</td>
                                <td style={{padding:'4px 10px',color:'#6b7280'}}>{r.asesores.join(' → ')||'—'}</td>
                                <td style={{padding:'4px 10px',color:'#374151'}}>{formatFecha(r.fecha)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ══ SECCIÓN: ENTREVISTAS ═══════════════════════════════════════════ */}
          <section className={`bo-seccion${seccion==='entrevistas'?'':' hidden'}`}>
            <div className="bo-seccion-header">
              <div>
                <h2>Entrevistas agendadas</h2>
                <p className="bo-sub">Postulantes que aceptaron la propuesta y programaron entrevista.</p>
              </div>
              <div className="reclutados-head-actions">
                <span className="reclutados-count">{entrevistasFiltradas.length} registros</span>
                <button type="button" className="reclutados-refresh" onClick={cargarEntrevistas}>↻ Actualizar</button>
              </div>
            </div>

            <div className="filtros-grid" style={{marginBottom:14}}>
              <div className="bo-input-group"><label>Buscar</label><input className="form-control" value={filtrosEntrevistas.busqueda} onChange={e=>setFiltrosEntrevistas(p=>({...p,busqueda:e.target.value}))} placeholder="Postulante, número o campaña…" /></div>
              <div className="bo-input-group"><label>Desde</label><input type="date" className="form-control" value={filtrosEntrevistas.desde} onChange={e=>setFiltrosEntrevistas(p=>({...p,desde:e.target.value}))} /></div>
              <div className="bo-input-group"><label>Hasta</label><input type="date" className="form-control" value={filtrosEntrevistas.hasta} onChange={e=>setFiltrosEntrevistas(p=>({...p,hasta:e.target.value}))} /></div>
            </div>

            <div className="base-tabla-wrap reclutados-tabla-wrap">
              <table className="base-tabla reclutados-tabla">
                <thead>
                  <tr>
                    <th>Fecha de registro</th>
                    <th><FiltroEncabezado label="Campaña" value={filtrosEntrevistas.campanas} options={campanasEntrevistaOpciones} searchable
                      onChange={campanas=>setFiltrosEntrevistas(p=>({...p,campanas}))} /></th>
                    <th><FiltroEncabezado label="Agendado por" value={filtrosEntrevistas.agendadoPor} options={agendadoPorOpciones} searchable
                      onChange={agendadoPor=>setFiltrosEntrevistas(p=>({...p,agendadoPor}))} /></th>
                    <th><FiltroEncabezado label="Turno" value={filtrosEntrevistas.turnos} options={turnosEntrevistaOpciones}
                      onChange={turnos=>setFiltrosEntrevistas(p=>({...p,turnos}))} /></th>
                    <th>Postulante</th><th>Número</th><th>Número ref</th>
                    <th>Fecha de agendamiento</th><th>Fecha de entrevista</th>
                    <th><FiltroEncabezado label="Tipificación" value={filtrosEntrevistas.tipificaciones} options={tipificacionesEntrevistaOpciones} pending
                      onChange={tipificaciones=>setFiltrosEntrevistas(p=>({...p,tipificaciones}))} /></th>
                    <th>Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoEntrevistas ? (
                    <tr><td colSpan="11" className="reclutados-empty">Cargando entrevistas...</td></tr>
                  ) : entrevistasFiltradas.length === 0 ? (
                    <tr><td colSpan="11" className="reclutados-empty">Sin entrevistas agendadas.</td></tr>
                  ) : entrevistasPagina.map(en => (
                    <tr key={en.id}>
                      <td>{normalizarFecha(en.created_at) || '—'}</td>
                      <td><CampanaBadge valor={en.campana} /></td>
                      <td className="reclutados-reclutador entrevistas-agendado-negro">{en.creado_por_nombre || '—'}</td>
                      <td>{en.turno}</td>
                      <td className="reclutados-nombre">{en.nombre_postulante}</td>
                      <td>{en.numero}</td>
                      <td>{en.numero_ref || '—'}</td>
                      <td>{formatFecha(String(en.fecha_agendamiento).slice(0,10))}</td>
                      <td><input type="date" className="form-control" defaultValue={String(en.fecha_entrevista||'').slice(0,10)} onBlur={e=>guardarFechaEntrevista(en.id, String(en.fecha_entrevista||'').slice(0,10), e.target.value)} style={{fontSize:11,padding:'5px 8px',minWidth:130}} /></td>
                      <td>
                        <select value={en.tipificacion||''} onChange={e=>guardarTipifEntrevista(en.id,e.target.value)} style={estiloTipifEntrevista(en.tipificacion)}>
                          <option value="" style={{background:'#fff',color:'#111827',fontWeight:400}}>— Pendiente —</option>
                          {TIPIF_ENTREVISTA_OPCIONES.map(t=><option key={t} value={t} style={{background:'#fff',color:'#111827',fontWeight:400}}>{t}</option>)}
                        </select>
                      </td>
                      <td><input className="form-control" defaultValue={en.observacion||''} onBlur={e=>guardarObservacionEntrevista(en.id, en.observacion||'', e.target.value.trim())} placeholder="Comentario…" style={{minWidth:160,fontSize:11}} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8,padding:'10px 2px'}}>
              <div className="paginacion-info">
                Mostrando {entrevistasFiltradas.length ? entrevistasDesde + 1 : 0}–{Math.min(entrevistasDesde + entrevistasPageSize, entrevistasFiltradas.length)} de {entrevistasFiltradas.length}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <select className="select-por-pagina" value={entrevistasPageSize} onChange={e=>setEntrevistasPageSize(Number(e.target.value))} aria-label="Entrevistas por página">
                  {[10,25,50,100].map(n=><option key={n} value={n}>{n} / pág.</option>)}
                </select>
                <button type="button" className="fnav-btn" disabled={entrevistasPageSafe<=1} onClick={()=>setEntrevistasPage(p=>Math.max(1,p-1))}>‹</button>
                <span className="paginacion-info">Página {entrevistasPageSafe} de {entrevistasTotalPages}</span>
                <button type="button" className="fnav-btn" disabled={entrevistasPageSafe>=entrevistasTotalPages} onClick={()=>setEntrevistasPage(p=>Math.min(entrevistasTotalPages,p+1))}>›</button>
              </div>
            </div>
          </section>

          {/* ══ SECCIÓN: CAPACITACIÓN ══════════════════════════════════════════ */}
          <section className={`bo-seccion${seccion==='capacitacion'?'':' hidden'}`}>
            <div className="bo-seccion-header">
              <div>
                <h2>Capacitación</h2>
                <p className="bo-sub">Postulantes que asistieron a la entrevista y arrancan capacitación.</p>
              </div>
              <div className="reclutados-head-actions">
                <span className="reclutados-count">{capacitacionesFiltradas.length} registros</span>
                <button type="button" className="reclutados-refresh" onClick={cargarCapacitaciones}>↻ Actualizar</button>
              </div>
            </div>

            <div className="filtros-grid" style={{marginBottom:14}}>
              <div className="bo-input-group"><label>Buscar</label><input className="form-control" value={filtrosCapacitacion.busqueda} onChange={e=>setFiltrosCapacitacion(p=>({...p,busqueda:e.target.value}))} placeholder="Postulante, número o campaña…" /></div>
              <div className="bo-input-group"><label>Desde</label><input type="date" className="form-control" value={filtrosCapacitacion.desde} onChange={e=>setFiltrosCapacitacion(p=>({...p,desde:e.target.value}))} /></div>
              <div className="bo-input-group"><label>Hasta</label><input type="date" className="form-control" value={filtrosCapacitacion.hasta} onChange={e=>setFiltrosCapacitacion(p=>({...p,hasta:e.target.value}))} /></div>
            </div>

            <div className="base-tabla-wrap reclutados-tabla-wrap">
              <table className="base-tabla reclutados-tabla">
                <thead>
                  <tr>
                    <th>Campaña</th><th>Registrado por</th><th>Agendado por</th><th>Postulante</th><th>Número</th>
                    <th>Fecha de inicio</th><th>Fecha de inicio (capacitador)</th>
                    <th>Día 1</th><th>Día 2</th><th>Día 3</th><th>Día 4</th><th>Día 5</th>
                    <th>Sala</th><th>Tipificación final</th>
                    <th>Historial</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoCapacitaciones ? (
                    <tr><td colSpan="15" className="reclutados-empty">Cargando capacitaciones...</td></tr>
                  ) : capacitacionesFiltradas.length === 0 ? (
                    <tr><td colSpan="15" className="reclutados-empty">Sin postulantes en capacitación.</td></tr>
                  ) : capacitacionesFiltradas.flatMap(c => ([
                    <tr key={c.id}>
                      <td><CampanaBadge valor={c.campana} /></td>
                      <td className="reclutados-reclutador">{c.creado_por_nombre || '—'}</td>
                      <td className="reclutados-reclutador entrevistas-agendado-negro">{c.agendado_por_nombre || '—'}</td>
                      <td className="reclutados-nombre">{c.nombre_postulante}</td>
                      <td>{c.numero}</td>
                      <td>{formatFecha(String(c.fecha_inicio_capacitacion).slice(0,10))}</td>
                      <td><input type="date" className="form-control" defaultValue={String(c.fecha_inicio_capacitador||'').slice(0,10)} onBlur={e=>guardarCampoCapacitacion(c.id,'fecha_inicio_capacitador', String(c.fecha_inicio_capacitador||'').slice(0,10), e.target.value)} style={{fontSize:11,padding:'5px 8px',minWidth:130}} /></td>
                      {['dia1_tipif','dia2_tipif','dia3_tipif','dia4_tipif','dia5_tipif'].map(campo => (
                        <td key={campo}>
                          <select value={c[campo]||''} onChange={e=>guardarCampoCapacitacion(c.id,campo,c[campo]||'',e.target.value)} style={estiloTipifEntrevista(c[campo])}>
                            <option value="" style={{background:'#fff',color:'#111827',fontWeight:400}}>—</option>
                            {TIPIF_DIA_CAPACITACION_OPCIONES.map(t=><option key={t} value={t} style={{background:'#fff',color:'#111827',fontWeight:400}}>{t}</option>)}
                          </select>
                        </td>
                      ))}
                      <td>
                        <select value={c.sala||''} onChange={e=>guardarCampoCapacitacion(c.id,'sala',c.sala||'',e.target.value)} style={{fontSize:11,padding:'4px 6px',borderRadius:6,fontFamily:'inherit',maxWidth:120,cursor:'pointer',border:'1px solid #e5e7eb',background:'#fff'}}>
                          <option value="">— Selecciona —</option>
                          {SALAS_CAPACITACION.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={c.tipificacion_final||''} onChange={e=>{ const v=e.target.value; if (v==='ALTA' && c.tipificacion_final!=='ALTA') abrirModalAlta(c.id); else guardarCampoCapacitacion(c.id,'tipificacion_final',c.tipificacion_final||'',v) }} style={estiloTipifFinalCapacitacion(c.tipificacion_final)}>
                          <option value="" style={{background:'#fff',color:'#111827',fontWeight:400}}>— Pendiente —</option>
                          {TIPIF_FINAL_CAPACITACION_OPCIONES.map(t=><option key={t} value={t} style={{background:'#fff',color:'#111827',fontWeight:400}}>{t}</option>)}
                        </select>
                      </td>
                      <td>
                        <button type="button" className="btn-hist btn-hist-sm" onClick={()=>setHistOpenCapacitacion(p=>({...p,[c.id]:!p[c.id]}))} title="Historial">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </button>
                      </td>
                    </tr>,
                    <tr key={`hist-cap-${c.id}`} className={`historial-row${histOpenCapacitacion[c.id]?' open':''}`}>
                      <td colSpan={15}>
                        <div className="historial-inner">
                          <div className="hist-label">Trazabilidad — {c.nombre_postulante}</div>
                          {!(c.historial||[]).length
                            ? <div style={{fontSize:11,color:'#ccc'}}>Sin cambios registrados.</div>
                            : (c.historial||[]).slice().reverse().map((h,hi)=>(
                              <div key={hi} className="hist-item" style={{alignItems:'flex-start'}}>
                                <div className="hist-dot" style={{background:DOT_COLORS[hi%DOT_COLORS.length],marginTop:4}} />
                                <div style={{lineHeight:1.5}}>
                                  <div><strong>{CAMPOS_CAPACITACION_LABELS[h.campo]||h.campo}</strong> <span className="hora-cell">{h.hora||'—'}</span> <span style={{color:'#9ca3af'}}>{h.fecha||''}</span></div>
                                  <div style={{fontSize:11}}>{h.valor_anterior || '— Pendiente —'} <span style={{color:'#9ca3af'}}>→</span> <strong style={{color:'#065f46'}}>{h.valor_nuevo || '— Pendiente —'}</strong></div>
                                  <div style={{fontSize:11,color:'#6b7280'}}>Modificado por: {h.usuario_nombre||'—'}</div>
                                </div>
                              </div>
                            ))
                          }
                        </div>
                      </td>
                    </tr>,
                  ]))}
                </tbody>
              </table>
            </div>
          </section>


        </main>
      </div>

      {/* ══ MODAL COMENTARIO (No cumple el perfil / Provincia / No interesado) ══ */}
      {modalComentarioTipif.open && (
        <div className="modal-overlay open" onClick={e=>{ if(e.target===e.currentTarget && !modalComentarioTipif.guardando) setModalComentarioTipif(p=>({...p,open:false})) }}>
          <div className="modal-box">
            <h3>Comentario</h3>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Comentario</label><textarea className="form-control" rows={3} value={modalComentarioTipif.comentario} onChange={e=>setModalComentarioTipif(p=>({...p,comentario:e.target.value}))} placeholder="Motivo de la tipificación…" /></div>
            {modalComentarioTipif.error && <p style={{color:'#dc2626',fontSize:12,margin:'0 0 10px'}}>{modalComentarioTipif.error}</p>}
            <div className="modal-btns">
              <button className="btn-cancelar-modal" onClick={()=>setModalComentarioTipif(p=>({...p,open:false}))} disabled={modalComentarioTipif.guardando}>Cancelar</button>
              <button className="btn-confirmar-modal" onClick={guardarComentarioTipif} disabled={modalComentarioTipif.guardando}>{modalComentarioTipif.guardando?'Guardando…':'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ROTACIÓN MANUAL ════════════════════════════════════════════ */}
      {modalRotar.open && (
        <div className="modal-overlay open" onClick={e=>{ if(e.target===e.currentTarget) setModalRotar(p=>({...p,open:false})) }}>
          <div className="modal-box">
            <h3>Rotar lead manualmente</h3>
            <p>{modalRotar.desc}</p>
            {(() => {
              const disponibles = asesores.filter(a => a.nombre !== modalRotar.asesorActual)
              const filtrados = disponibles.filter(a => (a.nombre||'').toLowerCase().includes(rotBusqueda.trim().toLowerCase()))
              return (
                <div style={{border:`1px solid ${rotModalAsesor?'#e5e7eb':'#ef4444'}`, borderRadius:10, padding:8, marginBottom:10}}>
                  <div style={{display:'flex', alignItems:'center', gap:6, border:'1px solid #e5e7eb', borderRadius:8, padding:'6px 8px'}}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input autoFocus value={rotBusqueda} onChange={e=>setRotBusqueda(e.target.value)} placeholder="Buscar asesor…"
                      onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); if(filtrados[0]) setRotModalAsesor(filtrados[0].nombre) } }}
                      style={{border:'none', outline:'none', flex:1, fontSize:13, background:'transparent'}} />
                  </div>
                  <div style={{maxHeight:170, overflowY:'auto', marginTop:6}}>
                    {filtrados.map(a=>(
                      <div key={a.id} onClick={()=>setRotModalAsesor(a.nombre)}
                        style={{padding:'7px 9px', cursor:'pointer', fontSize:13, borderRadius:7, fontWeight:a.nombre===rotModalAsesor?700:400, background:a.nombre===rotModalAsesor?'#fef2f2':'transparent', color:a.nombre===rotModalAsesor?'#b91c1c':'#111827'}}>
                        {a.nombre}
                      </div>
                    ))}
                    {filtrados.length===0 && <div style={{padding:'8px 9px', fontSize:12, color:'#9ca3af'}}>Sin resultados</div>}
                  </div>
                </div>
              )
            })()}
            <textarea value={rotModalMotivo} onChange={e=>setRotModalMotivo(e.target.value)} placeholder="Motivo de la rotación (opcional)..." />
            <div className="modal-btns">
              <button className="btn-cancelar-modal" onClick={()=>setModalRotar(p=>({...p,open:false}))}>Cancelar</button>
              <button className="btn-confirmar-modal" onClick={confirmarRotacion} disabled={!rotModalAsesor}>Rotar ahora</button>
            </div>
          </div>
        </div>
      )}

      {modalEditar.open && (
        <div className="modal-overlay open" onClick={e=>{ if(e.target===e.currentTarget && !modalEditar.guardando) setModalEditar(p=>({...p,open:false})) }}>
          <div className="modal-box">
            <h3>{modalEditar.modo==='campana' ? 'Editar campaña' : 'Editar contacto'}</h3>
            {modalEditar.modo==='campana' && (
              <div className="bo-input-group" style={{marginBottom:10}}><label>Campaña</label><CampanaSelect value={modalEditar.campana} onChange={v=>setModalEditar(p=>({...p,campana:v}))} /></div>
            )}
            {modalEditar.modo==='contacto' && (<>
              <div className="bo-input-group" style={{marginBottom:10}}><label>N1</label><input className="form-control" value={modalEditar.n1} onChange={e=>setModalEditar(p=>({...p,n1:e.target.value}))} placeholder="Número principal" style={{fontFamily:'monospace'}} /></div>
              <div className="bo-input-group" style={{marginBottom:10}}><label>N2 (opcional)</label><input className="form-control" value={modalEditar.n2} onChange={e=>setModalEditar(p=>({...p,n2:e.target.value}))} placeholder="Número secundario" style={{fontFamily:'monospace'}} /></div>
              <div className="bo-input-group" style={{marginBottom:10}}><label>Usuario WhatsApp</label><input className="form-control" value={modalEditar.usuarioWhatsapp} onChange={e=>setModalEditar(p=>({...p,usuarioWhatsapp:e.target.value}))} placeholder="Si no tiene N1, ej. usuario_cliente" maxLength={100} /></div>
            </>)}
            {modalEditar.error && <p style={{color:'#dc2626',fontSize:12,margin:'0 0 10px'}}>{modalEditar.error}</p>}
            <div className="modal-btns">
              <button className="btn-cancelar-modal" onClick={()=>setModalEditar(p=>({...p,open:false}))} disabled={modalEditar.guardando}>Cancelar</button>
              <button className="btn-confirmar-modal" onClick={guardarEdicion} disabled={modalEditar.guardando}>{modalEditar.guardando?'Guardando…':'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL AGENDAR ENTREVISTA ═════════════════════════════════════════ */}
      {modalEntrevista.open && (
        <div className="modal-overlay open" onClick={e=>{ if(e.target===e.currentTarget && !modalEntrevista.guardando) setModalEntrevista(p=>({...p,open:false})) }}>
          <div className="modal-box">
            <h3>Agendar entrevista</h3>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Nombre del postulante</label><input className="form-control" value={modalEntrevista.nombrePostulante} onChange={e=>setModalEntrevista(p=>({...p,nombrePostulante:e.target.value}))} placeholder="Nombre y apellidos" /></div>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Número</label><input className="form-control" value={modalEntrevista.numero} onChange={e=>setModalEntrevista(p=>({...p,numero:e.target.value}))} placeholder="Número de contacto" style={{fontFamily:'monospace'}} /></div>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Número ref</label><input className="form-control" value={modalEntrevista.numeroRef} onChange={e=>setModalEntrevista(p=>({...p,numeroRef:e.target.value}))} placeholder="Número de referencia (opcional)" style={{fontFamily:'monospace'}} /></div>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Turno</label>
              <select className="form-select" value={modalEntrevista.turno} onChange={e=>setModalEntrevista(p=>({...p,turno:e.target.value}))}>
                <option value="">— Selecciona —</option>
                <option value="TURNO 1">TURNO 1</option>
                <option value="TURNO 2">TURNO 2</option>
              </select>
            </div>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Fecha de agendamiento</label><input type="date" className="form-control" value={modalEntrevista.fechaAgendamiento} onChange={e=>setModalEntrevista(p=>({...p,fechaAgendamiento:e.target.value}))} /></div>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Observación / comentario</label><textarea className="form-control" rows={3} value={modalEntrevista.observacion} onChange={e=>setModalEntrevista(p=>({...p,observacion:e.target.value}))} placeholder="Comentario opcional" /></div>
            {modalEntrevista.error && <p style={{color:'#dc2626',fontSize:12,margin:'0 0 10px'}}>{modalEntrevista.error}</p>}
            <div className="modal-btns">
              <button className="btn-cancelar-modal" onClick={()=>setModalEntrevista(p=>({...p,open:false}))} disabled={modalEntrevista.guardando}>Cancelar</button>
              <button className="btn-confirmar-modal" onClick={guardarEntrevista} disabled={modalEntrevista.guardando}>{modalEntrevista.guardando?'Guardando…':'Agendar entrevista'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL REGISTRAR CAPACITACIÓN ═════════════════════════════════════ */}
      {modalCapacitacion.open && (
        <div className="modal-overlay open" onClick={e=>{ if(e.target===e.currentTarget && !modalCapacitacion.guardando) setModalCapacitacion(p=>({...p,open:false})) }}>
          <div className="modal-box">
            <h3>Registrar en capacitación</h3>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Nombre del postulante</label><input className="form-control" value={modalCapacitacion.nombrePostulante} onChange={e=>setModalCapacitacion(p=>({...p,nombrePostulante:e.target.value}))} placeholder="Nombre y apellidos" /></div>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Número (el del lead, o cambia por uno de referencia)</label><input className="form-control" value={modalCapacitacion.numero} onChange={e=>setModalCapacitacion(p=>({...p,numero:e.target.value}))} placeholder="Número de contacto" style={{fontFamily:'monospace'}} /></div>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Fecha de inicio de capacitación</label><input type="date" className="form-control" value={modalCapacitacion.fechaInicio} onChange={e=>setModalCapacitacion(p=>({...p,fechaInicio:e.target.value}))} /></div>
            {modalCapacitacion.error && <p style={{color:'#dc2626',fontSize:12,margin:'0 0 10px'}}>{modalCapacitacion.error}</p>}
            <div className="modal-btns">
              <button className="btn-cancelar-modal" onClick={()=>setModalCapacitacion(p=>({...p,open:false}))} disabled={modalCapacitacion.guardando}>Cancelar</button>
              <button className="btn-confirmar-modal" onClick={guardarCapacitacion} disabled={modalCapacitacion.guardando}>{modalCapacitacion.guardando?'Guardando…':'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL REPROGRAMAR (actualiza fecha de agendamiento) ══════════════ */}
      {modalReprogramar.open && (
        <div className="modal-overlay open" onClick={e=>{ if(e.target===e.currentTarget && !modalReprogramar.guardando) setModalReprogramar(p=>({...p,open:false})) }}>
          <div className="modal-box">
            <h3>Reprogramar entrevista</h3>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Nueva fecha de agendamiento</label><input type="date" className="form-control" value={modalReprogramar.fechaAgendamiento} onChange={e=>setModalReprogramar(p=>({...p,fechaAgendamiento:e.target.value}))} /></div>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Turno</label>
              <select className="form-select" value={modalReprogramar.turno} onChange={e=>setModalReprogramar(p=>({...p,turno:e.target.value}))}>
                <option value="TURNO 1">TURNO 1</option>
                <option value="TURNO 2">TURNO 2</option>
              </select>
            </div>
            {modalReprogramar.error && <p style={{color:'#dc2626',fontSize:12,margin:'0 0 10px'}}>{modalReprogramar.error}</p>}
            <div className="modal-btns">
              <button className="btn-cancelar-modal" onClick={()=>setModalReprogramar(p=>({...p,open:false}))} disabled={modalReprogramar.guardando}>Cancelar</button>
              <button className="btn-confirmar-modal" onClick={guardarReprogramar} disabled={modalReprogramar.guardando}>{modalReprogramar.guardando?'Guardando…':'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL FECHA DE ALTA ══════════════════════════════════════════════ */}
      {modalAlta.open && (
        <div className="modal-overlay open" onClick={e=>{ if(e.target===e.currentTarget && !modalAlta.guardando) setModalAlta(p=>({...p,open:false})) }}>
          <div className="modal-box">
            <h3>Fecha de alta</h3>
            <div className="bo-input-group" style={{marginBottom:10}}><label>Fecha de alta</label><input type="date" className="form-control" value={modalAlta.fechaAlta} onChange={e=>setModalAlta(p=>({...p,fechaAlta:e.target.value}))} /></div>
            {modalAlta.error && <p style={{color:'#dc2626',fontSize:12,margin:'0 0 10px'}}>{modalAlta.error}</p>}
            <div className="modal-btns">
              <button className="btn-cancelar-modal" onClick={()=>setModalAlta(p=>({...p,open:false}))} disabled={modalAlta.guardando}>Cancelar</button>
              <button className="btn-confirmar-modal" onClick={guardarAlta} disabled={modalAlta.guardando}>{modalAlta.guardando?'Guardando…':'Confirmar ALTA'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ BL MODAL (base de llamadas asesor) ══════════════════════════════ */}
      {blModal.open && (
        <div style={{display:'flex',position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:9999,alignItems:'flex-start',justifyContent:'center',padding:'40px 20px'}} onClick={e=>{ if(e.target===e.currentTarget) setBlModal(p=>({...p,open:false})) }}>
          <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:1000,maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.3)'}}>
            <div style={{padding:'18px 24px 14px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:15,fontWeight:800,color:'#111827'}}>Base de llamadas — {blModal.nombre}</div>
                <div style={{fontSize:12,color:'#9ca3af',marginTop:2}}>Solo lectura · Back Data</div>
              </div>
              <button onClick={()=>setBlModal(p=>({...p,open:false}))} style={{width:32,height:32,borderRadius:'50%',border:'1px solid #e5e7eb',background:'#f9fafb',fontSize:18,cursor:'pointer'}}>×</button>
            </div>
            <div style={{padding:'10px 24px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <label style={{fontSize:12,fontWeight:600}}>Fecha:</label>
              <input type="date" value={blFecha} onChange={e=>setBlFecha(e.target.value)} style={{padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:12,fontFamily:'inherit'}} />
              <button onClick={()=>setBlFecha(fechaHoy())} style={{padding:'6px 12px',border:'1px solid #e5e7eb',borderRadius:8,background:'#f9fafb',fontSize:11,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>Hoy</button>
              <span style={{fontSize:12,color:'#9ca3af',marginLeft:'auto'}}>{blLeads?.length??0} registros</span>
            </div>
            {blLeads && blLeads.length > 0 && (
              <div style={{padding:'10px 24px',display:'flex',gap:10,flexWrap:'wrap',borderBottom:'1px solid #f3f4f6'}}>
                {[{label:'Leads',val:blLeads.length,color:'#2563eb'},{label:'Tipificados',val:blLeads.filter(l=>(l.tipif_vend||'').trim()!=='').length,color:'#16a34a'},{label:'VENTA CERRADA',val:blLeads.filter(l=>(l.tipif_vend||'').toUpperCase()==='VENTA CERRADA').length,color:'#7c3aed'},{label:'NC/Buzón',val:blLeads.filter(l=>['NO CONTESTA','BUZON DE VOZ'].includes((l.tipif_vend||'').toUpperCase())).length,color:'#d97706'}]
                  .map(k=>(
                    <div key={k.label} style={{background:'#f9fafb',borderRadius:10,padding:'8px 14px',display:'flex',flexDirection:'column',gap:2,minWidth:100}}>
                      <div style={{fontSize:18,fontWeight:800,color:k.color}}>{k.val}</div>
                      <div style={{fontSize:10,color:'#9ca3af',textTransform:'uppercase'}}>{k.label}</div>
                    </div>
                  ))}
              </div>
            )}
            <div style={{flex:1,overflow:'auto',padding:'0 24px 20px'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead><tr style={{position:'sticky',top:0,background:'#f9fafb',zIndex:1}}>
                  {['#','Teléfono N1','N2','Zona','Campaña','Hora asig.','Tipificación','Observación'].map(h=>(
                    <th key={h} style={{padding:'10px 8px',textAlign:'left',fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',borderBottom:'1px solid #e5e7eb'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {blCargando
                    ? <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#9ca3af'}}>Cargando...</td></tr>
                    : !blLeads
                      ? <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#ef4444'}}>Error de conexión.</td></tr>
                      : blLeads.length === 0
                        ? <tr><td colSpan={8} style={{textAlign:'center',padding:40,color:'#9ca3af'}}>Sin leads para esta fecha.</td></tr>
                        : blLeads.map((l,i)=>(
                            <tr key={i} style={{borderBottom:'1px solid #f3f4f6',background:(l.tipif_vend||'').toUpperCase()==='VENTA CERRADA'?'#f0fdf4':''}}>
                              <td style={{padding:8,color:'#9ca3af',fontSize:10}}>{i+1}</td>
                              <td style={{padding:8,fontFamily:'monospace',fontWeight:700,color:'#111827'}}>{l.n1||'—'}</td>
                              <td style={{padding:8,fontFamily:'monospace',color:'#6b7280'}}>{l.n2||'—'}</td>
                              <td style={{padding:8,fontSize:11}}>{l.distrito||l.campana||'—'}</td>
                              <td style={{padding:8,fontSize:11}}>{l.campana||'—'}</td>
                              <td style={{padding:8,fontSize:11,fontFamily:'monospace'}}>{l.hora_asig||'—'}</td>
                              <td style={{padding:8}}><BlBadge tipif={l.tipif_vend} /></td>
                              <td style={{padding:8,fontSize:11,color:'#6b7280'}}>{l.obs_asesor||'—'}</td>
                            </tr>
                          ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══ TOAST ════════════════════════════════════════════════════════════ */}
    </div>
  )
}
