import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import JefaturaViewControls from '../components/JefaturaViewControls'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import CanalBadge from '../components/CanalBadge'
import { API, ncHeaders } from '../services/api'
import { responseChanged, setVisibleInterval, clearVisibleInterval } from '../utils/polling'
import { UBIGEO } from '../services/ubigeo'
import { usuarioTieneCargo } from '../utils/roles'
import { CAMPANAS } from '../utils/campanas'
import '../styles/backoffice.css'

// ── Selector de campaña (lista + opción "Otro" para escribir a mano) ───────
function CampanaSelect({ value, onChange, plain, sinOtro }) {
  const [manual, setManual] = useState(() => !sinOtro && Boolean(value) && !CAMPANAS.includes(value))
  const [manualConfirmada, setManualConfirmada] = useState(() => !sinOtro && Boolean(value) && !CAMPANAS.includes(value))
  if (manual) {
    if (manualConfirmada && String(value || '').trim()) {
      return (
        <div style={{display:'flex',flexDirection:'column',gap:4,width:'100%',minWidth:0}}>
          <div style={{width:'100%',padding:'7px 8px',border:'1px solid #86efac',borderRadius:8,background:'#f0fdf4',color:'#166534',fontSize:11,fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={value}>✓ {value}</div>
          <div style={{display:'flex',justifyContent:'space-between',gap:4}}>
            <button type="button" onClick={()=>setManualConfirmada(false)} style={{width:'auto',border:'none',background:'transparent',padding:'2px 0',cursor:'pointer',color:'#2563eb',fontSize:10}}>Editar</button>
            <button type="button" onClick={()=>{ setManual(false); setManualConfirmada(false); onChange('') }} style={{width:'auto',border:'none',background:'transparent',padding:'2px 0',cursor:'pointer',color:'#6b7280',fontSize:10}}>↩ Volver a lista</button>
          </div>
        </div>
      )
    }
    return (
      <div style={{display:'flex',flexDirection:'column',gap:4,width:'100%',minWidth:0}}>
        <input className={plain?undefined:'form-control'} value={value} autoFocus placeholder="Escribe la campaña"
          onChange={e=>{ setManualConfirmada(false); onChange(e.target.value) }}
          onKeyDown={e=>{ if(e.key==='Enter' && String(value || '').trim()){ e.preventDefault(); setManualConfirmada(true) } }}
          style={{width:'100%',minWidth:0}} />
        <div style={{display:'flex',justifyContent:'space-between',gap:4}}>
          <button type="button" disabled={!String(value || '').trim()} onClick={()=>setManualConfirmada(true)}
            style={{width:'auto',border:'none',background:'transparent',padding:'2px 0',cursor:String(value || '').trim()?'pointer':'not-allowed',color:String(value || '').trim()?'#15803d':'#9ca3af',fontSize:10,fontWeight:700}}>✓ Usar campaña</button>
          <button type="button" title="Volver a la lista" onClick={()=>{ setManual(false); setManualConfirmada(false); onChange('') }}
            style={{width:'auto',border:'none',background:'transparent',padding:'2px 0',cursor:'pointer',color:'#6b7280',fontSize:10,whiteSpace:'nowrap'}}>↩ lista</button>
        </div>
      </div>
    )
  }
  return (
    <select className={plain?undefined:'form-control'} value={CAMPANAS.includes(value)?value:''}
      onChange={e=>{ const v=e.target.value; if(v==='__OTRO__'){ setManual(true); setManualConfirmada(false); onChange('') } else onChange(v) }}>
      <option value="">— Selecciona —</option>
      {CAMPANAS.map(c=>(<option key={c} value={c}>{c}</option>))}
      {!sinOtro && <option value="__OTRO__">Otro (escribir a mano)…</option>}
    </select>
  )
}

// ── Utilities ────────────────────────────────────────────────────────────
const COLORES_AV = ['#3b82f6','#8b5cf6','#22c55e','#f97316','#ef4444','#06b6d4','#ec4899']
const DOT_COLORS  = ['#185FA5','#0F6E56','#854F0B','#7C3AED','#DC2626']
const BO_SECCIONES = ['base', 'carga-masiva', 'rendimiento', 'avance']

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
function horaAMinutos(hora) {
  const m = String(hora || '').match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return -1
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

function tipifBadgeClass(t) {
  if (!t) return 'b-default'
  const u = t.toUpperCase()
  if (u.includes('VENTA'))       return 'b-venta'
  if (u.includes('BUZON'))       return 'b-buzon'
  if (u.includes('NO CONTESTA')) return 'b-nocontesta'
  if (u.includes('DER'))         return 'b-derivado'
  return 'b-default'
}

const TIPIF_BACK_OPTIONS = ['BUZON DE VOZ','NO CONTESTA','CORTA LLAMADA','DERIVADO','LLAMANDO','SIN COBERTURA']

function claseTipifBack(valor) {
  const clave = String(valor || '').trim().toUpperCase().replace(/\s+/g, '-')
  return `bo-sel-compact tipif-back-color tipif-back-${clave || 'VACIA'}`
}
const TIPIF_VEND_OPCIONES = ['VENTA CERRADA','PREVENTA','AGENDADO','EN EJECUCION','INSTALADO','NO CONTESTA','BUZON DE VOZ','CORTA LLAMADA','NO DESEA','NO CALIFICA','SIN COBERTURA','CONTACTO CON TERCEROS','EDIFICIO NO LIBERADO','DESEA MOVIL','SERVICIO ACTIVO','TERNA','NO ROTAR']
const TIPIF_FILTRO_OPCIONES = [...TIPIF_VEND_OPCIONES, 'INSTALADO', 'VENTA CAIDA']
// Para rotación sólo existen tres cierres definitivos. Cualquier otra
// tipificación vigente puede volver a trabajarse después de 2 horas.
const TIPIF_PROHIBIDAS_ROTACION = new Set(['VENTA CERRADA','NO TOCAR','SH NO TOCAR','NO ROTAR','SH NO ROTAR','TERNA'])
const TIPIF_EXCLUIDAS_ROTACION  = new Set(['VENTA CERRADA','NO TOCAR','SH NO TOCAR','NO ROTAR','SH NO ROTAR','INSTALADO','TERNA'])
const ESTADOS_AMARILLOS_VENTA = new Set(['RECHAZO_CAMPO','RECHAZADA','RECHAZADO','CORTA_LLAMADA','FRAUDE','NO_DESEA','NO_CONTESTA','BUZON_VOZ','SERVICIO_ACTIVO','MALA_OFERTA','CORREGIR'])
const ESTADOS_AMARILLOS_GRAB  = new Set(['CORTA_LLAMADA','SUPLANTACION','NO_DESEA','NO_CONTESTA','BUZON','BUZON_VOZ'])
const ESTADOS_AMARILLOS_SUPGRAB = new Set(['RECHAZADO','NO_CONFORME','OBSERVADO'])
function normalizarNumero(valor) {
  return String(valor || '').replace(/\D/g, '')
}
function formatFechaHoraInterna(valor) {
  if (!valor) return ''
  const fecha = new Date(valor)
  if (!Number.isNaN(fecha.getTime())) {
    return fecha.toLocaleString('es-PE', {
      timeZone:'America/Lima', day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit', hour12:false,
    })
  }
  return String(valor).replace('T',' ').slice(0,16)
}
function tooltipTipificacionInterna(reg) {
  if (!reg?.tipifInterna) return ''
  return [
    `${reg.tipifInterna} · ${reg.tipifInternaArea || 'CRM'}`,
    reg.tipifInternaMotivo ? `Motivo: ${reg.tipifInternaMotivo}` : '',
    reg.tipifInternaFecha ? `Tipificado: ${formatFechaHoraInterna(reg.tipifInternaFecha)}` : '',
  ].filter(Boolean).join('\n')
}

function normalizarTipifVend(valor) {
  const tipif = String(valor || '').trim()
  return ['SH NO ROTAR','SH NO TOCAR'].includes(tipif.toUpperCase()) ? 'NO ROTAR' : tipif
}

function cantidadRotaciones(reg) {
  const guardadas = parseInt(String(reg?.rotaciones ?? 0).replace(/x/gi, ''), 10) || 0
  // En registros guardados, la API ya proyecta el contador unificado del
  // primer lead del numero en el dia.
  if (reg?._backendId) return guardadas
  const historial = Array.isArray(reg?.historial) ? reg.historial : []
  if (!historial.length) return guardadas
  return historial.filter(h => {
    const tipo = String(h?.tipo || '').trim().toUpperCase()
    return Boolean(String(h?.asesor || '').trim())
      && !['CARGA', 'TIPIF_VEND', 'TIPIF_BACK', 'DERIVADO'].includes(tipo)
  }).length
}

function ultimaAsignacionReg(reg) {
  const historial = Array.isArray(reg?.historial) ? reg.historial : []
  const asignaciones = historial.filter(h =>
    h?.asesor && !['TIPIF_VEND','TIPIF_BACK','DERIVADO'].includes(String(h?.tipo || '').toUpperCase())
  )
  if (!asignaciones.length) return null

  // Si un número de una base anterior se rota hoy, la celda debe mostrar esa
  // rotación en rojo aunque la fecha original del lead sea más antigua.
  const rotacionesHoy = asignaciones.filter(h =>
    normalizarFecha(h?.fecha) === fechaHoy()
    && (String(h?.tipo || '').trim().toUpperCase() === 'ROTACION' || Boolean(h?.reasignadoPor) || Boolean(h?.rotadoPor))
  )
  const candidatas = rotacionesHoy.length ? rotacionesHoy : asignaciones
  return candidatas.reduce((ultima, actual) => {
    const claveUltima = `${normalizarFecha(ultima?.fecha)} ${String(ultima?.hora || '').padStart(5, '0')}`
    const claveActual = `${normalizarFecha(actual?.fecha)} ${String(actual?.hora || '').padStart(5, '0')}`
    return claveActual >= claveUltima ? actual : ultima
  })
}

// SIN COBERTURA es un estado tecnico de la direccion (no hay servicio ahi),
// no algo que "expire" en un dia. Si el registro paso por SIN COBERTURA en
// cualquier momento de su historial (o es su tipif actual), se considera
// marcado sin importar que tan reciente sea.
function tuvoSinCoberturaAlgunaVez(reg, hist) {
  if (String(reg?._tipifVend || '').trim().toUpperCase() === 'SIN COBERTURA') return true
  return (hist || []).some(h => [h?.tipif, h?.tipif_vend, h?.tipifVendAntes]
    .some(v => String(v || '').trim().toUpperCase() === 'SIN COBERTURA'))
}

function grupoPrioridadLead(reg) {
  const tipif = String(tipifEfectiva(reg) || '').trim().toUpperCase()
  if (tipif === 'VENTA CERRADA') return 2
  if (tipif === 'VENTA CAIDA') return 3
  if (tipif === 'INSTALADO') return 4
  if (tipif === 'SIN COBERTURA') return 1
  if (tipif === 'TERNA') return 5
  return 0
}
function resaltadoPorVenta(venta) {
  if (!venta) return null
  const estado = String(venta.estado || '').trim().toUpperCase()
  const estadoGrab = String(venta.estado_grab || '').trim().toUpperCase()
  const estadoSupGrab = String(venta.estado_supgrab || '').trim().toUpperCase()
  if (estado === 'CAIDA')       return { clase:'num-estado-rojo', label:'CAÍDA en Seguimiento' }
  if (estado === 'INSTALADO')   return { clase:'num-estado-celeste', label:'INSTALADO en Seguimiento' }
  if (estado === 'EN_EJECUCION') return { clase:'num-estado-verde', label:'EN EJECUCIÓN en Seguimiento' }
  if (['VENTA','VALIDADO','GRABADO','PROGRAMADO'].includes(estado)) {
    return { clase:'num-estado-azul', label:`${estado} en el flujo de ventas` }
  }
  if (ESTADOS_AMARILLOS_VENTA.has(estado) || ESTADOS_AMARILLOS_GRAB.has(estadoGrab) || ESTADOS_AMARILLOS_SUPGRAB.has(estadoSupGrab)) {
    return { clase:'num-estado-amarillo', label:'Rechazado en Seguimiento, Validación o Grabaciones' }
  }
  return null
}
function esLeadProhibido(reg) {
  const tipif = String(tipifEfectiva(reg) || '').trim().toUpperCase()
  return TIPIF_PROHIBIDAS_ROTACION.has(tipif)
}
function razonBloqueoRotacion(reg) {
  return `Prohibido: ${String(tipifEfectiva(reg) || '').trim().toUpperCase()}`
}
function esVentaCaidaInterna(reg) {
  return String(reg?.tipifInterna || '').trim().toUpperCase() === 'VENTA CAIDA'
}
function esRotacionManualProhibida(reg) {
  // Una venta caída puede recibir un nuevo vendedor únicamente desde el
  // botón de rotación manual. La rotación inteligente conserva sus filtros.
  return !esVentaCaidaInterna(reg) && esLeadProhibido(reg)
}
function permiteOtraDireccion(reg) {
  if (Number(reg?.cicloAbiertoId || 0) > 0) return false
  const tipif = String(tipifEfectiva(reg) || '').trim().toUpperCase()
  return Number(reg?.venta_confirmada) === 1 || ['VENTA CERRADA', 'INSTALADO'].includes(tipif)
}
function tieneCicloVentaAbierto(reg) {
  return Number(reg?.cicloAbiertoId || 0) > 0
}
// Tipificación que dejó el asesor anterior (registrada en el historial al rotar/reasignar).
// La base principal la muestra mientras el asesor actual todavía no coloca la suya.
function tipifPrevioHistorial(historial) {
  if (!Array.isArray(historial)) return ''
  for (let i = historial.length - 1; i >= 0; i--) {
    const h = historial[i]
    if (h && h.tipifVendAntes != null && String(h.tipifVendAntes).trim() !== '') return String(h.tipifVendAntes)
  }
  return ''
}
// Tipificación efectiva a mostrar en la base principal: la del asesor actual si ya
// tipificó; de lo contrario, la que dejó el asesor anterior (derivada del historial).
function tipifEfectiva(reg) {
  const hist = Array.isArray(reg?.historial) ? reg.historial : []
  if (String(reg?.tipifInterna || '').trim()) return String(reg.tipifInterna).trim()
  const eventos = hist.filter(h => h?.tipo === 'TIPIF_VEND' && h.ts != null)
  // Una venta realmente creada tiene prioridad definitiva. No basta con haber
  // pulsado la tipificación en el Dashboard: debe existir la venta en la API.
  if (Number(reg?.venta_confirmada) === 1 || eventos.some(h => h?.tipif === 'VENTA CERRADA' && h?.ventaCompleta)) {
    return 'VENTA CERRADA'
  }
  const propia = normalizarTipifVend((reg?._tipifVend || '').trim())
  // NO ROTAR es una regla estructural del duplicado diario y prevalece sobre
  // eventos historicos que ese registro hubiera recibido por error.
  if (propia === 'NO ROTAR') return 'NO ROTAR'
  // SIN COBERTURA se mantiene fijo en la base principal aunque el asesor
  // actual lo siga trabajando con otra tipificacion en su propia base --
  // solo una venta real (arriba) lo libera.
  if (tuvoSinCoberturaAlgunaVez(reg, hist)) return 'SIN COBERTURA'
  // Mientras no exista venta, la tipificación cronológica más reciente gana,
  // incluso si la dejó un asesor que ya no es el titular actual.
  if (eventos.length) {
    const ult = eventos.reduce((a, b) => (b.ts > a.ts ? b : a))
    return normalizarTipifVend(ult.tipif)
  }
  return normalizarTipifVend(propia !== '' ? propia : tipifPrevioHistorial(reg?.historial))
}
const TIPIF_VEND_STYLES = {
  'VENTA CERRADA':['#dcfce7','#008b32'],'PREVENTA':['#dbeafe','#1e63a8'],'AGENDADO':['#fff3d6','#a85b00'],
  'NO CONTESTA':['#ffffd6','#737300'],'BUZON DE VOZ':['#fff0f0','#a83e3e'],'CORTA LLAMADA':['#e7f5fb','#236b8d'],
  'EN EJECUCION':['#eeeeee','#3f3f3f'],'SIN COBERTURA':['#fee2e2','#991b1b'],'NO CALIFICA':['#fff0e8','#8a4529'],
  'NO DESEA':['#f8e9dc','#713707'],'CONTACTO CON TERCEROS':['#e1f4ed','#10684c'],'EDIFICIO NO LIBERADO':['#fee2e2','#991b1b'],
  'DESEA MOVIL':['#f8e9dc','#713707'],'SERVICIO ACTIVO':['#444444','#ffffff'],
  'NC':['#fefce8','#854d0e'],'DERIVADO':['#ede9fe','#5b21b6'],'NO TOCAR':['#fef2f2','#dc2626'],'FRAUDE':['#fee2e2','#991b1b'],
  'INSTALADO':['#dcfce7','#14532d'],'NO ROTAR':['#fee2e2','#980000'],'SH NO ROTAR':['#fee2e2','#980000'],'SH NO TOCAR':['#fee2e2','#980000'],
  'TERNA':['#1f2937','#ffffff'],
}
const BL_TIPIF_COLORS = {
  'VENTA CERRADA':'#16a34a','PREVENTA':'#2563eb','AGENDADO':'#c2410c','NO CONTESTA':'#854d0e',
  'CORTA LLAMADA':'#c2410c','NO DESEA':'#92400e','BUZON DE VOZ':'#78350f','SERVICIO ACTIVO':'#4b5563',
  'SIN COBERTURA':'#b91c1c','NO CALIFICA':'#9a3412','CONTACTO CON TERCEROS':'#047857','EDIFICIO NO LIBERADO':'#991b1b',
  'DESEA MOVIL':'#92400e','EN EJECUCION':'#4b5563','NO TOCAR':'#980000','FRAUDE':'#991b1b','INSTALADO':'#15803d',
  'NO ROTAR':'#980000','SH NO ROTAR':'#980000','SH NO TOCAR':'#980000','TERNA':'#111827',
}

// Colores fuertes/vistosos para el selector de Tipif. Vendedor (texto blanco encima)
const TIPIF_VEND_FUERTE = {
  'VENTA CERRADA':['#dcfce7','#166534','#86efac'], 'INSTALADO':['#dcfce7','#14532d','#86efac'],
  'CONTACTO CON TERCEROS':['#d1fae5','#065f46','#6ee7b7'], 'SERVICIO ACTIVO':['#e5e7eb','#374151','#9ca3af'], 'PREVENTA':['#dbeafe','#1d4ed8','#93c5fd'],
  'CORTA LLAMADA':['#ffedd5','#c2410c','#fdba74'], 'AGENDADO':['#ffedd5','#c2410c','#fdba74'], 'BUZON DE VOZ':['#f3e8d4','#78350f','#d6a96c'],
  'NO DESEA':['#fef3c7','#92400e','#fbbf24'], 'NO CONTESTA':['#fef9c3','#854d0e','#fde047'], 'NC':['#fef9c3','#854d0e','#fde047'],
  'EN EJECUCION':['#e5e7eb','#374151','#9ca3af'], 'DESEA MOVIL':['#fef3c7','#92400e','#fbbf24'], 'DERIVADO':['#e0f2fe','#0369a1','#7dd3fc'],
  'NO CALIFICA':['#ffedd5','#9a3412','#fdba74'], 'SIN COBERTURA':['#fee2e2','#b91c1c','#fca5a5'], 'EDIFICIO NO LIBERADO':['#fee2e2','#991b1b','#fca5a5'],
  'NO TOCAR':['#fee2e2','#980000','#fca5a5'], 'FRAUDE':['#fee2e2','#991b1b','#fca5a5'], 'NO ROTAR':['#fee2e2','#980000','#fca5a5'], 'SH NO ROTAR':['#fee2e2','#980000','#fca5a5'], 'SH NO TOCAR':['#fee2e2','#980000','#fca5a5'],
  'TERNA':['#1f2937','#ffffff','#4b5563'],
}
function estiloTipifVend(v) {
  const paleta = TIPIF_VEND_FUERTE[v]
  return paleta
    ? { flex:1, minWidth:0, background:paleta[0], color:paleta[1], fontWeight:800, border:`1px solid ${paleta[2]}`, borderRadius:6 }
    : { flex:1, minWidth:0, background:'#fff', color:'inherit', fontWeight:'inherit', border:'1px solid #e5e7eb' }
}

function SearchIcon({ size=14 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
}

// Selector de asesor con búsqueda integrada (escribe para filtrar la lista)
function AsesorBuscador({ value, asesores, disabled, onChange, title, plain, className, placeholderText, emptyLabel }) {
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
        className={className !== undefined ? className : (plain ? undefined : 'bo-sel-compact sel-asesor-tabla')}
        style={{ textAlign:'left', width:'100%', cursor: disabled?'default':'pointer', background:plain?'transparent':'#fff', color:plain?'inherit':(value?'#111827':'#64748b'), fontWeight:value?700:400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {value || placeholderText || '— Asignar asesor —'}
      </button>
      {open && createPortal(
        <div ref={boxRef} style={{ position:'fixed', top:pos.top, left:pos.left, width:pos.width, zIndex:9999, background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,.16)', padding:8 }}>
          <div style={{ position:'relative', marginBottom:6 }}>
            <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'#64748b', display:'inline-flex', pointerEvents:'none' }}><SearchIcon size={13} /></span>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar asesor…"
              onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); if(lista[0]) elegir(lista[0].nombre) } else if(e.key==='Escape') setOpen(false) }}
              style={{ width:'100%', padding:'7px 8px 7px 28px', border:'1px solid #e5e7eb', borderRadius:7, outline:'none', fontSize:12, boxSizing:'border-box' }} />
          </div>
          <div style={{ maxHeight:158, overflowY:'auto', scrollbarGutter:'stable' }}>
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
  if (tipo === 'rotacion') return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-7a4 4 0 0 0-4 4v1"/><path d="m17 4 3 3-3 3"/><path d="M4 17h7a4 4 0 0 0 4-4v-1"/><path d="m7 20-3-3 3-3"/></svg>
  )
  if (tipo === 'rendimiento') return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/></svg>
  )
  return (
    <svg className="bo-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m0-5a5 5 0 0 1 6 5"/></svg>
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

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l11-11a2.1 2.1 0 0 0-3-3L5 17l-1 3z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="m14.5 7.5 3 3" fill="none" stroke="currentColor" strokeWidth="1.8"/>
    </svg>
  )
}

function NotebookIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/>
    </svg>
  )
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

// Extrae número de teléfono válido del campo N2 (elimina GPS, texto, etc.)
function limpiarN2Legacy(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  if (!s) return ''
  const primary = s.includes('///') ? s.split('///')[0].trim() : s
  const digits = primary.replace(/[^0-9]/g, '')
  if (digits.length >= 7 && digits.length <= 9) return digits
  const m1 = s.match(/\b9\d{8}\b/)
  if (m1) return m1[0]
  const m2 = s.match(/\b\d{7,9}\b/)
  if (m2) return m2[0]
  return ''
}

// Extrae DNI de 8 dígitos de obs_asesor (ej: "DNI: 60975222", "DNI 60975222")
function extraerDni(obs) {
  if (!obs) return null
  const s = String(obs).trim()
  const m = s.match(/\bDNI[:\s]+(\d{6,12})\b/i)
  if (m) return m[1]
  const m2 = s.match(/^(\d{6,12})$/)   // comentario que es solo el número de documento
  return m2 ? m2[1] : null
}

function documentoPreventa(reg) {
  const historial = Array.isArray(reg?.historial) ? reg.historial : []
  for (let i = historial.length - 1; i >= 0; i--) {
    const evento = historial[i] || {}
    if (String(evento.tipo || '').toUpperCase() === 'TIPIF_VEND' &&
        String(evento.tipif || '').trim().toUpperCase() === 'PREVENTA' &&
        evento.documento) {
      return String(evento.documento).replace(/^\s*(DNI|CE|RUC)\s*:?\s*/i, '').trim()
    }
  }
  return extraerDni(reg?.obsAsesor)
}

function documentoVenta(reg) {
  const documento = String(reg?.ventaDocumento || '').trim()
  if (documento) {
    return {
      valor: documento,
      tipo: String(reg?.ventaTipoDoc || 'DNI').trim().toUpperCase() || 'DNI',
      soloLectura: true,
    }
  }
  const preventa = documentoPreventa(reg)
  if (preventa) return { valor: preventa, tipo: 'DNI', soloLectura: true }
  const documentoObs = extraerDni(reg?.obsAsesor)
  return documentoObs ? { valor: documentoObs, tipo: 'DNI', soloLectura: false } : null
}

// ── Component ─────────────────────────────────────────────────────────────
export default function Backoffice() {
  const navigate    = useNavigate()
  const { sesion, logout } = useAuth()
  const idCntRef      = useRef(1)
  const toastTimer    = useRef(null)
  const archivoInputRef   = useRef(null)
  const legacyInputRef    = useRef(null)
  const fechaSistemaRef   = useRef(fechaHoy())
  const fechaActivaRef    = useRef(fechaHoy())
  const rotandoRef        = useRef(false)
  // ── Section ──
  const [seccion, setSeccion] = useState(() => {
    const guardada = sessionStorage.getItem('nc_backoffice_apartado')
    return BO_SECCIONES.includes(guardada) ? guardada : 'base'
  })
  const [sidebarAbierto, setSidebarAbierto] = useState(() => sessionStorage.getItem('nc_backoffice_sidebar') !== 'cerrado')

  // ── Data ──
  const [asesores,      setAsesores]      = useState([])
  const [baseData,      setBaseData]      = useState({})
  const [ventasPorNumero, setVentasPorNumero] = useState({})
  const [fechaPestanas, setFechaPestanas] = useState([fechaHoy()])
  const [fechaCantidades,setFechaCantidades]= useState({})
  const [fechaActiva,   setFechaActiva]   = useState(fechaHoy())

  // ── Form (agregar registro) ──
  const [form,     setForm]     = useState({ campana:'', dpto:'', prov:'', distrito:'', n1:'', n2:'', usuarioWhatsapp:'', tipoContacto:'LLAMADA', direccion:'', coordenadas:'', obsBack:'', tipifBack:'', asesor:'' })
  const [n1Error,  setN1Error]  = useState(false)
  const [calPicker,   setCalPicker]   = useState('')
  const [cmCalPicker, setCmCalPicker] = useState('')

  // ── Ubigeo cascada ──
  const dptos     = Object.keys(UBIGEO).sort()
  const provs     = form.dpto ? Object.keys(UBIGEO[form.dpto] || {}).sort() : []
  const distritos = (form.dpto && form.prov) ? (UBIGEO[form.dpto]?.[form.prov] || []) : []

  // ── Filtros base ──
  const [filtros, setFiltros] = useState({ tipBack1:[], tipBack2:[], tipVend:[], asesor:[], campana:[], sala:[], numero:'', desde:'', hasta:'', global:false, duplicados:false })
  const [tableSort, setTableSort] = useState({ col: null, dir: null })
  const [ordenDiarioActivo, setOrdenDiarioActivo] = useState(false)
  const [basePage, setBasePage] = useState(1)
  const [basePageSize, setBasePageSize] = useState(25)
  const [grupoProtegidoVisible, setGrupoProtegidoVisible] = useState('')
  function cycleSort(col) {
    setOrdenDiarioActivo(false)
    setTableSort(prev => {
      const firstDir = { tipif:'az', hora:'desc', rots:'asc', asesor:'sin_asignar' }[col]
      if (prev.col !== col) return { col, dir: firstDir }
      const seq = { tipif:['az','za',null], hora:['desc','asc',null], rots:['asc','desc',null], asesor:['sin_asignar','asignados',null] }[col]
      const next = seq[(seq.indexOf(prev.dir) + 1) % seq.length]
      return next ? { col, dir: next } : { col: null, dir: null }
    })
  }

  // ── Historial / Detalles expandibles ──
  const [histOpen,     setHistOpen]     = useState({})
  const [detOpen,      setDetOpen]      = useState({})
  const [campanaModal, setCampanaModal] = useState(null) // { id, bid, valor, guardando }
  const [dniModal, setDniModal] = useState(null) // { id, bid, dni, top, left, editing, editVal }
  const [coberturaModal, setCoberturaModal] = useState(null)
  const [numeroModal, setNumeroModal] = useState(null) // { id, bid, n1, n2, guardando }
  const [origenModal, setOrigenModal] = useState(null) // { n1, campana, cargadoPor, fecha, hora }

  async function guardarNumeros() {
    if (!numeroModal || numeroModal.guardando) return
    const n1 = String(numeroModal.n1 || '').replace(/\D/g, '')
    const n2 = String(numeroModal.n2 || '').replace(/\D/g, '')
    if (n1.length < 6) { mostrarToast('N1 debe contener al menos 6 dígitos'); return }
    if (n2 && (n2.length < 7 || n2.length > 9)) { mostrarToast('N2 debe contener entre 7 y 9 dígitos'); return }

    setNumeroModal(prev => prev ? { ...prev, guardando:true } : prev)
    try {
      const res = await fetch(`${API}/leads/${numeroModal.bid}/datos-back`, {
        method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ n1, n2 })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudieron actualizar los números')
      updateReg(numeroModal.id, { n1, n2 })
      setNumeroModal(null)
      mostrarToast('Números actualizados')
    } catch(e) {
      setNumeroModal(prev => prev ? { ...prev, guardando:false } : prev)
      mostrarToast(e.message || 'No se pudieron actualizar los números')
    }
  }

  // Guardar (editar) el DNI/comentario de una venta cerrada desde el popover del libro verde
  async function guardarDni() {
    const id  = dniModal?.id
    const bid = dniModal?.bid
    const val = String(dniModal?.editVal || '').replace(/\D/g, '')
    if (!id) return
    const found = findReg(id)
    const anterior = found?.reg?.obsAsesor || ''
    setBaseData(prev => {
      const next = { ...prev }
      for (const f in next) next[f] = (next[f] || []).map(r => r.id === id ? { ...r, obsAsesor: val } : r)
      return next
    })
    try {
      if (bid) {
        const res = await fetch(`${API}/leads/${bid}/obs`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ obs: val }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo actualizar el DNI')
      }
      setDniModal(p => p ? { ...p, dni: val, editing: false } : null)
      mostrarToast('DNI actualizado')
    } catch (e) {
      updateReg(id, { obsAsesor: anterior })
      mostrarToast(e.message || 'No se pudo actualizar el DNI')
    }
  }

  // ── Rotación panel ──
  const [rotPanelOpen,  setRotPanelOpen]  = useState(false)
  const [rotAsesor,     setRotAsesor]     = useState('')
  const [rotSort,       setRotSort]       = useState({ col:null, dir:'asc' })
  const [rotCant,       setRotCant]       = useState(4)
  const [rotSel,        setRotSel]        = useState({})
  const [rotFiltroFecha,setRotFiltroFecha]= useState(fechaHoy())
  const [rotCargandoFecha,setRotCargandoFecha]= useState(false)
  const [rotFiltroTipif,setRotFiltroTipif]= useState('')
  const [rotFiltroRotaciones,setRotFiltroRotaciones]= useState('0')
  const [rotProgress,   setRotProgress]   = useState(0)
  const [rotResultado,  setRotResultado]  = useState([])

  // ── Modal rotación manual ──
  const [modalRotar,    setModalRotar]    = useState({ open:false, regId:null, desc:'', asesorActual:'' })
  const [rotModalAsesor,setRotModalAsesor]= useState('')
  const [rotBusqueda,   setRotBusqueda]   = useState('')
  const [rotModalMotivo,setRotModalMotivo]= useState('')
  const [rotModalTipo,  setRotModalTipo]  = useState('ROTACION')
  const [rotModalError, setRotModalError] = useState('')
  const [rotandoManual, setRotandoManual] = useState(false)

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
  const [legacyDesde,  setLegacyDesde]  = useState('')
  const [legacyHasta,  setLegacyHasta]  = useState(fechaHoy())
  const [dragOver,     setDragOver]     = useState(false)
  const [legacyDragOver, setLegacyDragOver] = useState(false)
  const [cargandoMasiva, setCargandoMasiva] = useState(false)
  const [cargandoLegacy, setCargandoLegacy] = useState(false)
  const [importResult,   setImportResult]   = useState(null)
  const [legacyError,    setLegacyError]    = useState('')

  // ── Rendimiento ──
  const [rendFiltroTipo,  setRendFiltroTipo]  = useState('dia')
  const [rendFiltroFecha, setRendFiltroFecha] = useState(fechaHoy())
  const [rendDesde,       setRendDesde]       = useState('')
  const [rendHasta,       setRendHasta]       = useState('')
  const [rendFiltroAsesor,setRendFiltroAsesor]= useState('')
  const [rendFiltroSala,  setRendFiltroSala]  = useState('')
  const [rendOrden,       setRendOrden]       = useState('ventas')

  // ── Avance ──
  const [avanceBuscar, setAvanceBuscar] = useState('')
  const [blModal,  setBlModal]  = useState({ open:false, nombre:'', asesorId:null })
  const [blLeads,  setBlLeads]  = useState([])
  const [blFecha,  setBlFecha]  = useState(fechaHoy())
  const [blCargando, setBlCargando] = useState(false)
  const [blBuscar, setBlBuscar] = useState('')
  const [blFiltroTipif, setBlFiltroTipif] = useState('')
  const [blFiltroBack, setBlFiltroBack] = useState('')

  // ── Toast ──
  const [toast, setToast] = useState('')

  // Ids de leads recien bloqueados por Blacklist (TERNA) que aun deben verse
  // en la base general por 3s antes de pasar al grupo protegido, para que
  // Back Data note que el numero se auto-tipifico y por que.
  const [ternaEnGracia, setTernaEnGracia] = useState(() => new Set())
  function darGraciaTerna(bloqueados) {
    if (!Array.isArray(bloqueados) || !bloqueados.length) return
    const ids = bloqueados.map(b => b.id).filter(Boolean)
    if (!ids.length) return
    setTernaEnGracia(prev => { const s = new Set(prev); ids.forEach(id => s.add(id)); return s })
    setTimeout(() => {
      setTernaEnGracia(prev => { const s = new Set(prev); ids.forEach(id => s.delete(id)); return s })
    }, 3000)
  }

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
  function mostrarToast(msg, duracionMs = 3200) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), duracionMs)
  }

  function avisarBloqueadosTerna(bloqueados) {
    if (!Array.isArray(bloqueados) || !bloqueados.length) return
    const detalle = bloqueados.length === 1
      ? `El número ${bloqueados[0].n1} está en la Blacklist — se tipificó automáticamente como TERNA`
      : `${bloqueados.length} números están en la Blacklist — se tipificaron automáticamente como TERNA`
    mostrarToast(detalle, 3000)
    darGraciaTerna(bloqueados)
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
      const res = await fetch(`${API}/leads/${found.reg._backendId}/datos-back`, {
        method:'PATCH', headers:ncHeaders(), body:JSON.stringify(cambios)
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'Error al guardar')
    } catch(e) {
      updateReg(id, anteriores)
      mostrarToast(e.message || 'No se pudieron guardar los datos')
    }
  }

  async function guardarCampanaModal() {
    if (!campanaModal || campanaModal.guardando) return
    const v = String(campanaModal.valor || '').trim()
    if (!v) { mostrarToast('La campaña no puede estar vacía'); return }
    setCampanaModal(prev => prev ? { ...prev, guardando: true } : prev)
    try {
      const res = await fetch(`${API}/leads/${campanaModal.bid}/datos-back`, {
        method: 'PATCH', headers: ncHeaders(), body: JSON.stringify({ campana: v })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo actualizar la campaña')
      updateReg(campanaModal.id, { campana: v })
      setCampanaModal(null)
      mostrarToast('Campaña actualizada')
    } catch(e) {
      setCampanaModal(prev => prev ? { ...prev, guardando: false } : prev)
      mostrarToast(e.message || 'No se pudo actualizar la campaña')
    }
  }

  function openLeadOrigin(r) {
    const hist = r.historial || []
    const entrada = hist.find(h =>
      h.asignadoPor || h.cargadoPor ||
      h.motivo === 'Carga masiva' || h.motivo === 'Asignacion importada' ||
      h.motivo === 'Asignacion inicial' || h.motivo === 'Carga inicial' ||
      h.motivo === 'Importacion masiva'
    )
    const entradaOrigenAutomatico = hist.find(h => h.origenCarga)
    const actorHistorial = hist.find(h => h.realizadoPor || h.reasignadoPor || h.rotadoPor || h.registradoPor)
    setOrigenModal({
      n1: r.n1,
      campana: r.campana,
      cargadoPor: r.creadoPorNombre || entrada?.asignadoPor || entrada?.cargadoPor || actorHistorial?.realizadoPor || actorHistorial?.reasignadoPor || actorHistorial?.rotadoPor || actorHistorial?.registradoPor || null,
      usuario: r.creadoPorUsuario || entrada?.cargadoPorUsuario || actorHistorial?.realizadoPorUsuario || '',
      origenCarga: entradaOrigenAutomatico?.origenCarga || entrada?.origenCarga || '',
      ip: r.creadoDesdeIp || entrada?.ip || actorHistorial?.ip || '',
      fecha: entrada?.fecha || actorHistorial?.fecha || normalizarFecha(r.createdAt) || null,
      hora: entrada?.hora || actorHistorial?.hora || (String(r.createdAt||'').match(/T(\d{2}:\d{2})/)?.[1] || null),
    })
  }

  function findReg(id) {
    for (const f in baseData) {
      const reg = baseData[f].find(r => r.id === id)
      if (reg) return { reg, fecha: f }
    }
    return null
  }

  // Cambios locales recientes por lead: el polling los respeta hasta que el
  // backend los confirme (o pasen 8s), evitando el parpadeo al valor viejo.
  const pendingRef = useRef({})
  const cargandoLeadsRef = useRef(false)
  const ultimaRespuestaLeadsRef = useRef('')
  const mutGenRef = useRef(0)   // se incrementa en cada acción local; descarta respuestas de polls viejos
  function marcarPendiente(id, campos) {
    if (!campos || typeof campos !== 'object' || Array.isArray(campos)) return
    const prev = pendingRef.current[id]?.campos || {}
    pendingRef.current[id] = { campos: { ...prev, ...campos }, ts: Date.now() }
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
      const data = await res.json()
      if (data.ok) setAsesores(data.data
        .filter(u => usuarioTieneCargo(u, 'asesor') && u.activo)
        .map(u => ({ id:u.id, nombre:String(u.nombre || '').trim(), usuario:u.usuario, sala:u.sala })))
    } catch(e) { console.error('Error cargando asesores:', e) }
  }, [])

  const cargarEstadosVentas = useCallback(async () => {
    try {
      const res = await fetch(`${API}/ventas`, { headers:ncHeaders() })
      const data = await res.json()
      if (!data.ok) return
      const porNumero = {}
      data.data.forEach(venta => {
        const numero = normalizarNumero(venta.telefono1)
        if (numero && !porNumero[numero]) porNumero[numero] = venta
      })
      setVentasPorNumero(porNumero)
    } catch(e) { console.error('Error cargando estados de ventas:', e) }
  }, [])

  const cargarFechas = useCallback(async () => {
    try {
      const res = await fetch(`${API}/leads/fechas`, { headers:ncHeaders() })
      const data = await res.json()
      if (!data.ok) return
      const fechas = data.data.map(item => normalizarFecha(item.fecha)).filter(Boolean)
      setFechaCantidades(Object.fromEntries(data.data.map(item => [normalizarFecha(item.fecha), Number(item.cantidad || 0)]).filter(([fecha])=>fecha)))
      const hoy = fechaHoy()
      setFechaPestanas(prev => Array.from(new Set([...prev, ...fechas, hoy])).sort().reverse())
    } catch(e) { console.error('Error cargando fechas:', e) }
  }, [])

const cargarLeads = useCallback(async (todasLasFechas = false, fechaSolicitada = '', consultaGlobal = null) => {
    // Una búsqueda global no debe quedar descartada porque el refresco automático
    // de la fecha activa esté en curso.
    const cargaPuntual = Boolean(fechaSolicitada || consultaGlobal)
    if (!cargaPuntual && cargandoLeadsRef.current) return  // evita polls solapados (respuestas fuera de orden que causan parpadeo)
    if (!cargaPuntual) cargandoLeadsRef.current = true
    const gen = mutGenRef.current
    try {
      const globalParams = new URLSearchParams()
      if (consultaGlobal?.numero) globalParams.set('numero', consultaGlobal.numero)
      if (consultaGlobal?.desde) globalParams.set('desde', consultaGlobal.desde)
      if (consultaGlobal?.hasta) globalParams.set('hasta', consultaGlobal.hasta)
      const url = todasLasFechas
        ? `${API}/leads${globalParams.size ? `?${globalParams.toString()}` : ''}`
        : `${API}/leads?fecha=${encodeURIComponent(fechaSolicitada || fechaActivaRef.current)}`
      const res  = await fetch(url, { headers: ncHeaders() })
      const data = await res.json()
      if (!data.ok) return
      // Si hubo una acción local (rotar/eliminar/asignar) durante el fetch, esta
      // respuesta ya es vieja: descartarla para no pisar el cambio (evita parpadeo).
      if (mutGenRef.current !== gen) return
      if (!responseChanged(ultimaRespuestaLeadsRef, data.data) && Object.keys(pendingRef.current).length === 0) return
      const nuevoBase = {}
      const nuevasFechas = []
      data.data.forEach(l => {
        const fecha = normalizarFecha(l.fecha) || fechaHoy()
        if (!nuevoBase[fecha]) nuevoBase[fecha] = []
        if (!nuevasFechas.includes(fecha)) nuevasFechas.push(fecha)
        const reg = {
          id:         l.id,
          _backendId: l.id,
          fecha,
          campana:    l.campana || '—',
          distrito:   l.distrito || '—',
          distritoSinCobertura: l.distrito_sin_cobertura || l.distrito || '',
          n1:         l.n1,
          n2:         l.n2 || '',
          usuarioWhatsapp: l.usuario_whatsapp || '',
          tipo_contacto: l.tipo_contacto || 'LLAMADA',
          direccion:   l.direccion || '',
          coordenadas: l.coordenadas || '',
          coordenadasSinCobertura: l.coordenadas_sin_cobertura || l.coordenadas || '',
          obs_back:    l.obs_back || '',
          tipifBack:  l.tipif_back || '',
          tipifBack2: l.tipif_back_2 || '',
          derivadoPor: l.derivado_por_nombre || '',
          derivadoPor2: l.derivado_por_2_nombre || '',
          createdAt: l.created_at || '',
          creadoPorNombre: l.creado_por_nombre || '',
          creadoPorUsuario: l.creado_por_usuario || '',
          creadoDesdeIp: l.creado_desde_ip || '',
          ciclosVenta: Number(l.ciclos_venta || 0),
          cicloAbiertoId: Number(l.ciclo_abierto_id || 0),
          cicloAbiertoNumero: Number(l.ciclo_abierto_numero || 0),
          cicloAbiertoTipo: l.ciclo_abierto_tipo || '',
          asesor:     l.asesor_nombre || '',
          _asesorId:  l.asesor_id == null ? null : Number(l.asesor_id),
          horaAsig:   l.hora_asig || '',
          sinAsignar: !!l.sin_asignar,
          rotaciones: cantidadRotaciones(l),
          _tipifVend: l.tipif_vend || '',
          _tipifHora: l.tipif_hora || '',
          venta_confirmada: Number(l.venta_confirmada || 0),
          ventaDocumento: l.venta_documento || '',
          ventaTipoDoc: l.venta_tipo_doc || '',
          ventaCanal: l.venta_canal || '',
          tipifInterna: l.tipif_interna || '',
          tipifInternaColor: l.tipif_interna_color || '',
          tipifInternaArea: l.tipif_interna_area || '',
          tipifInternaFecha: l.tipif_interna_fecha || '',
          tipifInternaMotivo: l.tipif_interna_motivo || '',
          alertaSinCobertura: Number(l.alerta_sin_cobertura || 0) === 1,
          alertaSinCoberturaDistrito: l.alerta_sin_cobertura_distrito || '',
          alertaSinCoberturaCoordenadas: l.alerta_sin_cobertura_coordenadas || '',
          obsAsesor:  l.obs_asesor || '',
          historial:  Array.isArray(l.historial) ? l.historial : [],
          // hora de asignación del asesor actual, derivada del historial para que no se pise en rotaciones
          horaAsigDisplay: (() => {
            const hist = Array.isArray(l.historial) ? l.historial : []
            const entry = [...hist].reverse().find(h =>
              !['TIPIF_VEND','TIPIF_BACK','DERIVADO'].includes(String(h?.tipo||'').toUpperCase()) &&
              h?.asesor && String(h.asesor).trim().toUpperCase() === String(l.asesor_nombre||'').trim().toUpperCase()
            )
            return entry?.hora || l.hora_asig || ''
          })(),
        }
        // Reconciliar con cambios locales recientes (evita parpadeo al valor viejo)
        const pend = pendingRef.current[l.id]
        if (pend) {
          const edad = Date.now() - pend.ts
          // Si la reasignación/rotación ya se confirmó en el servidor (mismo asesor),
          // libera TODO el pending para no bloquear la tipificación nueva del asesor
          // (por eso antes demoraba en llegar a la base principal).
          const asesorConfirmado = pend.campos.asesor !== undefined && reg.asesor === pend.campos.asesor
          if (asesorConfirmado || edad >= 8000) {
            delete pendingRef.current[l.id]
          } else {
            let quedan = 0
            for (const k in pend.campos) {
              const exp = pend.campos[k]
              if (k === 'historial' && Array.isArray(exp)) {
                // Mantiene el historial optimista (con tipifVendAntes) hasta que el
                // servidor lo confirme (su historial crece). Evita que la tipificación
                // derivada parpadee a "pendiente".
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
      setFechaCantidades(prev => ({
        ...prev,
        ...Object.fromEntries(Object.entries(nuevoBase).map(([fecha, regs]) => [fecha, regs.length])),
      }))

      // Conserva pestañas de fecha agregadas manualmente por el usuario que aún
      // no tienen leads en el backend (p.ej. mientras prepara una carga masiva),
      // en vez de que el polling las borre al no encontrar registros ahí.
      setFechaPestanas(prevFechas => {
        const combinado = Array.from(new Set([...prevFechas, ...nuevasFechas]))
        return combinado.sort().reverse()
      })
      setBaseData(prevBase => {
        const merged = { ...nuevoBase }
        for (const f in prevBase) {
          if (!merged[f]) { merged[f] = prevBase[f]; continue }
          // Conserva filas locales aún no guardadas (sin _backendId) que el polling
          // todavía no ve, para que no parpadeen (aparecen y desaparecen).
          const locales = prevBase[f].filter(r => !r._backendId)
          if (locales.length) merged[f] = [...merged[f], ...locales]
        }
        return merged
      })
      // fechaActiva ya no se resetea agresivamente: solo cambia si la fecha
      // activa actual ya no existe en ningún lado (ni en backend ni manual).
      setFechaActiva(prev => {
        const todasLasFechas = Array.from(new Set([...nuevasFechas, prev]))
        return todasLasFechas.includes(prev) ? prev : (nuevasFechas[0] || hoy)
      })
    } catch(e) { console.error('Error cargando leads:', e) }
    finally { if (!cargaPuntual) cargandoLeadsRef.current = false }
  }, [])

  useEffect(() => {
    fechaActivaRef.current = fechaActiva
    cargarLeads()
  }, [fechaActiva, cargarLeads])

  useEffect(() => {
    if (!filtros.global) return
    const timer = setTimeout(() => cargarLeads(true, '', {
      numero:filtros.numero, desde:filtros.desde, hasta:filtros.hasta,
    }), 300)
    return () => clearTimeout(timer)
  }, [filtros.global, filtros.numero, filtros.desde, filtros.hasta, cargarLeads])

  useEffect(() => {
    if (seccion !== 'rendimiento') return
    let desde = '', hasta = ''
    if (rendFiltroTipo === 'dia') desde = hasta = rendFiltroFecha
    if (rendFiltroTipo === 'mes') {
      desde = `${fechaHoy().slice(0,7)}-01`
      const [anio, mes] = fechaHoy().slice(0,7).split('-').map(Number)
      hasta = new Date(anio, mes, 0).toISOString().slice(0,10)
    }
    if (rendFiltroTipo === 'rango') { desde = rendDesde; hasta = rendHasta }
    cargarLeads(true, '', { desde, hasta })
  }, [seccion, rendFiltroTipo, rendFiltroFecha, rendDesde, rendHasta, cargarLeads])

  useEffect(() => {
    cargarAsesores()
    cargarFechas()
    cargarEstadosVentas()
    // Evita que varios usuarios saturen la API con consultas simultaneas. Los
    // cambios locales siguen siendo inmediatos y la sincronizacion remota se
    // confirma en el siguiente ciclo.
    const t = setVisibleInterval(cargarLeads, 2000)
    const tv = setVisibleInterval(cargarEstadosVentas, 15000)

    // Al regresar a la ventana no esperamos al siguiente ciclo del polling.
    const refrescarAlVolver = () => {
      if (document.visibilityState === 'visible') cargarLeads()
    }
    const refrescarAlEnfocar = () => cargarLeads()
    window.addEventListener('focus', refrescarAlEnfocar)
    document.addEventListener('visibilitychange', refrescarAlVolver)

    return () => {
      clearVisibleInterval(t)
      clearVisibleInterval(tv)
      window.removeEventListener('focus', refrescarAlEnfocar)
      document.removeEventListener('visibilitychange', refrescarAlVolver)
    }
  }, [cargarAsesores, cargarFechas, cargarLeads, cargarEstadosVentas])

  // BL modal reload on fecha change
  useEffect(() => {
    if (!blModal.open || blModal.asesorId == null) return
    setBlCargando(true)
    setBlLeads([])
    let url = `${API}/leads/avance-asesor?asesor_id=${blModal.asesorId}`
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
    setRotPanelOpen(false)
    if (id === 'carga-masiva') setLegacyFecha(fechaActiva)
    if (id === 'rendimiento') cargarLeads(true)
  }

  function abrirRotacionInteligente() {
    sessionStorage.setItem('nc_backoffice_apartado', 'base')
    setSeccion('base')
    setRotPanelOpen(true)
    setRotFiltroFecha(fechaHoy())
  }

  async function cambiarFechaRotacion(fecha) {
    setRotFiltroFecha(fecha)
    setRotSel({})
    if (!fecha || baseData[fecha]) return
    setRotCargandoFecha(true)
    try { await cargarLeads(false, fecha) }
    finally { setRotCargandoFecha(false) }
  }

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
    setLegacyFecha(f)
    setCmCalPicker('')
  }

  // ── Form (agregar registro individual) ───────────────────────────────────
  async function agregarRegistro() {
    const n1 = form.n1.replace(/\D/g, '')   // formato único: solo dígitos (999999999)
    const usuarioWhatsapp = form.usuarioWhatsapp.trim().replace(/^@+/, '')
    if (!n1 && !usuarioWhatsapp) { setN1Error(true); mostrarToast('Ingresa un N1 o un usuario de WhatsApp'); return }
    setN1Error(false)
    const campana  = form.campana.trim() || '—'
    const distrito = form.distrito || '—'
    const n2       = form.n2.replace(/\D/g, '')
    const tipo_contacto = form.tipoContacto || 'LLAMADA'
    const direccion = form.direccion.trim()
    const coordenadas = form.coordenadas.trim()
    const obs_back = form.obsBack.trim()
    const tipifBack = form.tipifBack
    const asesor   = form.asesor
    const hora     = asesor ? horaAhora() : ''
    const fecha    = fechaActiva
    const asignadoPor = asesor ? (sesion?.nombre || '') : ''
    const reg = {
      id:-idCntRef.current++, _backendId:null, campana, distrito, n1, n2, usuarioWhatsapp, tipo_contacto, direccion, coordenadas, obs_back, tipifBack, derivadoPor:tipifBack==='DERIVADO'&&asesor?(sesion?.nombre||''):'', asesor, horaAsig:hora,
      sinAsignar:!asesor, rotaciones:asesor?1:0, _tipifVend:'', _tipifHora:'',
      historial: asesor ? [{asesor, hora, fecha, asignadoPor, motivo:'Asignacion inicial'}] : [],
    }
    // Invalida cualquier poll iniciado antes de insertar el registro optimista.
    // Así una respuesta que todavía no contiene el nuevo lead no puede ocultarlo.
    mutGenRef.current++
    setBaseData(prev => ({ ...prev, [fecha]: [reg, ...(prev[fecha] || [])] }))
    setFechaPestanas(prev => prev.includes(fecha) ? prev : [...prev, fecha].sort().reverse())
    try {
      const res  = await fetch(`${API}/leads`, { method:'POST', headers:ncHeaders(), body:JSON.stringify({ campana, distrito, n1, n2, usuario_whatsapp:usuarioWhatsapp, tipo_contacto, direccion, coordenadas, obs_back, tipif_back:tipifBack, asesor_nombre:asesor, fecha, hora_asig:hora }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.mensaje || 'Error al guardar el registro')
      avisarBloqueadosTerna(data.bloqueados_terna)
      const bid  = data.ids?.[0] || data.id
      const quedoBlacklisteado = Boolean(data.bloqueados_terna?.some(b => b.id === bid))
      if (bid) {
        // El POST ya fue confirmado. Descarta también un poll que pudiera haberse
        // iniciado mientras se guardaba y que aún traiga la lista anterior.
        mutGenRef.current++
        setBaseData(prev => {
          const next = { ...prev }
          const arr  = [...(next[fecha] || [])]
          const idx  = arr.findIndex(r => r.id === reg.id)
          if (idx >= 0) {
            arr[idx] = { ...arr[idx], id: bid, _backendId: bid, ...(quedoBlacklisteado ? { _tipifVend: 'TERNA' } : {}) }
            next[fecha] = arr
          }
          return next
        })
      } else {
        // El backend omitió el lead en silencio (N1 repetido ese mismo día en
        // la misma campaña): no hay id que confirmar. Se retira el registro
        // fantasma sin mostrar error — no era un fallo, era el resultado esperado.
        setBaseData(prev => { const n={...prev}; n[fecha]=(n[fecha]||[]).filter(r=>r.id!==reg.id); return n })
      }
      setForm({ campana:'', dpto:'', prov:'', distrito:'', n1:'', n2:'', usuarioWhatsapp:'', tipoContacto:'LLAMADA', direccion:'', coordenadas:'', obsBack:'', tipifBack:'', asesor:'' })
    } catch(e) {
      // Elimina el registro local fantasma inmediatamente — no espera al polling
      setBaseData(prev => { const n={...prev}; n[fecha]=(n[fecha]||[]).filter(r=>r.id!==reg.id); return n })
      mostrarToast(e.message || 'No se pudo guardar el registro. Intenta nuevamente.')
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
      updateReg(id, { asesor:'', horaAsig:'', sinAsignar:true })
      if (reg._backendId) {
        try {
          const res = await fetch(`${API}/leads/${reg._backendId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ asesor_nombre:'', hora_asig:'' }) })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo quitar la asignación')
        } catch (e) {
          updateReg(id, { asesor:reg.asesor, horaAsig:reg.horaAsig, sinAsignar:reg.sinAsignar })
          mostrarToast(e.message || 'No se pudo quitar la asignación')
        }
      }
      return
    }
    const newHist = [...reg.historial, { asesor:nuevoAsesor, asesorAnterior:reg.asesor||'', reasignadoPor:sesion?.nombre||'', tipifVendAntes:tipifEfectiva(reg)||'', obsAsesorAntes:reg.obsAsesor||'', hora, fecha:fechaHoy(), motivo:'Reasignacion directa' }]
    updateReg(id, { asesor:nuevoAsesor, horaAsig:hora, sinAsignar:false, historial:newHist, rotaciones:cantidadRotaciones(reg)+1, _tipifVend:'', _tipifHora:'' })
    if (reg._backendId) {
      try {
        const res = await fetch(`${API}/leads/${reg._backendId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ asesor_nombre:nuevoAsesor, hora_asig:hora, historial:newHist, sumarRotacion:true }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo reasignar el lead')
      } catch (e) {
        updateReg(id, { asesor:reg.asesor, horaAsig:reg.horaAsig, sinAsignar:reg.sinAsignar, historial:reg.historial, rotaciones:reg.rotaciones, _tipifVend:reg._tipifVend, _tipifHora:reg._tipifHora })
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
        const res = await fetch(`${API}/leads/${found.reg._backendId}`, { method:'DELETE', headers:ncHeaders() })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo eliminar el lead')
      } catch (e) {
        setBaseData(prev => ({ ...prev, [found.fecha]: [found.reg, ...(prev[found.fecha] || []).filter(r => r.id !== id)] }))
        mostrarToast(e.message || 'No se pudo eliminar el lead')
      }
    }
  }

  // Elimina una asignación individual del historial: el número desaparece de la base
  // del asesor eliminado. Si era el titular actual, vuelve al asesor anterior (con su
  // tipificación) o queda sin asignar si no hay anterior.
  async function eliminarAsignacion(id, entry) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    if (!reg._backendId) { mostrarToast('Espera a que el registro termine de guardarse.'); return }
    if (!window.confirm(`¿Eliminar la asignación de ${entry.asesor}? El número desaparecerá de su base.`)) return
    try {
      const res  = await fetch(`${API}/leads/${reg._backendId}/eliminar-asignacion`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ asesor:entry.asesor, hora:entry.hora||'', fecha:entry.fecha||'' }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo eliminar la asignación')
      updateReg(id, {
        historial:  Array.isArray(data.historial) ? data.historial : reg.historial,
        asesor:     data.asesor || '',
        sinAsignar: !data.asesor,
        _tipifVend: data.tipif_vend ?? '',
        rotaciones: Number(data.rotaciones ?? 0),
      })
      mostrarToast('Asignación eliminada')
    } catch (e) { mostrarToast(e.message || 'Error al eliminar la asignación') }
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
        const res = await fetch(`${API}/leads/${reg._backendId}/tipif`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ tipif_vend:valor }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) {
          updateReg(id, { _tipifVend:data.tipif_vend || reg._tipifVend || '', _tipifHora:reg._tipifHora || '' })
          throw new Error(data.mensaje || 'No se pudo guardar la tipificaciÃ³n')
        }
      } catch (e) { mostrarToast(e.message || 'Error al guardar la tipificaciÃ³n') }
    }
  }

  // ── Tipif back ────────────────────────────────────────────────────────────
  async function guardarTipifBack(id, nuevoValor) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    const hora = horaAhora()
    const tipifAntes = reg.tipifBack || ''
    const esDer = nuevoValor === 'DERIVADO'
    const registraAutor = esDer || nuevoValor === 'LLAMANDO'
    const entrada = {
      tipo: esDer ? 'DERIVADO' : 'TIPIF_BACK',
      asesor: reg.asesor || '',
      hora, fecha: fechaHoy(),
      motivo: esDer ? 'Marcado DERIVADO' : 'Cambio tipif. back',
      tipifBackAntes: tipifAntes, tipifBackNueva: nuevoValor,
    }
    const newHist = [...reg.historial, entrada]
    const derivadoPor = registraAutor ? (sesion?.nombre || '') : ''
    updateReg(id, { tipifBack: nuevoValor, historial: newHist, derivadoPor })
    if (reg._backendId) {
      try {
        const res = await fetch(`${API}/leads/${reg._backendId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ tipif_back:nuevoValor }) })
        const data = await res.json().catch(()=>({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar Tipif. Back 1')
      } catch (e) {
        updateReg(id, { tipifBack:tipifAntes, historial:reg.historial, derivadoPor:reg.derivadoPor||'' })
        mostrarToast(e.message || 'Error al guardar Tipif. Back 1')
      }
    }
  }

  // ── Modal rotación manual ─────────────────────────────────────────────────
  function abrirModalRotar(id) {
    const found = findReg(id)
    if (!found) return
    const { reg } = found
    const otraDireccionDisponible = permiteOtraDireccion(reg)
    if (esRotacionManualProhibida(reg) && !otraDireccionDisponible && !tieneCicloVentaAbierto(reg)) {
      mostrarToast(`N1 ${reg.n1} no se puede rotar — ${razonBloqueoRotacion(reg)}`)
      return
    }
    const asignaciones = (Array.isArray(reg.historial) ? reg.historial : []).filter(h =>
      h?.asesor && !['TIPIF_VEND','TIPIF_BACK','DERIVADO','QUITAR_ASIGNACION'].includes(String(h?.tipo || '').toUpperCase())
    )
    const asesoresReactivables = [...new Set(asignaciones
      .filter(h => normalizarFecha(h?.fecha) < fechaHoy())
      .filter(h => !asignaciones.some(otra =>
        String(otra?.asesor || '').trim().toUpperCase() === String(h?.asesor || '').trim().toUpperCase()
        && normalizarFecha(otra?.fecha) === fechaHoy()
      ))
      .map(h => String(h.asesor).trim()))]
    const asesoresReasignables = [...new Set(asignaciones.map(h => String(h.asesor).trim()))]
    setModalRotar({
      open:true,
      regId:id,
      desc:`N1: ${reg.n1} — Asesor actual: ${reg.asesor||'Sin asignar'}`,
      asesorActual:reg.asesor,
      asesoresReactivables,
      asesoresReasignables,
      otraDireccionDisponible,
    })
    setRotModalAsesor('')
    setRotBusqueda('')
    setRotModalMotivo('')
    setRotModalTipo(otraDireccionDisponible ? 'OTRA_DIRECCION' : 'ROTACION')
    setRotModalError('')
  }

  async function confirmarRotacion() {
    if (!rotModalAsesor || rotandoManual) return
    setRotModalError('')
    const found = findReg(modalRotar.regId)
    if (!found) {
      const mensaje = 'El registro cambió. Abre nuevamente la opción Rotar.'
      setRotModalError(mensaje)
      mostrarToast(mensaje)
      return
    }
    const { reg } = found
    if (!reg._backendId) {
      const mensaje = 'Espera a que el registro termine de guardarse antes de rotarlo.'
      setRotModalError(mensaje)
      mostrarToast(mensaje)
      return
    }
    if (rotModalTipo === 'OTRA_DIRECCION') {
      setRotandoManual(true)
      try {
        const res = await fetch(`${API}/leads/${reg._backendId}/otra-direccion`, {method:'POST', headers:ncHeaders(), body:JSON.stringify({
          asesor_nombre:rotModalAsesor,
          motivo:rotModalMotivo.trim() || 'Otra dirección',
        })})
        const data = await res.json().catch(()=>({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo habilitar otra dirección')
        updateReg(modalRotar.regId, {
          asesor:rotModalAsesor, _asesorId:Number(data.asesor_id || reg._asesorId || 0) || null,
          tipifBack:'', tipifBack2:'', _tipifVend:'', _tipifHora:'',
          cicloAbiertoId:Number(data.ciclo_id || 0), cicloAbiertoNumero:Number(data.numero_ciclo || 0),
          cicloAbiertoTipo:'OTRA_DIRECCION', historial:data.historial || reg.historial,
          sinAsignar:false, horaAsig:horaAhora(),
        })
        setModalRotar({open:false,regId:null,desc:'',asesorActual:''})
        mostrarToast(data.mensaje || `Venta ${data.numero_ciclo} habilitada para otra dirección`)
        await cargarLeads()
      } catch(error) {
        setRotModalError(error.message || 'Error de conexión')
        mostrarToast(error.message || 'Error al habilitar otra dirección')
      } finally { setRotandoManual(false) }
      return
    }
    if (esRotacionManualProhibida(reg) && !tieneCicloVentaAbierto(reg)) {
      mostrarToast(`Rotación bloqueada: ${reg._tipifVend}`)
      setModalRotar({ open:false, regId:null, desc:'', asesorActual:'' })
      return
    }
    const motivo  = rotModalMotivo.trim() || 'Rotacion manual'
    setRotandoManual(true)
    try {
      let res = await fetch(`${API}/leads/${reg._backendId}/rotar`, { method:'POST', headers:ncHeaders(), body:JSON.stringify({
        asesor_nombre:rotModalAsesor, motivo,
        reactivacion_manual:true,
        asesor_id_esperado:reg._asesorId ?? null,
        rotaciones_esperadas:cantidadRotaciones(reg),
      }) })
      let data = await res.json().catch(() => ({}))

      // Si otro usuario alcanzó a rotarlo primero, sincroniza la versión que
      // devolvió el servidor y reintenta una vez con el asesor elegido.
      if (res.status === 409 && data.codigo === 'ROTACION_DESACTUALIZADA' && data.actual) {
        const actual = data.actual
        setModalRotar(p => ({
          ...p,
          asesorActual:actual.asesor || '',
          desc:`N1: ${reg.n1} — Asesor actual: ${actual.asesor || 'Sin asignar'}`,
        }))
        if (String(actual.asesor || '').trim().toUpperCase() === String(rotModalAsesor || '').trim().toUpperCase()) {
          throw new Error('El lead ya está asignado al asesor seleccionado')
        }
        res = await fetch(`${API}/leads/${reg._backendId}/rotar`, { method:'POST', headers:ncHeaders(), body:JSON.stringify({
          asesor_nombre:rotModalAsesor, motivo,
          reactivacion_manual:true,
          asesor_id_esperado:actual.asesor_id ?? null,
          rotaciones_esperadas:Number(actual.rotaciones || 0),
        }) })
        data = await res.json().catch(() => ({}))
      }
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo rotar el registro')
      if (data.nueva_instancia) {
        setModalRotar({ open:false, regId:null, desc:'', asesorActual:'' })
        mostrarToast(data.mensaje || `Nuevo formulario asignado a ${rotModalAsesor}`)
        await cargarLeads()
        return
      }
      // Actualización optimista: el backend ahora UPDATE (mismo ID), no crea duplicado.
      // histOpen[regId] se preserva; el polling sincronizará en ≤3s.
      updateReg(modalRotar.regId, {
        asesor:     rotModalAsesor,
        _asesorId:  data.asesor_id == null ? reg._asesorId : Number(data.asesor_id),
        horaAsig:   horaAhora(),
        sinAsignar: false,
        tipifBack:  '',
        derivadoPor:'',
        historial:  data.historial || reg.historial,
        rotaciones: Number(data.rotaciones ?? (cantidadRotaciones(reg) + 1)),
        _tipifVend: '',
        _tipifHora: '',
      })
      setModalRotar({ open:false, regId:null, desc:'', asesorActual:'' })
      mostrarToast(data.mensaje || `Registro rotado a ${rotModalAsesor}`)
    } catch (error) {
      const mensaje = error.message || 'Error de conexión al rotar'
      setRotModalError(mensaje)
      mostrarToast(mensaje)
      // Si otro usuario ganó la carrera, reemplaza de inmediato la copia local
      // obsoleta con el estado confirmado por el servidor.
      await cargarLeads()
    } finally {
      setRotandoManual(false)
    }
  }

  // ── Rotation panel ────────────────────────────────────────────────────────
  function buildRotLeads() {
    const ahora = new Date()
    const list  = []
    const fechas = rotFiltroFecha ? [rotFiltroFecha] : Object.keys(baseData).sort().reverse()
    fechas.forEach(fecha => {
      const regsDate = baseData[fecha] || []
      regsDate.forEach(reg => {
        const asignaciones = reg.historial.filter(h=>h?.asesor&&!['TIPIF_VEND','TIPIF_BACK','DERIVADO'].includes(String(h.tipo||'').toUpperCase()))
        const ultimaEntrada = ultimaAsignacionReg(reg)
        const fechaAsignacion = normalizarFecha(ultimaEntrada?.fecha) || fecha
        const horaAsignacion = ultimaEntrada?.hora || reg.horaAsig || '00:00'
        let ultimaAsig = new Date(fechaAsignacion+'T'+horaAsignacion+':00')
        if (isNaN(ultimaAsig)) ultimaAsig = new Date(ahora.getTime() - 24*3600000)
        const histAsesores = asignaciones.map(h=>h.asesor)
        const tipifActual = String(tipifEfectiva(reg) || '').trim().toUpperCase()
        if (!tipifActual || tipifActual === 'NUEVO') return
        // VENTA CAIDA se recupera únicamente mediante rotación manual.
        if (esVentaCaidaInterna(reg)) return
        // SIN COBERTURA solo puede pasar por 2 asesores en total vía Rotación
        // Inteligente: la asignación inicial ya cuenta como 1 rotación
        // (asesor 1 = rotación 1, asesor 2 = rotación 2). Rotación manual no
        // tiene este límite.
        if (tipifActual === 'SIN COBERTURA' && cantidadRotaciones(reg) >= 2) return
        if (TIPIF_EXCLUIDAS_ROTACION.has(tipifActual) || esLeadProhibido(reg)) return
        const nNorm = normalizarNumero(reg.n1)
        // Protección VERDE/CELESTE/ROJO/AMARILLO: cualquier lead con venta activa/rechazada → no rota
        if (resaltadoPorVenta(ventasPorNumero[nNorm])) return
        list.push({ id:reg.id, tel:reg.n1, campana:reg.campana, n2:reg.n2||'', estado:tipifActual, tipifVend:tipifActual, asesor:reg.asesor||'', ultimaAsig, fecha, fechaAsignacion, histAsesores, _reg:reg })
      })
    })
    return list
  }

  function rotApto(lead, asesor) {
    const ahora = new Date()
    if (!asesor) return { apto:false, prohibido:false }
    const asesorNorm = String(asesor || '').trim().toUpperCase()
    const sinRepetir = !lead.histAsesores.some(nombre => String(nombre || '').trim().toUpperCase() === asesorNorm)
    const mins = Math.floor((ahora - lead.ultimaAsig)/60000)
    const esBaseHoy = lead.fecha === fechaHoy()
    const tiempo = esBaseHoy || mins >= 120
    const estadoOk = !TIPIF_EXCLUIDAS_ROTACION.has((lead.tipifVend||'').trim().toUpperCase())
    return { apto:sinRepetir&&tiempo&&estadoOk, prohibido:false, sinRepetir, tiempo, estadoOk, esBaseHoy }
  }

  function rotMins(f) { return Math.floor((new Date() - f)/60000) }
  function rotTxt(f) { const m=rotMins(f); if(m<60) return m+' min'; const h=Math.floor(m/60),r=m%60; return h+'h'+(r>0?' '+r+'min':'') }
  function rotFaltanTxt(mins) { const r=120-mins; if(r<=0) return ''; const h=Math.floor(r/60),m=r%60; return h>0?`Faltan ${h}h${m>0?' '+m+' min':''}`:`Faltan ${r} min` }

  async function validarSeleccionRotacionEnServidor(selToUse) {
    const seleccionados = buildRotLeads().filter(l => selToUse[l.id])
    const fechas = [...new Set(seleccionados.map(l => l.fecha).filter(Boolean))]
    const respuestas = await Promise.all(fechas.map(async fecha => {
      const respuesta = await fetch(`${API}/leads?fecha=${encodeURIComponent(fecha)}&_rotcheck=${Date.now()}`, {
        headers:ncHeaders(), cache:'no-store',
      })
      const data = await respuesta.json().catch(() => ({}))
      if (!respuesta.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo actualizar la lista de rotación')
      return Array.isArray(data.data) ? data.data : []
    }))
    const actuales = new Map(respuestas.flat().map(l => [Number(l.id), l]))
    const vigentes = {}
    const omitidos = []
    for (const lead of seleccionados) {
      const local = lead._reg
      const servidor = actuales.get(Number(local._backendId))
      const mismoAsesor = servidor && Number(servidor.asesor_id || 0) === Number(local._asesorId || 0)
      const mismasRotaciones = servidor && cantidadRotaciones(servidor) === cantidadRotaciones(local)
      const mismaTipificacion = servidor
        && String(servidor.tipif_vend || '').trim().toUpperCase() === String(local._tipifVend || '').trim().toUpperCase()
      if (servidor && mismoAsesor && mismasRotaciones && mismaTipificacion) {
        vigentes[lead.id] = true
      } else {
        omitidos.push({ tel:lead.tel, error:'Se actualizó antes de ejecutar; fue retirado automáticamente de la selección' })
      }
    }
    return { vigentes, omitidos }
  }

  async function rotFinalizarWith(selToUse, asesorActual, resultadosPrevios = []) {
    const hora     = horaAhora()
    const allLeads = buildRotLeads()
    // Se valida otra vez al ejecutar para impedir selecciones antiguas o cambios
    // de tipificación ocurridos mientras el panel estaba abierto.
    const rotados  = allLeads.filter(l => selToUse[l.id] && rotApto(l, asesorActual).apto)
    const res = [...resultadosPrevios]
    for (const l of rotados) {
      const reg = l._reg
      if (!reg._backendId) continue
      try {
        const respuesta = await fetch(`${API}/leads/${reg._backendId}/rotar`, { method:'POST', headers:ncHeaders(), body:JSON.stringify({
          asesor_nombre:asesorActual, motivo:'Rotacion masiva',
          asesor_id_esperado:reg._asesorId ?? null,
          rotaciones_esperadas:cantidadRotaciones(reg),
        }) })
        const data = await respuesta.json().catch(() => ({}))
        if (respuesta.ok && data.ok) {
          updateReg(reg.id, {
            asesor:data.asesor||asesorActual, horaAsig:hora, horaAsigDisplay:hora,
            _asesorId:data.asesor_id == null ? reg._asesorId : Number(data.asesor_id),
            rotaciones:Number(data.rotaciones ?? (cantidadRotaciones(reg)+1)),
            historial:Array.isArray(data.historial)?data.historial:reg.historial,
            sinAsignar:false, _tipifVend:'', _tipifHora:'',
          })
          res.push({ tel:reg.n1, asesor:asesorActual, hora })
        } else {
          res.push({ tel:reg.n1, error:data.mensaje || 'El registro cambió antes de rotarlo' })
        }
      } catch {
        res.push({ tel:reg.n1, error:'No se pudo sincronizar la rotación' })
      }
    }
    await cargarLeads()
    setRotResultado(res)
    setRotSel({})
  }

  async function rotEjecutar() {
    if (!rotAsesor) return
    if (rotandoRef.current) return
    rotandoRef.current = true
    try {
      const asesorActual = rotAsesor
      let selToUse = { ...rotSel }
      if (Object.keys(selToUse).length === 0) {
        const aptos = rotVistaAsignacion.slice(0, rotCant)
        if (!aptos.length) {
          mostrarToast('No hay leads aptos para ' + asesorActual)
          rotandoRef.current = false
          return
        }
        const newSel = {}
        aptos.forEach(l => { newSel[l.id] = true })
        setRotSel(newSel)
        selToUse = newSel
      } else {
        // Cap manual selection to rotCant
        const ids = Object.keys(selToUse).filter(k => selToUse[k]).slice(0, rotCant)
        selToUse = {}
        ids.forEach(k => { selToUse[k] = true })
      }
      setRotProgress(25)
      setTimeout(() => setRotProgress(50), 200)
      setTimeout(() => setRotProgress(75), 400)
      setTimeout(async () => {
        try {
          const { vigentes, omitidos } = await validarSeleccionRotacionEnServidor(selToUse)
          if (Object.keys(vigentes).length === 0) {
            await cargarLeads()
            setRotResultado(omitidos)
            setRotSel({})
          } else {
            await rotFinalizarWith(vigentes, asesorActual, omitidos)
          }
          setRotProgress(100)
          setTimeout(() => setRotProgress(0), 1000)
        } catch (e) {
          setRotResultado([{ tel:'Rotación', error:e.message || 'No se pudo actualizar la lista antes de ejecutar' }])
          setRotSel({})
        } finally {
          rotandoRef.current = false
        }
      }, 600)
    } catch {
      rotandoRef.current = false
    }
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
  // Duplicado = mismo N1 + misma fecha destino + misma campaña destino. Un
  // N1 que ya existe en OTRA campaña ese día no cuenta como duplicado aquí:
  // es un lead independiente y válido para la campaña que se está cargando.
  function obtenerN1Existentes(fecha, campana) {
    const set = new Set()
    const campanaNorm = (campana||'').trim().toUpperCase()
    ;(baseData[fecha]||[]).forEach(r => {
      if (r.n1 && (r.campana||'').trim().toUpperCase() === campanaNorm) set.add(String(r.n1).replace(/\s+/g,''))
    })
    return set
  }

  function previsualizarMasiva() {
    const raw = masivaNums.trim()
    if (!raw) { mostrarToast('Pega numeros primero'); return }
    const numsRaw = raw.split(/[\n,;]+/).map(n=>n.trim().replace(/\s+/g,'')).filter(n=>n.length>=7)
    if (!numsRaw.length) { mostrarToast('No se encontraron numeros validos'); return }
    const lote = masivaLote === '0' ? numsRaw.length : (parseInt(masivaLote) || 10)
    const numsLote   = numsRaw.slice(0, lote)
    const existentes = obtenerN1Existentes(fechaActiva, masivaCamp.trim() || '—')
    const vistos = new Set()
    const filas  = []
    numsLote.forEach(n => {
      let dup=false, motivo=''
      if (vistos.has(n)) { dup=true; motivo='Repetido en la lista' }
      else if (existentes.has(n)) { dup=true; motivo='Ya esta en esta campaña ese día' }
      vistos.add(n)
      filas.push({ n1:n, dup, motivo })
    })
    setMasivaFilas(filas)
    setInclDup(false)
  }

  async function enviarLeadsEnLotes(leads) {
    const LOTE = 499
    let creados = 0
    const ids = []
    const bloqueadosTerna = []
    for (let i = 0; i < leads.length; i += LOTE) {
      const batch = leads.slice(i, i + LOTE)
      let data
      try {
        const res = await fetch(`${API}/leads`, { method:'POST', headers:ncHeaders(), body:JSON.stringify(batch) })
        data = await res.json()
      } catch(e) {
        throw new Error(`Error de red al enviar lote ${Math.floor(i/LOTE)+1}: ${e.message}`)
      }
      if (!data.ok) throw new Error(data.mensaje || 'El servidor rechazó el lote de leads')
      creados += data.creados || 0
      if (data.ids) ids.push(...data.ids)
      if (data.bloqueados_terna) bloqueadosTerna.push(...data.bloqueados_terna)
    }
    avisarBloqueadosTerna(bloqueadosTerna)
    return { creados, ids, bloqueadosTerna }
  }

  async function ejecutarCargaMasiva() {
    if (cargandoMasiva) return
    const lista = (inclDup ? masivaFilas : masivaFilas.filter(f=>!f.dup)).map(f=>f.n1)
    if (!lista.length) { mostrarToast('No hay numeros para cargar'); return }
    setCargandoMasiva(true)
    setImportResult(null)
    const campana = masivaCamp.trim() || '—'
    const asesor  = masivaAsesor
    const hora    = asesor ? horaAhora() : ''
    const fecha   = fechaActiva
    const leadsParaBackend = []
    const nuevosRegs = []
    const filaResult = []
    const campanaNorm = campana.trim().toUpperCase()
    lista.forEach(n1 => {
      if ((baseData[fecha]||[]).find(r=>r.n1===n1 && (r.campana||'').trim().toUpperCase()===campanaNorm)) {
        filaResult.push({ n1, campana, resultado:'DUPLICADO', motivo:'Ya existe en esta campaña ese día' })
        return
      }
      const reg = { id:-idCntRef.current++, _backendId:null, campana, distrito:'—', n1, n2:'', tipifBack:'', asesor, horaAsig:hora, sinAsignar:!asesor, rotaciones:0, _tipifVend:'', _tipifHora:'', historial:asesor?[{asesor,hora,fecha,motivo:'Carga masiva'}]:[] }
      nuevosRegs.push(reg)
      leadsParaBackend.push({ campana, distrito:'—', n1, n2:'', tipif_back:'', asesor_nombre:asesor, fecha, hora_asig:hora })
      filaResult.push({ n1, campana, resultado:'IMPORTADO', motivo:'' })
    })
    if (nuevosRegs.length) {
      setBaseData(prev => ({ ...prev, [fecha]:[...(prev[fecha]||[]), ...nuevosRegs] }))
      setFechaPestanas(prev => prev.includes(fecha) ? prev : [...prev, fecha].sort().reverse())
      try {
        const { ids, bloqueadosTerna } = await enviarLeadsEnLotes(leadsParaBackend)
        if (ids.length) {
          const idsBlacklist = new Set((bloqueadosTerna||[]).map(b=>b.id))
          setBaseData(prev => {
            const next = { ...prev }
            const arr  = [...(next[fecha]||[])]
            const off  = arr.length - nuevosRegs.length
            ids.forEach((bid,i) => { if(arr[off+i]) arr[off+i]={...arr[off+i],_backendId:bid,...(idsBlacklist.has(bid)?{_tipifVend:'TERNA'}:{})} })
            next[fecha] = arr
            return next
          })
        }
      } catch(e) { mostrarToast(`Advertencia: ${e.message}`) }
    }
    const importados = filaResult.filter(f=>f.resultado==='IMPORTADO').length
    const duplicados = filaResult.filter(f=>f.resultado==='DUPLICADO').length
    setImportResult({ metodo:'pegar', fecha, total:lista.length, importados, duplicados, errores:0, filas:filaResult })
    setMasivaNums(''); setMasivaFilas([]); setInclDup(false)
    setCargandoMasiva(false)
  }

  async function leerArchivoComoTexto(file) {
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

  async function procesarArchivo(file) {
    setArchivoStatus(`Leyendo ${file.name}...`)
    let text
    try { text = await leerArchivoComoTexto(file) }
    catch(e) { setArchivoStatus('Error leyendo el archivo'); return }
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

  async function ejecutarCargaArchivo() {
    if (!archivoRows.length || cargandoMasiva) { if(!archivoRows.length) mostrarToast('No hay datos'); return }
    setCargandoMasiva(true)
    setImportResult(null)
    const fecha = fechaActiva
    const nuevos = []; const leadsBackend = []; const filaResult = []
    archivoRows.forEach(r => {
      if ((baseData[fecha]||[]).find(x=>x.n1===r.n1)) {
        filaResult.push({ n1:r.n1, campana:r.camp, resultado:'DUPLICADO', motivo:'Ya existe en la fecha destino' })
        return
      }
      nuevos.push({ id:-idCntRef.current++, _backendId:null, campana:r.camp, distrito:r.dist, n1:r.n1, n2:r.n2, tipifBack:r.tipif, asesor:'', horaAsig:'', sinAsignar:true, rotaciones:0, _tipifVend:'', _tipifHora:'', historial:[] })
      leadsBackend.push({ campana:r.camp, distrito:r.dist, n1:r.n1, n2:r.n2, tipif_back:r.tipif, asesor_nombre:'', fecha, hora_asig:'' })
      filaResult.push({ n1:r.n1, campana:r.camp, resultado:'IMPORTADO', motivo:'' })
    })
    if (nuevos.length) {
      setBaseData(prev => ({ ...prev, [fecha]:[...(prev[fecha]||[]), ...nuevos] }))
      setFechaPestanas(prev => prev.includes(fecha) ? prev : [...prev, fecha].sort().reverse())
      try { await enviarLeadsEnLotes(leadsBackend) }
      catch(e) { mostrarToast(`Advertencia: ${e.message}`) }
    }
    const importados = filaResult.filter(f=>f.resultado==='IMPORTADO').length
    const duplicados = filaResult.filter(f=>f.resultado==='DUPLICADO').length
    setImportResult({ metodo:'archivo', fecha, total:archivoRows.length, importados, duplicados, errores:0, filas:filaResult })
    setArchivoRows([]); setArchivoInfo(''); setArchivoStatus('')
    if (archivoInputRef.current) archivoInputRef.current.value = ''
    setCargandoMasiva(false)
  }

  async function procesarLegacy(file) {
    setLegacyStatus(`Leyendo ${file.name}...`)
    setLegacyError('')
    setImportResult(null)
    let text
    try { text = await leerArchivoComoTexto(file) }
    catch(e) { setLegacyStatus('Error leyendo el archivo'); return }
    const lineas = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0)
    if (!lineas.length) { setLegacyStatus('Archivo vacío'); return }
    const sep = lineas[0].includes('\t')?'\t':lineas[0].includes(';')?';':','
    const prim = lineas[0].split(sep).map(x=>x.trim().replace(/^["']|["']$/g,''))
    const usarFF = legacyUsarFecha === 'si'
    // Column positions: 'si' = new format (FECHA first, N1 at c[4]); 'no' = old format (N1 at c[3])
    const N1_COL = usarFF ? 4 : 3
    const p = (prim[N1_COL]||'').replace(/\D/g,'')
    const cab = isNaN(p) || p.length < 6
    const datos = cab ? lineas.slice(1) : lineas

    function parseFechaFila(raw) {
      if (!raw) return { fecha:'', error:true, msg:'Sin fecha' }
      const s = String(raw).trim()
      const mDMY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (mDMY) return { fecha:`${mDMY[3]}-${mDMY[2].padStart(2,'0')}-${mDMY[1].padStart(2,'0')}`, error:false, msg:'' }
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { fecha:s, error:false, msg:'' }
      const mDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
      if (mDash) return { fecha:`${mDash[3]}-${mDash[2].padStart(2,'0')}-${mDash[1].padStart(2,'0')}`, error:false, msg:'' }
      // Número serial de Excel (p.ej. 46034 = 01/08/2026)
      const n = Number(s)
      if (!isNaN(n) && n > 40000 && n < 60000) {
        const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000)
        return { fecha:`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`, error:false, msg:'' }
      }
      return { fecha:'', error:true, msg:`Formato no reconocido: "${s.slice(0,20)}"` }
    }

    const rows = []
    datos.forEach(linea => {
      const c = linea.split(sep).map(x=>x.trim().replace(/^["']|["']$/g,''))
      let n1, campana, distrito, n2, tipifBack, tipifVend, hora, comentario, asesoresHist
      if (usarFF) {
        // Nuevo formato: FECHA(0) CAMPAÑA(1) DISTRITO(2) N2(3) N1(4) TIPIFB(5) COM(6) TIPIFV(7) HORA(8) ASE(9-14)
        n1=(c[4]||'').replace(/[^0-9]/g,''); campana=c[1]||'—'; distrito=c[2]||'—'
        n2=limpiarN2Legacy(c[3]||'')
        tipifBack=c[5]||''; comentario=c[6]||''; tipifVend=c[7]||''; hora=c[8]||''
        asesoresHist=[]; for(let i=9;i<=14;i++){const a=(c[i]||'').trim();if(a&&a.length>1)asesoresHist.push(a)}
      } else {
        // Formato original: CAMPAÑA(0) DISTRITO(1) N2(2) N1(3) TIPIFB(4) COM(5) TIPIFV(6) HORA(7) ASE(8-13)
        n1=(c[3]||'').replace(/[^0-9]/g,''); campana=c[0]||'—'; distrito=c[1]||'—'
        n2=limpiarN2Legacy(c[2]||'')
        tipifBack=c[4]||''; comentario=c[5]||''; tipifVend=c[6]||''; hora=c[7]||''
        asesoresHist=[]; for(let i=8;i<=13;i++){const a=(c[i]||'').trim();if(a&&a.length>1)asesoresHist.push(a)}
      }
      // Normalizar tipifVend: alias del sistema antiguo
      const tipNorm=(tipifVend||'').trim().toUpperCase()
      if(tipNorm==='SH NO ROTAR'||tipNorm==='SH NO TOCAR') tipifVend='NO ROTAR'
      else if(tipNorm==='SH INSTALADO') tipifVend='INSTALADO'
      if (!n1||n1.length<6) return
      let fechaFila=legacyFecha, fechaError=false, fechaErrorMsg=''
      if (usarFF) {
        const r = parseFechaFila(c[0])
        fechaFila=r.fecha; fechaError=r.error; fechaErrorMsg=r.msg
        if (!fechaError) {
          if (legacyDesde && fechaFila < legacyDesde) { fechaError=true; fechaErrorMsg=`Antes del rango (${formatFecha(legacyDesde)})` }
          else if (legacyHasta && fechaFila > legacyHasta) { fechaError=true; fechaErrorMsg=`Después del rango (${formatFecha(legacyHasta)})` }
        }
      }
      rows.push({ fecha:fechaFila, _fechaError:fechaError, _fechaErrorMsg:fechaErrorMsg, campana, distrito, n2, n1, tipifBack, tipifVend, hora, comentario, asesores:asesoresHist })
    })
    if (!rows.length) { setLegacyStatus('No se encontraron filas válidas'); return }
    setLegacyRows(rows); setLegacyInfo(`${rows.length} registros desde "${file.name}"`); setLegacyStatus('')
  }

  async function importarLegadoEnLotes(registros) {
    const LOTE = 200
    let creados=0, actualizados=0, existentes=0, errores=0
    const erroresDetalle = []
    const bloqueadosTerna = []
    for (let i=0; i<registros.length; i+=LOTE) {
      const batch = registros.slice(i, i+LOTE)
      let data
      try {
        const res = await fetch(`${API}/leads/import-legacy`, { method:'POST', headers:ncHeaders(), body:JSON.stringify({ registros: batch, permitirDuplicados: true }) })
        data = await res.json()
      } catch(e) {
        throw new Error(`Error de red (lote ${Math.floor(i/LOTE)+1}): ${e.message}`)
      }
      if (!data.ok) throw new Error(data.detalle || data.mensaje || 'El servidor rechazó el lote')
      creados    += data.creados    || 0
      actualizados += data.actualizados || 0
      existentes += data.existentes || 0
      errores    += data.errores    || 0
      if (data.erroresDetalle) erroresDetalle.push(...data.erroresDetalle)
      if (data.bloqueados_terna) bloqueadosTerna.push(...data.bloqueados_terna)
    }
    avisarBloqueadosTerna(bloqueadosTerna)
    return { creados, actualizados, existentes, errores, erroresDetalle }
  }

  async function ejecutarCargaLegacy() {
    if (!legacyRows.length || cargandoLegacy) { if(!legacyRows.length) mostrarToast('No hay datos'); return }
    if (legacyUsarFecha === 'no' && legacyFecha > fechaHoy()) {
      setLegacyError('No se permiten fechas futuras. Selecciona una fecha igual o anterior a hoy.')
      return
    }
    setCargandoLegacy(true)
    setImportResult(null)
    setLegacyError('')
    const leadsBackend = []
    const distribFechas = {}
    let erroresFecha = 0
    legacyRows.forEach(r => {
      if (r._fechaError) { erroresFecha++; return }
      const f = r.fecha
      leadsBackend.push({
        campana:    r.campana,
        distrito:   r.distrito,
        n1:         r.n1,
        n2:         r.n2,
        tipif_back: r.tipifBack,
        tipif_vend: r.tipifVend,
        asesores:   r.asesores,
        fecha:      f,
        hora:       r.hora,
        comentario: r.comentario || '',
      })
      distribFechas[f] = (distribFechas[f]||0) + 1
    })
    const fechasImportadas = Object.keys(distribFechas).sort()
    const fechaNav = fechasImportadas[0] || legacyFecha
    try {
      let resultado = { creados:0, actualizados:0, existentes:0, errores:erroresFecha, erroresDetalle:[] }
      if (leadsBackend.length) {
        const r = await importarLegadoEnLotes(leadsBackend)
        resultado = { ...r, errores: r.errores + erroresFecha }
      }
      await cargarLeads()
      if (fechasImportadas.length) setFechaActiva(fechaNav)
      setImportResult({
        metodo:'legacy',
        fecha:fechaNav,
        fechas:fechasImportadas,
        distribucion:distribFechas,
        total:legacyRows.length,
        importados: resultado.creados + resultado.actualizados,
        creados: resultado.creados,
        actualizados: resultado.actualizados,
        existentes: resultado.existentes,
        duplicados: resultado.existentes,
        errores: resultado.errores,
        erroresDetalle: resultado.erroresDetalle,
        filas:[],
      })
      setLegacyRows([]); setLegacyInfo(''); setLegacyStatus('')
      if (legacyInputRef.current) legacyInputRef.current.value = ''
    } catch(e) {
      setLegacyError(e.message || 'Error al importar. Intente de nuevo.')
    } finally {
      setCargandoLegacy(false)
    }
  }

  function descargarFormato() {
    const wb = XLSX.utils.book_new()
    const HDR = ['FECHA','CAMPAÑA','DISTRITO','N2','N1','TIPIF. BACK','COMENTARIO','TIPIFICACIÓN','HORA','ASESOR 1','ASESOR 2','ASESOR 3','ASESOR 4','ASESOR 5','ASESOR 6']
    const COLS = HDR.map((_,i)=>({ wch: i===0?13 : i===4||i===3?15 : i>=9?13 : i===8?10 : 18 }))
    // Hoja 1: plantilla vacía — solo encabezados
    const ws1 = XLSX.utils.aoa_to_sheet([HDR])
    ws1['!cols'] = COLS
    ws1['!freeze'] = { xSplit: 0, ySplit: 1 }
    ws1['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(HDR.length-1)}1` }
    XLSX.utils.book_append_sheet(wb, ws1, 'CARGA SISTEMA ANTIGUO')
    // Hoja 2: datos de ejemplo ficticios con 4 fechas distintas
    const ws2 = XLSX.utils.aoa_to_sheet([
      HDR,
      ['01/08/2026','CAMP ADMI','SAN BORJA','987654320','987654321','NC','Llamó y cortó','AGENDADO','17:11','DERWIN PEREZ','LUCAS GOMEZ','','','',''],
      ['02/08/2026','CAMP ADMI','MIRAFLORES','','912345678','NO CONTESTA','','NO CONTESTA','09:30','MARIA RIOS','','','','',''],
      ['03/08/2026','NKT FIBRA','SURCO','976543211','976543210','BUZON DE VOZ','Sin respuesta','NO CONTESTA','11:45','CARLOS VEGA','PEDRO LUNA','','','',''],
      ['04/08/2026','NKT FIBRA','LA MOLINA','','945612378','NC','','AGENDADO','14:00','ANA TORRES','','','','',''],
    ])
    ws2['!cols'] = COLS
    ws2['!freeze'] = { xSplit: 0, ySplit: 1 }
    XLSX.utils.book_append_sheet(wb, ws2, 'EJEMPLO')
    // Hoja 3: instrucciones
    const INSTR = [
      ['INSTRUCCIONES — CARGA SISTEMA ANTIGUO'],
      [''],
      ['IMPORTANTE: No modifique el nombre ni el orden de las columnas.'],
      [''],
      ['Columna','Descripción','Obligatorio','Notas'],
      ['FECHA','Fecha del registro','SÍ (modo histórico)','Formato recomendado: DD/MM/YYYY — ej: 01/08/2026. También acepta YYYY-MM-DD.'],
      ['CAMPAÑA','Nombre de campaña','No','Texto libre'],
      ['DISTRITO','Distrito del contacto','No','Texto libre'],
      ['N2','Número secundario','No','Guardar como texto para conservar ceros iniciales'],
      ['N1','Número principal (teléfono)','SÍ','Guardar como texto para conservar ceros iniciales'],
      ['TIPIF. BACK','Tipificación del área Back Data','No','NC · BUZON DE VOZ · NO CONTESTA · DERIVADO'],
      ['COMENTARIO','Comentario libre','No','No se importa al sistema, solo referencia'],
      ['TIPIFICACIÓN','Tipificación del asesor/vendedor','No','VENTA CERRADA · AGENDADO · NO CONTESTA · etc.'],
      ['HORA','Hora de la última gestión','No','Formato HH:MM — ejemplo: 17:11'],
      ['ASESOR 1 … ASESOR 6','Historial de asesores','No','Nombre completo tal como aparece en el sistema'],
      [''],
      ['NOTAS ADICIONALES'],
      ['— FECHA es obligatoria cuando se usa el modo "Usar fecha del archivo" (modo predeterminado).'],
      ['— En modo "Usar una sola fecha para todo el archivo", la columna FECHA es ignorada.'],
      ['— Use la hoja "CARGA SISTEMA ANTIGUO" para pegar sus datos.'],
      ['— Use la hoja "EJEMPLO" como referencia: 4 registros en 4 fechas distintas.'],
      ['— N1 es el campo de teléfono principal y es siempre obligatorio.'],
      ['— Si un N1 ya existe en la misma fecha, la fila se omite como duplicado.'],
      ['— Un mismo N1 puede aparecer en fechas diferentes (no se considera duplicado).'],
      ['— Formatos de archivo aceptados: .xlsx · .csv (comas o punto y coma) · .txt'],
    ]
    const ws3 = XLSX.utils.aoa_to_sheet(INSTR)
    ws3['!cols'] = [{ wch:26 },{ wch:36 },{ wch:20 },{ wch:60 }]
    ws3['!rows'] = [{ hpt:18 }]
    XLSX.utils.book_append_sheet(wb, ws3, 'INSTRUCCIONES')
    XLSX.writeFile(wb, 'FORMATO_CARGA_SISTEMA_ANTIGUO.xlsx')
  }

  // ── BL Modal ──────────────────────────────────────────────────────────────
  function abrirBlModal(nombre, asesorId) {
    setBlModal({ open:true, nombre, asesorId })
    setBlFecha(fechaHoy())
    setBlBuscar('')
    setBlFiltroTipif('')
    setBlFiltroBack('')
  }

  // ── Computed values ───────────────────────────────────────────────────────
  const registrosActivos = baseData[fechaActiva] || []
  const ocurrenciaDiariaPorId = (() => {
    const conteoPorNumero = new Map()
    const ocurrencias = new Map()
    // La API entrega los registros mas recientes primero. Se recorre al reves
    // para numerar desde la primera caida real del dia.
    for (let i = registrosActivos.length - 1; i >= 0; i--) {
      const n1 = normalizarNumero(registrosActivos[i].n1)
      if (!n1) continue
      const ocurrencia = (conteoPorNumero.get(n1) || 0) + 1
      conteoPorNumero.set(n1, ocurrencia)
      ocurrencias.set(registrosActivos[i].id, ocurrencia)
    }
    return ocurrencias
  })()
  const idsReingresados = (() => {
    const vistos = new Set()
    const reingresados = new Set()
    Object.keys(baseData).sort().forEach(fecha => {
      ;(baseData[fecha] || []).forEach(reg => {
        const n1 = normalizarNumero(reg.n1)
        if (!n1) return
        if (vistos.has(n1)) reingresados.add(reg.id)
        else vistos.add(n1)
      })
    })
    return reingresados
  })()

  // Todo número resaltado por duplicidad o por encontrarse en el flujo de ventas
  // queda protegido automáticamente. Se conserva su historial y solo cambia la
  // tipificación vigente a NO ROTAR.
  const registrosBusquedaGlobal = filtros.global
    ? Object.entries(baseData)
        .filter(([fecha]) => (!filtros.desde || fecha >= filtros.desde) && (!filtros.hasta || fecha <= filtros.hasta))
        .flatMap(([fecha, regs]) => (regs || []).map(r => ({ ...r, _fechaBase:fecha })))
    : registrosActivos.map(r => ({ ...r, _fechaBase:fechaActiva }))
  const conteoDuplicadosAlcance = registrosBusquedaGlobal.reduce((conteo, reg) => {
    const numero = normalizarNumero(reg.n1)
    if (numero) conteo.set(numero, (conteo.get(numero) || 0) + 1)
    return conteo
  }, new Map())
  const gruposProtegidos = {
    sin_cobertura: registrosBusquedaGlobal.filter(r => String(tipifEfectiva(r)||'').trim().toUpperCase() === 'SIN COBERTURA'),
    no_tocar: registrosBusquedaGlobal.filter(r => ['NO TOCAR','SH NO TOCAR','NO ROTAR','SH NO ROTAR'].includes(String(tipifEfectiva(r)||'').trim().toUpperCase())),
    venta_cerrada: registrosBusquedaGlobal.filter(r => String(tipifEfectiva(r)||'').trim().toUpperCase() === 'VENTA CERRADA'),
    venta_caida: registrosBusquedaGlobal.filter(r => String(tipifEfectiva(r)||'').trim().toUpperCase() === 'VENTA CAIDA'),
    instalado: registrosBusquedaGlobal.filter(r => String(tipifEfectiva(r)||'').trim().toUpperCase() === 'INSTALADO'),
    blacklist: registrosBusquedaGlobal.filter(r => String(tipifEfectiva(r)||'').trim().toUpperCase() === 'TERNA'),
  }
  const todosLosRegistrosBase = Object.values(baseData).flat()
  const campanasFiltroBase = [...new Set([
    ...CAMPANAS,
    ...todosLosRegistrosBase.map(r=>String(r.campana||'').trim()).filter(Boolean),
  ])].sort((a,b)=>a.localeCompare(b,'es'))
  const salaDeRegistro = reg => {
    const asesorNorm = String(reg?.asesor || '').trim().toUpperCase()
    if (!asesorNorm) return 'SIN ASIGNAR'
    return String(asesores.find(a=>String(a.nombre||'').trim().toUpperCase()===asesorNorm)?.sala || 'SIN SALA').trim().toUpperCase()
  }
  const salasFiltroBase = [...new Set([
    ...asesores.map(a=>String(a.sala||'').trim()).filter(Boolean),
    ...todosLosRegistrosBase.map(salaDeRegistro).filter(Boolean),
  ])].sort((a,b)=>a.localeCompare(b,'es'))

  async function guardarTipifBack2(id, nuevoValor) {
    const found = findReg(id); if (!found) return
    const reg = found.reg
    const hora = horaAhora(), fecha = fechaHoy()
    const newHist = [...(reg.historial||[]), { tipifBack2:nuevoValor, hora, fecha, motivo:'Segunda tipificacion Back' }]
    const derivadoPor2 = ['DERIVADO','LLAMANDO'].includes(nuevoValor) ? (sesion?.nombre||'') : ''
    updateReg(id, { tipifBack2:nuevoValor, historial:newHist, derivadoPor2 })
    if (reg._backendId) {
      try {
        const res = await fetch(`${API}/leads/${reg._backendId}`, { method:'PATCH', headers:ncHeaders(), body:JSON.stringify({ tipif_back_2:nuevoValor }) })
        const data = await res.json().catch(()=>({}))
        if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo guardar Tipif. Back 2')
      } catch (e) {
        updateReg(id, { tipifBack2:reg.tipifBack2||'', historial:reg.historial, derivadoPor2:reg.derivadoPor2||'' })
        mostrarToast(e.message || 'Error al guardar Tipif. Back 2')
      }
    }
  }
  const esGraciaTerna = r => grupoPrioridadLead(r) === 5 && ternaEnGracia.has(r._backendId)
  const registrosOperativos = registrosBusquedaGlobal.filter(r =>
    (grupoPrioridadLead(r) === 0 || esGraciaTerna(r)) &&
    !['NO TOCAR','SH NO TOCAR','NO ROTAR','SH NO ROTAR'].includes(String(tipifEfectiva(r)||'').trim().toUpperCase())
  )
  const n1FormularioNormalizado = normalizarNumero(form.n1)
  const altasPreviasN1 = n1FormularioNormalizado
    ? Object.entries(baseData)
        .flatMap(([fecha, regs]) => (regs || [])
          .filter(r => normalizarNumero(r.n1) === n1FormularioNormalizado)
          .map(r => ({ fecha:String(r.createdAt || '').slice(0,10) || fecha, hora:String(r.createdAt || '').slice(11,16) })))
        .filter((alta, i, arr) => arr.findIndex(x => x.fecha === alta.fecha && x.hora === alta.hora) === i)
        .sort((a,b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`))
    : []

  const registrosFiltrados = (() => {
    // La vista inicial conserva solo los pendientes operativos. En cuanto el
    // usuario filtra, la búsqueda incluye todo el alcance (ventas y protegidos).
    // Si abre un grupo protegido, los demás filtros también se respetan.
    const hayFiltroConsulta = Boolean(
      filtros.tipBack1.length || filtros.tipBack2.length || filtros.tipVend.length || filtros.asesor.length || filtros.campana.length || filtros.sala.length || filtros.numero ||
      filtros.desde || filtros.hasta || filtros.global || filtros.duplicados
    )
    const fuente = ordenDiarioActivo
      ? (filtros.tipVend.length ? registrosBusquedaGlobal : registrosOperativos)
      : grupoProtegidoVisible
      ? (gruposProtegidos[grupoProtegidoVisible] || [])
      : (hayFiltroConsulta ? registrosBusquedaGlobal : registrosOperativos)
    const filtered = fuente.filter(r => {
      if (filtros.duplicados && (conteoDuplicadosAlcance.get(normalizarNumero(r.n1)) || 0) < 2) return false
      if (filtros.tipBack1.length && !filtros.tipBack1.some(v=>v.toUpperCase()===String(r.tipifBack||'').trim().toUpperCase())) return false
      if (filtros.tipBack2.length && !filtros.tipBack2.some(v=>v.toUpperCase()===String(r.tipifBack2||'').trim().toUpperCase())) return false
      if (filtros.tipVend.length) {
        const tipVendActual = String(tipifEfectiva(r)||'').trim().toUpperCase()
        const coincidePendiente = !tipVendActual && filtros.tipVend.includes('__pendiente__')
        const coincideTipif = filtros.tipVend.some(v=>v!=='__pendiente__' && v.toUpperCase()===tipVendActual)
        if (!coincidePendiente && !coincideTipif) return false
      }
      if (filtros.asesor.length && !filtros.asesor.some(v=>v.toUpperCase()===String(r.asesor||'').trim().toUpperCase())) return false
      if (filtros.campana.length && !filtros.campana.some(v=>v.toUpperCase()===String(r.campana||'').trim().toUpperCase())) return false
      if (filtros.sala.length && !filtros.sala.some(v=>v.toUpperCase()===salaDeRegistro(r))) return false
      if (filtros.numero && !r.n1.includes(filtros.numero) && !(r.n2||'').includes(filtros.numero) && !(r.usuarioWhatsapp||'').toLowerCase().includes(filtros.numero.toLowerCase())) return false
      return true
    })
    return [...filtered].sort((a, b) => {
      if (ordenDiarioActivo) {
        const pendienteA = !String(tipifEfectiva(a) || '').trim() || esGraciaTerna(a)
        const pendienteB = !String(tipifEfectiva(b) || '').trim() || esGraciaTerna(b)
        const sinAsignarA = !String(a.asesor || '').trim() || a.sinAsignar
        const sinAsignarB = !String(b.asesor || '').trim() || b.sinAsignar
        const bloqueA = pendienteA ? (sinAsignarA ? 0 : 1) : 2
        const bloqueB = pendienteB ? (sinAsignarB ? 0 : 1) : 2
        if (bloqueA !== bloqueB) return bloqueA - bloqueB
        const rotacionesA = cantidadRotaciones(a)
        const rotacionesB = cantidadRotaciones(b)
        if (rotacionesA !== rotacionesB) return rotacionesA - rotacionesB
        const asignacionA = ultimaAsignacionReg(a)
        const asignacionB = ultimaAsignacionReg(b)
        const marcaA = `${normalizarFecha(asignacionA?.fecha || a.fecha || a._fechaBase)} ${String(asignacionA?.hora || a.horaAsigDisplay || a.horaAsig || '').padStart(5,'0')}`
        const marcaB = `${normalizarFecha(asignacionB?.fecha || b.fecha || b._fechaBase)} ${String(asignacionB?.hora || b.horaAsigDisplay || b.horaAsig || '').padStart(5,'0')}`
        const porHora = marcaB.localeCompare(marcaA)
        return porHora || Number(b.id || 0) - Number(a.id || 0)
      }
      // Esta prioridad es fija: los leads operativos siempre permanecen arriba,
      // SIN COBERTURA se agrupa debajo y VENTA CERRADA queda al final. Una fila
      // en su ventana de gracia de Blacklist se ordena como pendiente normal.
      const prioridadOrden = r => esGraciaTerna(r) ? 0 : grupoPrioridadLead(r)
      const grupo = prioridadOrden(a) - prioridadOrden(b)
      if (grupo !== 0) return grupo
      if (!tableSort.col) return 0
      if (tableSort.col === 'tipif') {
        const ta = (a._tipifVend || '').trim()
        const tb = (b._tipifVend || '').trim()
        if (!ta && !tb) return 0
        if (!ta) return 1
        if (!tb) return -1
        const cmp = ta.localeCompare(tb, 'es')
        return tableSort.dir === 'za' ? -cmp : cmp
      }
      if (tableSort.col === 'hora') {
        const ma = horaAMinutos(a.horaAsigDisplay)
        const mb = horaAMinutos(b.horaAsigDisplay)
        if (ma === -1 && mb === -1) return 0
        if (ma === -1) return 1
        if (mb === -1) return -1
        return tableSort.dir === 'desc' ? mb - ma : ma - mb
      }
      if (tableSort.col === 'rots') {
        const ra = cantidadRotaciones(a)
        const rb = cantidadRotaciones(b)
        return tableSort.dir === 'asc' ? ra - rb : rb - ra
      }
      if (tableSort.col === 'asesor') {
        const sa = !String(a.asesor || '').trim()
        const sb = !String(b.asesor || '').trim()
        if (sa !== sb) return tableSort.dir === 'sin_asignar' ? (sa ? -1 : 1) : (sa ? 1 : -1)
        return String(a.asesor || '').localeCompare(String(b.asesor || ''), 'es')
      }
      return 0
    })
  })()

  const baseTotalPages = Math.max(1, Math.ceil(registrosFiltrados.length / basePageSize))
  const basePageSafe = Math.min(basePage, baseTotalPages)
  const baseDesde = (basePageSafe - 1) * basePageSize
  const registrosPagina = registrosFiltrados.slice(baseDesde, baseDesde + basePageSize)

  useEffect(() => { setBasePage(1) }, [fechaActiva, filtros.tipBack1, filtros.tipBack2, filtros.tipVend, filtros.asesor, filtros.campana, filtros.sala, filtros.numero, filtros.desde, filtros.hasta, filtros.global, filtros.duplicados, tableSort.col, tableSort.dir, basePageSize, grupoProtegidoVisible, ordenDiarioActivo])

  // Total es su propio conteo, independiente de Ventas: TODOS los leads del
  // día activo, sin excluir instalados ni caídos — debe coincidir siempre con
  // el número de "Fecha activa". "Ventas" es otra cosa aparte: la familia
  // venta cerrada + venta caída + instalada, tal como se definió el criterio.
  const TIPIF_FAMILIA_VENTA = ['VENTA CERRADA','VENTA CAIDA','INSTALADO']
  // Un NO ROTAR/NO TOCAR ya tiene un motivo definido por el que no se puede
  // trabajar — no es un cliente "pendiente de asignar", está bloqueado a
  // propósito. No debe inflar el conteo de disponibles para llamar.
  const TIPIF_BLOQUEADO_NO_ASIGNABLE = ['NO ROTAR','SH NO ROTAR','NO TOCAR','SH NO TOCAR']
  const statsBase = {
    total:      registrosBusquedaGlobal.length,
    ventas:     registrosBusquedaGlobal.filter(r=>TIPIF_FAMILIA_VENTA.includes(String(tipifEfectiva(r)||'').trim().toUpperCase())).length,
    asignados:  registrosBusquedaGlobal.filter(r=>r.asesor&&r.asesor!=='').length,
    sinAsignar: registrosBusquedaGlobal.filter(r=>r.sinAsignar && !TIPIF_BLOQUEADO_NO_ASIGNABLE.includes(String(tipifEfectiva(r)||'').trim().toUpperCase())).length,
    rotaciones: registrosBusquedaGlobal.reduce((s,r)=>s+r.rotaciones,0),
  }

  const rendData = useMemo(() => {
    const mesActual = fechaHoy().slice(0,7)
    const fechaIncluida = fecha => {
      const f = normalizarFecha(fecha)
      if (!f) return false
      if (rendFiltroTipo==='mes') return f.startsWith(mesActual)
      if (rendFiltroTipo==='dia') return f===rendFiltroFecha
      if (rendFiltroTipo==='rango' && rendDesde && f<rendDesde) return false
      if (rendFiltroTipo==='rango' && rendHasta && f>rendHasta) return false
      return true
    }
    const todosReg = Object.entries(baseData).flatMap(([fecha,regs])=>(regs||[]).map(r=>({...r,_rendFechaBase:fecha})))
      .filter(r => String(r.campana||'').toUpperCase().replace(/[\s-]+/g,'') !== 'ASCW')
    const todasVentas = Object.values(ventasPorNumero)
    const ventasPeriodo = todasVentas.filter(v => fechaIncluida(v.created_at))
    const estadosCaidos = new Set(['CAIDA','RECHAZO','RECHAZO_CAMPO','RECHAZO CAMPO','RECHAZO_MESA','RECHAZO MESA','RECHAZADA','RECHAZADO','ANULADA','SERVICIO_ACTIVO','SERVICIO ACTIVO'])
    const validacionesCaidas = new Set(['CORTA LLAMADA','BUZON DE VOZ','CORREGIR','FRAUDE','MALA OFERTA','NO CONTESTA','NO DESEA','SERVICIO ACTIVO'])
    const estadosInstalados = new Set(['INSTALADO','INSTALADO_NO_VALIDADO','INSTALADO NO VALIDADO','REASIGNACION'])
    const asesoresFiltrados = asesores.filter(a => {
      if (rendFiltroSala && String(a.sala || '').trim() !== rendFiltroSala) return false
      if (rendFiltroAsesor && String(a.nombre || '').trim() !== rendFiltroAsesor) return false
      return true
    })
    const data = asesoresFiltrados.map(a => {
      // Leads realmente entregados al asesor en el periodo. No se usa el asesor
      // proyectado de una venta, porque puede atribuirle leads que nunca recibió.
      const nombreNorm = String(a.nombre||'').trim().toUpperCase()
      // Solo cuenta el cliente para el asesor que lo tuvo PRIMERO. Si se rota
      // despues a otro asesor, ese segundo (o tercero, etc.) no lo cuenta --
      // pero el primero si conserva su credito, sin importar cuantas veces
      // se haya rotado despues.
      const leads = todosReg.filter(r => {
        const asignaciones = (Array.isArray(r.historial) ? r.historial : []).filter(h =>
          h?.asesor && !['TIPIF_VEND','TIPIF_BACK','DERIVADO'].includes(String(h.tipo||'').toUpperCase())
        )
        if (asignaciones.length) {
          const primera = asignaciones.reduce((antes, actual) => {
            const claveAntes  = `${normalizarFecha(antes?.fecha)} ${String(antes?.hora || '').padStart(5,'0')}`
            const claveActual = `${normalizarFecha(actual?.fecha)} ${String(actual?.hora || '').padStart(5,'0')}`
            return claveActual < claveAntes ? actual : antes
          })
          return String(primera.asesor||'').trim().toUpperCase() === nombreNorm && fechaIncluida(primera.fecha || r._rendFechaBase)
        }
        return String(r.asesor||'').trim().toUpperCase() === nombreNorm && fechaIncluida(r._rendFechaBase)
      }).length
      const ventasAsesor = ventasPeriodo.filter(v => String(v.asesor_nombre||'').trim().toUpperCase() === nombreNorm)
      const vigentes = ventasAsesor.filter(v => {
        const estado = String(v.estado||'').trim().toUpperCase()
        const validacion = String(v.estado_validacion||'').trim().toUpperCase().replace(/_/g,' ')
        return !estadosCaidos.has(estado) && !validacionesCaidas.has(validacion)
      })
      const instaladasPeriodo = vigentes.filter(v => estadosInstalados.has(String(v.estado||'').trim().toUpperCase())).length
      const cerradas = vigentes.length - instaladasPeriodo
      const ventas = cerradas + instaladasPeriodo
      const conversion = leads > 0 ? Math.round((ventas / leads) * 100) : 0
      // Columna "Instaladas": total historico del asesor (no del periodo
      // filtrado arriba), usando la fecha real de instalacion del historial.
      const instaladas = todasVentas.filter(v =>
        String(v.asesor_nombre||'').trim().toUpperCase() === nombreNorm && v.fecha_instalado
      ).length
      return { nombre:a.nombre, usuario:a.usuario||'', sala:a.sala||'', leads, ventas, cerradas, instaladas, conversion }
    })
    data.sort((a,b)=>rendOrden==='leads'
      ? b.leads-a.leads || b.ventas-a.ventas || a.nombre.localeCompare(b.nombre,'es')
      : b.ventas-a.ventas || b.leads-a.leads || a.nombre.localeCompare(b.nombre,'es'))
    return data
  }, [baseData, ventasPorNumero, asesores, rendFiltroTipo, rendFiltroFecha, rendDesde, rendHasta, rendFiltroAsesor, rendFiltroSala, rendOrden])

  const rendSalas = [...new Set(asesores.map(a=>String(a.sala||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))
  const rendAsesoresDisponibles = asesores
    .filter(a=>!rendFiltroSala || String(a.sala||'').trim()===rendFiltroSala)
    .sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'))

  const rendTotLeads  = rendData.reduce((s,r)=>s+r.leads,0)
  const rendTotVentas = rendData.reduce((s,r)=>s+r.ventas,0)
  const rendTotCerradas = rendData.reduce((s,r)=>s+r.cerradas,0)
  const rendTotInstaladas = rendData.reduce((s,r)=>s+r.instaladas,0)
  const rendConversion = rendTotLeads > 0 ? Math.round((rendTotVentas / rendTotLeads) * 100) : 0

  const allRotLeadsRaw = rotPanelOpen ? buildRotLeads() : []
  const rotTipifsDisp  = TIPIF_VEND_OPCIONES
    .filter((v, i, arr) => arr.indexOf(v) === i)
  const rotRotacionesDisp = [0,1,2,3,4,5,6,7]
  const allRotLeads    = allRotLeadsRaw.filter(l => {
    const coincideTipif = !rotFiltroTipif || (l.estado||'NUEVO').trim().toUpperCase() === rotFiltroTipif
    const coincideRot = cantidadRotaciones(l._reg) === Number(rotFiltroRotaciones)
    return coincideTipif && coincideRot
  })
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
  const tipifVendDisponibles = [...new Set([
    ...TIPIF_FILTRO_OPCIONES,
    ...todosLosRegistrosBase.map(r => String(tipifEfectiva(r) || '').trim()).filter(Boolean),
  ])]
    .sort((a,b) => a.localeCompare(b, 'es'))
  const rotStatAptos   = allRotLeads.filter(l=>rotApto(l,rotAsesor).apto).length
  const rotVistaAsignacion = rotAsesor
    ? allRotLeadsSorted.filter(l=>rotApto(l,rotAsesor).apto).slice(0, 200)
    : []
  const rotSeleccionables = rotVistaAsignacion.slice(0, rotCant)
  const allAptosSelected = rotSeleccionables.length > 0 && rotSeleccionables.every(l=>rotSel[l.id])
  const rotFechasDisp  = fechaPestanas.filter(f=>(fechaCantidades[f] ?? 0)>0).sort().reverse()
  const rotAsesoresDisp= asesores.map(a=>({ nombre:a.nombre, cnt:Object.values(baseData).flat().filter(r=>r.asesor===a.nombre).length }))
  const masivaFilasParaCargar = inclDup ? masivaFilas : masivaFilas.filter(f=>!f.dup)
  const masivaNDup    = masivaFilas.filter(f=>f.dup).length
  const masivaFilasCnt= masivaFilas.length
  const avanceFiltrado= asesores.filter(a => !avanceBuscar || a.nombre.toLowerCase().includes(avanceBuscar.toLowerCase()) || (a.usuario||'').toLowerCase().includes(avanceBuscar.toLowerCase()))
  const blTipificaciones = [...new Set((blLeads || []).map(l => String(l.tipif_vend || '').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))
  const blLeadsFiltrados = (blLeads || []).filter(l => {
    const q = blBuscar.trim().toLowerCase()
    const coincideTexto = !q || [l.n1,l.n2,l.distrito,l.campana,l.obs_back,l.obs_asesor,l.tipif_vend].some(v=>String(v||'').toLowerCase().includes(q))
    const coincideTipif = !blFiltroTipif || (blFiltroTipif === '__pendiente__' ? !String(l.tipif_vend||'').trim() : String(l.tipif_vend||'').trim() === blFiltroTipif)
    const coincideBack = !blFiltroBack || String(l.obs_back||'').trim() === blFiltroBack
    return coincideTexto && coincideTipif && coincideBack
  }).sort((a,b) => Number(Boolean(a.tipif_vend)) - Number(Boolean(b.tipif_vend)) || String(b.hora_asig||'').localeCompare(String(a.hora_asig||'')))

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
              <span className="brand-sub">Back Data</span>
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
        <div className="bo-topbar-stats" aria-label="Resumen de la base">
          <div className="bo-topbar-stat"><strong>{statsBase.total}</strong><span>Total</span></div>
          <div className="bo-topbar-stat green"><strong>{statsBase.ventas}</strong><span>Ventas</span></div>
          <div className="bo-topbar-stat blue"><strong>{statsBase.asignados}</strong><span>Asignados</span></div>
          <div className="bo-topbar-stat orange"><strong>{statsBase.sinAsignar}</strong><span>Sin asignar</span></div>
          <div className="bo-topbar-stat purple"><strong>{statsBase.rotaciones}</strong><span>Rotaciones</span></div>
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
          <button className={`bo-nav${seccion==='base'&&!rotPanelOpen?' active':''}`} onClick={()=>irSeccion('base')}><BoNavIcon tipo="base" /> <span>Base</span></button>
          <button className={`bo-nav${seccion==='carga-masiva'?' active':''}`} onClick={()=>irSeccion('carga-masiva')}><BoNavIcon tipo="carga" /> <span>Carga Masiva</span></button>
          <button className={`bo-nav${seccion==='base'&&rotPanelOpen?' active':''}`} onClick={abrirRotacionInteligente}><BoNavIcon tipo="rotacion" /> <span>Rotación inteligente</span></button>
          <div className="sidebar-sep">Reportes</div>
          <button className={`bo-nav${seccion==='rendimiento'?' active':''}`} onClick={()=>irSeccion('rendimiento')}><BoNavIcon tipo="rendimiento" /> <span>Rendimiento</span></button>
          <button className={`bo-nav${seccion==='avance'?' active':''}`} onClick={()=>irSeccion('avance')}><BoNavIcon tipo="avance" /> <span>Avance Asesores</span></button>
          <div className="bo-sidebar-registro">
            <div className="sidebar-sep">Agregar registro</div>
            <div className="bo-input-group"><label>Campaña</label><CampanaSelect value={form.campana} onChange={v=>setForm(p=>({...p,campana:v}))} plain sinOtro /></div>
            <div className="bo-input-group"><label>N1</label><input className={`form-control${n1Error?' obligatorio-error':''}`} value={form.n1} onChange={e=>{ setN1Error(false); setForm(p=>({...p,n1:e.target.value})) }} placeholder="Número principal" inputMode="numeric" /></div>
            <div className="bo-input-group"><label>N2 (opcional)</label><input className="form-control" value={form.n2} onChange={e=>setForm(p=>({...p,n2:e.target.value}))} placeholder="Número secundario" inputMode="numeric" /></div>
            <div className="bo-input-group"><label>Usuario WhatsApp</label><input className="form-control" value={form.usuarioWhatsapp} onChange={e=>{ setN1Error(false); setForm(p=>({...p,usuarioWhatsapp:e.target.value})) }} placeholder="Ej. usuario_cliente" maxLength={100} /></div>
            <div className="bo-input-group"><label>Departamento</label><select className="form-select" value={form.dpto} onChange={e=>setForm(p=>({...p,dpto:e.target.value,prov:'',distrito:''}))}><option value="">— Seleccionar —</option>{dptos.map(d=><option key={d} value={d}>{d}</option>)}</select></div>
            <div className="bo-input-group"><label>Provincia</label><select className="form-select" value={form.prov} onChange={e=>setForm(p=>({...p,prov:e.target.value,distrito:''}))}><option value="">— Seleccionar —</option>{provs.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
            <div className="bo-input-group"><label>Distrito</label><select className="form-select" value={form.distrito} onChange={e=>setForm(p=>({...p,distrito:e.target.value}))}><option value="">— Seleccionar —</option>{distritos.map(d=><option key={d} value={d}>{d}</option>)}</select></div>
            {altasPreviasN1.length > 0 && <small className="bo-sidebar-registro-aviso">Número registrado anteriormente. Puedes agregarlo.</small>}
            <div className="bo-sidebar-registro-acciones">
              <button className="bo-btn-limpiar" onClick={()=>setForm({campana:'',dpto:'',prov:'',distrito:'',n1:'',n2:'',usuarioWhatsapp:'',tipoContacto:'LLAMADA',direccion:'',coordenadas:'',obsBack:'',tipifBack:'',asesor:''})}>Limpiar</button>
              <button className="bo-btn-agregar" onClick={agregarRegistro}>+ Agregar</button>
            </div>
          </div>
        </aside>

        <main className="bo-main">

          {/* ══ SECCIÓN: BASE ══════════════════════════════════════════════════ */}
          <section className={`bo-seccion${seccion==='base'?'':' hidden'}`}>
            {/* PANEL ROTACIÓN */}
            {rotPanelOpen && (
              <div style={{marginBottom:14}}>
                <div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:14,overflow:'hidden',boxShadow:'0 1px 6px rgba(0,0,0,.05)'}}>
                  <div style={{background:'#111827',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{color:'#fff',fontSize:13,fontWeight:600}}>Rotación Inteligente de Leads</span>
                  </div>
                  <div style={{padding:'14px 16px'}}>
                    <div className="rot-form" style={{marginBottom:12}}>
                      <div className="rot-form-title">Rotar leads a un asesor</div>
                      <div className="rot-form-row">
                        <div style={{ width:260 }}>
                          <AsesorBuscador value={rotAsesor} asesores={asesores}
                            onChange={v=>{ setRotAsesor(v); setRotSel({}) }}
                            className="form-select" placeholderText="— Seleccionar asesor destino —" emptyLabel="— Ninguno —" />
                        </div>
                        <input type="number" value={rotCant} min={1} max={200}
                          onChange={e=>{ setRotCant(Math.min(200,Math.max(1,parseInt(e.target.value)||1))); setRotSel({}) }} style={{width:72}} />
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
                          <div key={i} className="rot-res-item"><div className="rot-res-dot" /><strong>{r.tel}</strong>{r.error ? <> · {r.error}</> : <> → <strong>{r.asesor}</strong> · {r.hora}</>}</div>
                        ))}
                      </div>
                    )}
                    <div className="rot-table-wrap">
                      <div className="rot-table-header" style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          Leads disponibles <span className="tag-aptos">{rotCargandoFecha?'Cargando…':`${rotStatAptos} aptos`}</span>
                          {rotAsesor&&<span style={{fontSize:10,color:'#64748b',fontWeight:600}}>Mostrando {rotVistaAsignacion.length} · seleccionados {Object.values(rotSel).filter(Boolean).length}/{rotCant}</span>}
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <label style={{fontSize:11,color:'#6b7280',fontWeight:600}}>Fecha:</label>
                          <select value={rotFiltroFecha} onChange={e=>cambiarFechaRotacion(e.target.value)} disabled={rotCargandoFecha} style={{padding:'5px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:12,fontFamily:'inherit',outline:'none',background:'#fff',cursor:'pointer'}}>
                            {rotFechasDisp.map(f=><option key={f} value={f}>{formatFecha(f)} ({fechaCantidades[f] ?? (baseData[f]||[]).length})</option>)}
                          </select>
                          <label style={{fontSize:11,color:'#6b7280',fontWeight:600}}>Tipificación:</label>
                          <select value={rotFiltroTipif} onChange={e=>{ setRotFiltroTipif(e.target.value); setRotSel({}) }} style={{padding:'5px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:12,fontFamily:'inherit',outline:'none',background:'#fff',cursor:'pointer'}}>
                            <option value="">Todas</option>
                            {rotTipifsDisp.map(t=><option key={t} value={t}>{t}</option>)}
                          </select>
                          <label style={{fontSize:11,color:'#6b7280',fontWeight:600}}>Rotaciones:</label>
                          <select value={rotFiltroRotaciones} onChange={e=>{ setRotFiltroRotaciones(e.target.value); setRotSel({}) }} style={{padding:'5px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:12,fontFamily:'inherit',outline:'none',background:'#fff',cursor:'pointer'}}>
                            {rotRotacionesDisp.map(n=><option key={n} value={n}>{n}</option>)}
                          </select>
                          <button onClick={()=>{ cambiarFechaRotacion(fechaHoy()); setRotFiltroTipif(''); setRotFiltroRotaciones('0'); setRotSel({}) }} style={{padding:'5px 10px',border:'1px solid #e5e7eb',borderRadius:8,background:'#fff',color:'#6b7280',fontSize:11,fontWeight:600,fontFamily:'inherit',cursor:'pointer'}}>Limpiar</button>
                        </div>
                      </div>
                      <div className="rot-table">
                        <table>
                          <thead><tr>
                            <th>
                              <input type="checkbox" checked={allAptosSelected} title={allAptosSelected?'Deseleccionar visibles':'Seleccionar automáticamente'}
                                onChange={()=>{ if(allAptosSelected){setRotSel({})}else{const ns={};rotSeleccionables.forEach(l=>{ns[l.id]=true});setRotSel(ns)} }} />
                            </th>
                            {rotTh('n1','N1 / Campaña')}{rotTh('fecha','Fecha')}{rotTh('tipif','Tipificación')}
                            {rotTh('asesor','Asesor actual')}{rotTh('rotac','Rotac.')}{rotTh('hora','Día / hora asig.')}{rotTh('tiempo','Tiempo')}
                            {rotTh('sinrepetir','Sin repetir')}{rotTh('aptitud','Aptitud')}
                          </tr></thead>
                          <tbody>
                            {rotCargandoFecha
                              ? <tr><td colSpan={10} className="bo-empty">Cargando únicamente los leads de {formatFecha(rotFiltroFecha)}…</td></tr>
                              : !rotAsesor
                              ? <tr><td colSpan={10} className="bo-empty">Selecciona un asesor para ver únicamente los leads que se le asignarán.</td></tr>
                              : rotVistaAsignacion.length === 0
                                ? <tr><td colSpan={10} className="bo-empty">No hay leads que cumplan las reglas de rotación.</td></tr>
                                : rotVistaAsignacion.map(l => {
                                  const { apto, prohibido, sinRepetir, tiempo } = rotApto(l, rotAsesor)
                                  const mins = rotMins(l.ultimaAsig)
                                  const esFechaHoy = l.fecha === fechaHoy()
                                  const nRot = Math.max(l._reg?.rotaciones || 0, Math.max(0, (l.histAsesores?.length || 0) - 1))
                                  return (
                                    <tr key={l.id} className={(prohibido||(!apto&&rotAsesor))?'row-noapto':''}>
                                      <td><input type="checkbox" checked={!!rotSel[l.id]} disabled={prohibido||(!apto&&!!rotAsesor)} onChange={e=>rotToggleSel(l.id,e.target.checked)} /></td>
                                      <td><div style={{fontFamily:'monospace',fontWeight:700,color:'#111827',fontSize:12}}>{l.tel}</div><div style={{fontSize:10,color:'#9ca3af',marginTop:1}}>{l.campana} · {l.n2||'—'}</div></td>
                                      <td>{esFechaHoy ? <span style={{background:'#dcfce7',color:'#166534',fontSize:9,fontWeight:700,padding:'1px 6px',borderRadius:99}}>HOY</span> : <span style={{background:'#f3f4f6',color:'#6b7280',fontSize:9,padding:'1px 6px',borderRadius:99}}>{formatFecha(l.fecha)}</span>}</td>
                                      <td><span className={`tipif-badge ${tipifBadgeClass(l.estado)}`}>{l.estado||'NUEVO'}</span></td>
                                      <td style={{fontSize:12}}>{l.asesor||'—'}{l.histAsesores.length>0&&<div style={{fontSize:9,color:'#9ca3af',marginTop:1}} title={l.histAsesores.join(' → ')}>Tuvo: {l.histAsesores.join(', ')}</div>}</td>
                                      <td style={{textAlign:'center'}}><span style={{display:'inline-block',minWidth:22,padding:'1px 7px',borderRadius:99,fontSize:11,fontWeight:700,background:nRot>0?'#fef3c7':'#f3f4f6',color:nRot>0?'#92400e':'#9ca3af'}} title={`${nRot} rotación(es)`}>{nRot}</span></td>
                                      <td className="hora-color" style={{color:l.fechaAsignacion===fechaHoy()?'#ef4444':'#111827'}}><span style={{display:'block',whiteSpace:'nowrap'}}>{formatFecha(l.fechaAsignacion)}</span><span style={{display:'block',whiteSpace:'nowrap'}}>{l.ultimaAsig.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}</span></td>
                                      <td className={!rotAsesor?'':tiempo?'timer-ok':'timer-fail'}>{tiempo!==false?`Hace ${rotTxt(l.ultimaAsig)}`:rotFaltanTxt(mins)}</td>
                                      <td>{!rotAsesor?'—':sinRepetir?<span className="check-ok">OK</span>:<span className="check-fail">Ya tuvo</span>}</td>
                                      <td>{!rotAsesor?'—':apto?<span className="badge-apto">Apto</span>:<span className="badge-noapto">No apto</span>}</td>
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

            {!rotPanelOpen && <>
            <div className="base-toolbar">
              {/* NAVEGADOR DE FECHA */}
              <div className="base-fecha-grupo">
                <label>Fecha activa</label>
                <div className="fecha-nav-row">
                  <div className="fecha-nav-ctrl">
                    <button className="fnav-btn" onClick={()=>navegarFecha(-1)} disabled={prevDis}>←</button>
                    <select className="fnav-select" value={fechaActiva} onChange={e=>setFechaActiva(e.target.value)}>
                      {fechaPestanas.map(f=><option key={f} value={f}>{formatFecha(f)} ({fechaCantidades[f] ?? (baseData[f]||[]).length})</option>)}
                    </select>
                    <button className="fnav-btn" onClick={()=>navegarFecha(1)} disabled={nextDis}>→</button>
                  </div>
                  <span className="fnav-count">{idx+1} / {fechaPestanas.length}</span>
                </div>
              </div>

              {/* BÚSQUEDA Y FILTROS AL COSTADO DE LA FECHA */}
              <div className="base-filtros">
                <div className="bo-input-group base-filtro-numero"><label>Número</label><input className="form-control" value={filtros.numero} onChange={e=>setFiltros(p=>({...p,numero:e.target.value}))} placeholder="Buscar N1, N2 o usuario WhatsApp..." /></div>
                <div className="bo-input-group base-filtro-fecha"><label>Desde</label><input type="date" className="form-control" value={filtros.desde} max={filtros.hasta||undefined} onChange={e=>setFiltros(p=>({...p,desde:e.target.value,global:true}))} /></div>
                <div className="bo-input-group base-filtro-fecha"><label>Hasta</label><input type="date" className="form-control" value={filtros.hasta} min={filtros.desde||undefined} onChange={e=>setFiltros(p=>({...p,hasta:e.target.value,global:true}))} /></div>
                <label className="toggle-col base-filtro-toggle base-filtro-global"><input type="checkbox" checked={filtros.global} onChange={e=>setFiltros(p=>({...p,global:e.target.checked}))} /><span>Buscar global</span></label>
                <label className="toggle-col base-filtro-toggle"><input type="checkbox" checked={filtros.duplicados} onChange={e=>setFiltros(p=>({...p,duplicados:e.target.checked}))} /><span>Números duplicados</span></label>
                <button className="bo-btn-limpiar btn btn-sm base-filtro-limpiar" onClick={()=>setFiltros({tipBack1:[],tipBack2:[],tipVend:[],asesor:[],campana:[],sala:[],numero:'',desde:'',hasta:'',global:false,duplicados:false})}>Limpiar filtros</button>
              </div>
              <button type="button"
                className="base-orden-btn"
                onClick={()=>{
                  const activar = !ordenDiarioActivo
                  setOrdenDiarioActivo(activar)
                  setTableSort({col:null,dir:null})
                  setGrupoProtegidoVisible('')
                  setBasePage(1)
                  if (activar) setFiltros({tipBack1:[],tipBack2:[],tipVend:[],asesor:[],campana:[],sala:[],numero:'',desde:'',hasta:'',global:false,duplicados:false})
                }}
                style={{background:ordenDiarioActivo?'#16a34a':'linear-gradient(135deg,#7c3aed,#dc2626)'}}>
                {ordenDiarioActivo?'✓ Orden diario activo':'Ordenar base del día'}
              </button>
            </div>

            {/* TABLA BASE — diseño compacto sin scroll horizontal */}
            <div className="base-tabla-wrap">
              <table className="base-tabla" style={{tableLayout:'fixed',width:'100%',minWidth:948}}>
                <colgroup>
                  <col style={{width:34}} />
                  <col style={{width:62}} />
                  <col style={{width:112}} />
                  <col style={{width:108}} />
                  <col style={{width:108}} />
                  <col style={{width:140}} />
                  <col style={{width:160}} />
                  <col style={{width:92}} />
                  <col style={{width:52}} />
                  <col style={{width:44}} />
                  <col style={{width:112}} />
                </colgroup>
                <thead>
                  <tr>
                    <th>#</th>
                    <th><FiltroEncabezado label="Campaña" value={filtros.campana} options={campanasFiltroBase} onChange={campana=>setFiltros(p=>({...p,campana}))} /></th>
                    <th>N1 / N2</th>
                    <th><FiltroEncabezado label="Tipif. Back 1" value={filtros.tipBack1} options={TIPIF_BACK_OPTIONS} onChange={tipBack1=>setFiltros(p=>({...p,tipBack1}))} /></th>
                    <th><FiltroEncabezado label="Tipif. Back 2" value={filtros.tipBack2} options={TIPIF_BACK_OPTIONS} onChange={tipBack2=>setFiltros(p=>({...p,tipBack2}))} /></th>
                    <th>
                      <FiltroEncabezado label="Asesor asignado" value={filtros.asesor} options={asesores.map(a=>a.nombre)} searchable
                        onChange={asesor=>setFiltros(p=>({...p,asesor}))} />
                    </th>
                    <th>
                      <FiltroEncabezado label="Tipif. Vendedor" value={filtros.tipVend} options={tipifVendDisponibles} pending
                        onChange={tipVend=>{
                          setFiltros(p=>({...p,tipVend,desde:'',hasta:'',global:false}))
                          setOrdenDiarioActivo(tipVend.length > 0)
                          setGrupoProtegidoVisible('')
                        }} />
                    </th>
                    <th><FiltroEncabezado label="Sala" value={filtros.sala} options={salasFiltroBase} onChange={sala=>setFiltros(p=>({...p,sala}))} /></th>
                    <th>
                      <button type="button" className={`th-sort-btn${tableSort.col==='hora'?' th-sort-active':''}`}
                        onClick={()=>cycleSort('hora')} title="Ordenar por hora" aria-label="Ordenar por hora"
                        aria-sort={tableSort.col==='hora'?(tableSort.dir==='asc'?'ascending':'descending'):'none'}>
                        Fecha / hora<SortIcon active={tableSort.col==='hora'} direction={tableSort.col==='hora'?(tableSort.dir==='desc'?'down':'up'):null}/>
                      </button>
                    </th>
                    <th>
                      <button type="button" className={`th-sort-btn${tableSort.col==='rots'?' th-sort-active':''}`}
                        onClick={()=>cycleSort('rots')} title="Ordenar por rotaciones" aria-label="Ordenar por cantidad de rotaciones"
                        aria-sort={tableSort.col==='rots'?(tableSort.dir==='asc'?'ascending':'descending'):'none'}>
                        Rots.<SortIcon active={tableSort.col==='rots'} direction={tableSort.col==='rots'?(tableSort.dir==='asc'?'up':'down'):null}/>
                      </button>
                    </th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosFiltrados.length === 0
                    ? <tr><td colSpan={11} className="bo-empty">{filtros.global ? 'Sin registros para el rango y filtros seleccionados.' : `Sin registros en ${formatFecha(fechaActiva)}.`}</td></tr>
                    : registrosPagina.map((r,i) => {
                         const tipifActual = tipifEfectiva(r)
                         const ultimaAsignacion = ultimaAsignacionReg(r)
                         const fechaAsignacion = normalizarFecha(ultimaAsignacion?.fecha || r.fecha || r._fechaBase || fechaActiva)
                         const horaAsignacion = ultimaAsignacion?.hora || r.horaAsigDisplay || r.horaAsig || ''
                         const esAsignacionHoy = fechaAsignacion === fechaHoy()
                         const asesorActualNorm = String(r.asesor || '').trim().toUpperCase()
                         const salaAsesor = asesorActualNorm
                           ? (asesores.find(a => String(a.nombre || '').trim().toUpperCase() === asesorActualNorm)?.sala || 'SIN SALA')
                           : 'SIN ASIGNAR'
                         const esExclusiva = Boolean(r.tipifInterna) || TIPIF_PROHIBIDAS_ROTACION.has(String(tipifActual||'').trim().toUpperCase())
                         const rotacionManualBloqueada = esRotacionManualProhibida(r) && !permiteOtraDireccion(r) && !tieneCicloVentaAbierto(r)
                         const detAbierto  = !!detOpen[r.id]
                         const ocurrenciaDia = ocurrenciaDiariaPorId.get(r.id) || 1
                         const esReingreso = Object.entries(baseData).some(([fecha, regs]) =>
                           fecha !== (r._fechaBase || fechaActiva) && (regs || []).some(x => normalizarNumero(x.n1) === normalizarNumero(r.n1))
                         )
                         const estadoNumero = esReingreso ? resaltadoPorVenta(ventasPorNumero[normalizarNumero(r.n1)]) : null
                         const claseDuplicadoDia = ocurrenciaDia >= 4 ? 'num-duplicado-limite' : (ocurrenciaDia >= 2 ? 'num-duplicado' : '')
                         // Sin venta real, SIN COBERTURA se muestra fija en la base principal
                         // igual que una tipificacion interna (badge de solo lectura).
                         const esSinCoberturaFija = !r.tipifInterna && tipifActual === 'SIN COBERTURA'
                         // Un antecedente de cobertura solo advierte visualmente. No altera
                         // la tipificación ni mueve la fila al grupo protegido hasta que el
                         // asesor seleccione explícitamente SIN COBERTURA.
                         const esAlertaSinCobertura = !r.tipifInterna && !esSinCoberturaFija && r.alertaSinCobertura
                         const alertaCoberturaTooltip = esAlertaSinCobertura
                           ? ['Motivo: SIN COBERTURA', r.alertaSinCoberturaDistrito ? `Distrito: ${r.alertaSinCoberturaDistrito}` : '', r.alertaSinCoberturaCoordenadas ? `Coordenadas: ${r.alertaSinCoberturaCoordenadas}` : ''].filter(Boolean).join('\n')
                           : ''
                         const claseNumero = (r.tipifInterna || esSinCoberturaFija) ? 'num-estado num-estado-interno' : (esAlertaSinCobertura ? 'num-estado num-estado-rojo' : (estadoNumero ? `num-estado ${estadoNumero.clase}` : claseDuplicadoDia))
                         const estiloInterno = r.tipifInterna
                           ? {color:r.tipifInternaColor,background:r.tipifInterna==='INSTALADO'?'#e0f2fe':r.tipifInterna==='VENTA CAIDA'?'#f7e8ef':'#dbeafe'}
                           : esSinCoberturaFija
                             ? {color:'#b91c1c',background:'#fee2e2'}
                             : undefined
                         return [
                          <tr key={r.id} id={`fila-${r.id}`}>
                            {/* # */}
                            <td style={{color:'#9ca3af',fontSize:10,textAlign:'center'}}>{baseDesde+i+1}</td>

                            {/* Campaña */}
                            <td title={r.campana}>
                              <div style={{display:'flex',alignItems:'center',gap:4}}>
                                <strong style={{fontSize:11,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',minWidth:0,flexShrink:1}}>{r.campana}</strong>
                                <button type="button" title="Editar campaña"
                                  onClick={()=>setCampanaModal({id:r.id,bid:r._backendId,valor:r.campana||'',guardando:false})}
                                  style={{border:'none',background:'transparent',cursor:'pointer',padding:2,color:'#64748b',lineHeight:1,flexShrink:0}}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M4 20h4l11-11a2.1 2.1 0 0 0-3-3L5 17l-1 3z" strokeLinejoin="round"/><path d="m14.5 7.5 3 3"/></svg>
                                </button>
                                <button type="button" title="Ver quién cargó el registro" onClick={()=>openLeadOrigin(r)}
                                  style={{border:'none',background:'transparent',cursor:'pointer',padding:2,color:'#9ca3af',lineHeight:1,flexShrink:0}}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                </button>
                              </div>
                            </td>

                            {/* N1 / N2 combinados */}
                            <td>
                              <div className="num-cell">
                                <div className="num-primary">
                                  <span className={(r.n1||r.usuarioWhatsapp)?claseNumero:''} style={(r.n1||r.usuarioWhatsapp)?estiloInterno:undefined} title={(r.n1||r.usuarioWhatsapp)?(r.tipifInterna?tooltipTipificacionInterna(r):esSinCoberturaFija?'SIN COBERTURA':(alertaCoberturaTooltip || estadoNumero?.label || (ocurrenciaDia >= 2 ? `Aparición ${ocurrenciaDia} del día` : ''))):''}>{r.n1 || (r.usuarioWhatsapp ? `@${r.usuarioWhatsapp}` : '—')}</span>
                                  {(r.n1 || r.usuarioWhatsapp) && <button type="button" className="num-copy-btn" onClick={()=>copiarNumero(r.n1 || r.usuarioWhatsapp)} title={r.n1?'Copiar N1':'Copiar usuario de WhatsApp'}><CopyIcon /></button>}
                                  <button type="button" className="num-copy-btn num-edit-btn" onClick={()=>setNumeroModal({id:r.id,bid:r._backendId,n1:r.n1||'',n2:r.n2||'',guardando:false})} title="Editar N1 y N2"><PencilIcon /></button>
                                </div>
                                {r.n2 && (
                                  <div className="num-secondary">
                                    <span>{r.n2}</span>
                                    <button type="button" className="num-copy-btn" onClick={()=>copiarNumero(r.n2)} title="Copiar N2"><CopyIcon /></button>
                                  </div>
                                )}
                                {r.n1 && r.usuarioWhatsapp && <div className="num-secondary"><span>@{r.usuarioWhatsapp}</span><button type="button" className="num-copy-btn" onClick={()=>copiarNumero(r.usuarioWhatsapp)} title="Copiar usuario de WhatsApp"><CopyIcon /></button></div>}
                                {r.cicloAbiertoNumero>0 && <div style={{marginTop:3,fontSize:8,fontWeight:800,color:'#7c3aed'}}>VENTA {r.cicloAbiertoNumero} · OTRA DIRECCIÓN</div>}
                              </div>
                            </td>

                            {/* Tipif. Back */}
                            <td>
                              <select className={claseTipifBack(r.tipifBack)} value={r.tipifBack} onChange={e=>guardarTipifBack(r.id,e.target.value)}>
                                <option value="">— Sin tipif. —</option>
                                {TIPIF_BACK_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                              </select>
                              {['DERIVADO','LLAMANDO'].includes(r.tipifBack)&&r.derivadoPor&&<small style={{display:'block',fontSize:9,color:'#6b7280',fontWeight:700,marginTop:1}}>Por: {r.derivadoPor}</small>}
                            </td>

                            {/* Segunda llamada de Back */}
                            <td>
                              <select className={claseTipifBack(r.tipifBack2)} value={r.tipifBack2||''} onChange={e=>guardarTipifBack2(r.id,e.target.value)}>
                                <option value="">— Sin tipif. —</option>
                                {TIPIF_BACK_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                              </select>
                              {['DERIVADO','LLAMANDO'].includes(r.tipifBack2)&&r.derivadoPor2&&<small style={{display:'block',fontSize:9,color:'#6b7280',fontWeight:700,marginTop:1}}>Por: {r.derivadoPor2}</small>}
                            </td>

                            {/* Asesor asignado */}
                            <td>
                              <AsesorBuscador value={r.asesor} asesores={asesores} disabled={esExclusiva}
                                title={esExclusiva?`Prohibido: ${tipifActual}`:''}
                                onChange={v=>reasignarReg(r.id,v)} />
                              {r.sinAsignar&&r.asesor&&<span style={{display:'block',fontSize:9,color:'#6b7280',fontWeight:600,marginTop:1}}>histórico</span>}
                              {r.sinAsignar&&!r.asesor&&<span style={{display:'block',fontSize:9,color:'#c2410c',fontWeight:700,marginTop:1}}>sin asig.</span>}
                            </td>

                            {/* Tipif. Vendedor */}
                            <td>
                              <div className="tipif-vendedor-cell">
                                {r.tipifInterna
                                  ? <span className="tipif-interna-badge" style={estiloInterno} title={tooltipTipificacionInterna(r)}>{r.tipifInterna}</span>
                                  : esSinCoberturaFija
                                  ? <span className="tipif-interna-badge" style={estiloInterno} title="SIN COBERTURA — se mantiene fija hasta que exista una venta real">SIN COBERTURA</span>
                                  : <select className="bo-sel-compact sel-tipif-vend" value={tipifEfectiva(r)} onChange={e=>guardarTipif(r.id,e.target.value)}
                                      style={estiloTipifVend(tipifEfectiva(r))}>
                                      <option value="" style={{background:'#fff',color:'#111827',fontWeight:400}}>— Pendiente —</option>
                                      {TIPIF_VEND_OPCIONES.map(t=><option key={t} value={t} style={{background:'#fff',color:'#111827',fontWeight:400}}>{t}</option>)}
                                    </select>}
                                {r.ventaCanal && <CanalBadge canal={r.ventaCanal} />}
                                {documentoVenta(r)&&(
                                  <button type="button" className="btn-dni-cuaderno"
                                    title={`Ver ${documentoVenta(r).tipo} registrado en Ventas`}
                                    onClick={e=>{
                                      const rect=e.currentTarget.getBoundingClientRect()
                                      const doc=documentoVenta(r)
                                      setDniModal(prev=>prev&&prev.id===r.id?null:{id:r.id,bid:r._backendId,dni:doc.valor,label:`${doc.tipo} DE LA VENTA`,soloLectura:doc.soloLectura,top:rect.bottom+6,left:rect.left})
                                    }}>
                                    <NotebookIcon/>
                                  </button>
                                )}
                                {tipifEfectiva(r)==='SIN COBERTURA'&&(r.distritoSinCobertura||r.coordenadasSinCobertura)&&(
                                  <button type="button" className="btn-dni-cuaderno btn-cobertura-cuaderno"
                                    title="Ver distrito y coordenadas"
                                    onClick={e=>{
                                      const rect=e.currentTarget.getBoundingClientRect()
                                      setCoberturaModal(prev=>prev&&prev.id===r.id?null:{id:r.id,distrito:r.distritoSinCobertura||'',coordenadas:r.coordenadasSinCobertura||'',top:rect.bottom+6,left:rect.left})
                                    }}>
                                    <NotebookIcon/>
                                  </button>
                                )}
                              </div>
                              {r._tipifHora&&<span style={{display:'block',fontSize:9,color:'#9ca3af',marginTop:1}}>{r._tipifHora}</span>}
                            </td>

                            {/* Sala actual del vendedor asignado */}
                            <td className="lead-alta-cell">
                              <strong>{salaAsesor}</strong>
                            </td>

                            {/* Fecha y hora de la última asignación */}
                            <td style={{textAlign:'center'}}>
                              {horaAsignacion
                                ?<span className="hora-cell" style={{color:esAsignacionHoy?'#ef4444':'#111827'}}><span style={{display:'block',whiteSpace:'nowrap'}}>{formatFecha(fechaAsignacion)}</span><span style={{display:'block',whiteSpace:'nowrap'}}>{horaAsignacion}</span></span>
                                :<span style={{color:'#d1d5db'}}>—</span>}
                            </td>

                            {/* Rotaciones */}
                            <td style={{textAlign:'center'}}>
                              {cantidadRotaciones(r)>0
                                ?<span style={{background:'#EDE9FE',color:'#4C1D95',fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:99,display:'inline-block'}}>{cantidadRotaciones(r)}x</span>
                                :<span style={{color:'#d1d5db',fontSize:10}}>0</span>}
                            </td>

                            {/* Acciones */}
                            <td>
                              <div className="acc-cell-compact">
                                <button className="btn-acc-det" onClick={()=>setDetOpen(p=>({...p,[r.id]:!p[r.id]}))}
                                  title={detAbierto?'Ocultar detalles':'Ver detalles'} aria-label="Detalles">
                                  {detAbierto?'▲':'⋯'}
                                </button>
                                <button className="btn-rotar btn-rotar-sm" disabled={rotacionManualBloqueada}
                                  title={rotacionManualBloqueada?razonBloqueoRotacion(r):(tieneCicloVentaAbierto(r)?'Reasignar manualmente el ciclo pendiente de otra dirección':(esVentaCaidaInterna(r)?'Rotar venta caída manualmente':'Rotar'))} onClick={()=>abrirModalRotar(r.id)}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                </button>
                                <button className="btn-hist btn-hist-sm" onClick={()=>setHistOpen(p=>({...p,[r.id]:!p[r.id]}))} title="Historial">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                </button>
                                <button className="btn-del" onClick={()=>eliminarReg(r.id)} title="Eliminar">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              </div>
                            </td>
                          </tr>,

                          /* Fila expandible: Detalles secundarios */
                          <tr key={`det-${r.id}`} className={`detalles-row${detAbierto?' open':''}`}>
                            <td colSpan={11}>
                              <div className="detalles-inner">
                                <div className="det-campo det-distrito">
                                  <label>Distrito</label>
                                  <input defaultValue={r.distrito||''} onBlur={e=>guardarDatosBack(r.id,{distrito:e.target.value.trim()})} placeholder="Distrito" maxLength={100}/>
                                </div>
                                <div className="det-campo">
                                  <label>Dirección</label>
                                  <input defaultValue={r.direccion||''} onBlur={e=>guardarDatosBack(r.id,{direccion:e.target.value.trim()})} placeholder="Dirección" maxLength={1000}/>
                                </div>
                                <div className="det-campo det-coord">
                                  <label>Coordenadas</label>
                                  <input defaultValue={r.coordenadas||''} onBlur={e=>guardarDatosBack(r.id,{coordenadas:e.target.value.trim()})} placeholder="Coordenadas" maxLength={255}/>
                                </div>
                                <div className="det-campo det-obs">
                                  <label>Obs. Back</label>
                                  <input defaultValue={r.obs_back||''} onBlur={e=>guardarDatosBack(r.id,{obs_back:e.target.value.trim()})} placeholder="Observación para asesor" maxLength={2000}/>
                                </div>
                              </div>
                            </td>
                          </tr>,

                          /* Fila expandible: Historial */
                          <tr key={`hist-${r.id}`} className={`historial-row${histOpen[r.id]?' open':''}`}>
                            <td colSpan={10}>
                              <div className="historial-inner">
                                <div className="hist-label">Historial de asignaciones — N1: {r.n1}</div>
                                {(() => {
                                  const hist = r.historial || []
                                  // Entrada de carga: primer entry con asignadoPor, o motivo de carga/importación
                                  const entradaCarga = hist.find(h =>
                                    h.asignadoPor ||
                                    h.cargadoPor ||
                                    h.motivo === 'Carga masiva' ||
                                    h.motivo === 'Asignacion importada' ||
                                    h.motivo === 'Asignacion inicial' ||
                                    h.motivo === 'Carga inicial' ||
                                    h.motivo === 'Importacion masiva'
                                  )
                                  const cola = hist.filter(h => h.asesor && h.tipo!=='TIPIF_BACK' && h.tipo!=='DERIVADO' && h.tipo!=='TIPIF_VEND' && h.tipo!=='QUITAR_ASIGNACION')
                                  const retiros = hist.filter(h => h?.tipo === 'QUITAR_ASIGNACION')
                                  return (<>
                                    {/* Bloque de autor de carga */}
                                    <div style={{fontSize:11,color:'#6b7280',marginBottom:8,padding:'4px 8px',background:'#f1f5f9',borderRadius:6,borderLeft:'3px solid #94a3b8'}}>
                                      {(entradaCarga?.asignadoPor || entradaCarga?.cargadoPor)
                                        ? <span>Cargado por: <strong style={{color:'#1e40af'}}>{entradaCarga.asignadoPor || entradaCarga.cargadoPor}</strong>{entradaCarga.hora ? ` · ${entradaCarga.hora}` : ''}{entradaCarga.fecha ? ` · ${entradaCarga.fecha}` : ''}</span>
                                        : entradaCarga?.motivo === 'Carga masiva'
                                          ? <span>Vía: <strong>Carga masiva</strong>{entradaCarga.hora ? ` · ${entradaCarga.hora}` : ''}{entradaCarga.fecha ? ` · ${entradaCarga.fecha}` : ''}</span>
                                          : entradaCarga?.motivo === 'Asignacion importada'
                                            ? <span>Vía: <strong>Importación (Excel)</strong>{entradaCarga.fecha ? ` · ${entradaCarga.fecha}` : ''}</span>
                                            : <span style={{color:'#9ca3af'}}>Sin registro de autor de carga</span>
                                      }
                                    </div>
                                    {cola.length === 0
                                      ? <div style={{fontSize:11,color:'#ccc'}}>Sin asignaciones.</div>
                                      : cola.map((h,ci)=>{
                                          const sig = cola[ci+1]
                                          const tipif = ci===cola.length-1
                                            ? (r._tipifVend || '')
                                            : (sig && sig.tipifVendAntes!=null ? sig.tipifVendAntes : '')
                                          const nombreAsesor = String(h.asesor || '').trim().toUpperCase()
                                          const tipsAsesor = hist
                                            .filter(t => t?.tipo==='TIPIF_VEND' && String(t.asesor||'').trim().toUpperCase()===nombreAsesor)
                                            .sort((a,b)=>(a.ts||0)-(b.ts||0))
                                          const asignadoPor = h.tipo==='ROTACION'
                                            ? (h.rotadoPor || '—')
                                            : (h.reasignadoPor || h.motivo || '—')
                                          return (
                                            <div key={ci} className="hist-item">
                                              <div className="hist-dot" style={{background:DOT_COLORS[ci%DOT_COLORS.length]}} />
                                              <div className="hist-content">
                                                <div className="hist-title" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                                                  <strong>{h.asesor||'—'}</strong>
                                                  <button type="button" title="Eliminar esta asignación" onClick={()=>eliminarAsignacion(r.id, h)}
                                                    style={{fontSize:10,padding:'2px 8px',border:'1px solid #ef4444',color:'#ef4444',background:'#fff',borderRadius:5,cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>
                                                    Quitar
                                                  </button>
                                                </div>
                                                <div className="hist-meta">Asignado: {h.hora||'—'}{h.hora&&h.fecha?' · ':''}{h.fecha||''}</div>
                                                <div className="hist-tipificaciones-horizontal" style={{display:'flex',flexWrap:'wrap',gap:'6px 18px',margin:'4px 0'}}>
                                                  {tipsAsesor.length ? tipsAsesor.map((t,ti)=>(
                                                    <span key={ti} style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,whiteSpace:'nowrap'}}>
                                                      <span style={{color:'#9ca3af',fontFamily:'monospace'}}>{t.hora||'—'}{t.fecha?` · ${t.fecha}`:''}</span>
                                                      <strong style={{color:'#065f46'}}>{t.tipif||'—'}</strong>
                                                    </span>
                                                  )) : <span className="hist-sub">Tipificación: <strong style={{color:'#065f46'}}>{tipif || '—'}</strong></span>}
                                                </div>
                                                <div className="hist-sub">Asignado por: {asignadoPor}</div>
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
              <div className="paginacion">
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
                  {[
                    ['sin_cobertura','SIN COBERTURA',gruposProtegidos.sin_cobertura.length,'#dc2626'],
                    ['no_tocar','NO TOCAR',gruposProtegidos.no_tocar.length,'#9f1239'],
                    ['venta_cerrada','VENTA CERRADA',gruposProtegidos.venta_cerrada.length,'#16a34a'],
                    ['venta_caida','VENTA CAIDA',gruposProtegidos.venta_caida.length,'#a64d79'],
                    ['instalado','INSTALADO',gruposProtegidos.instalado.length,'#0369a1'],
                    ['blacklist','BLACKLIST',gruposProtegidos.blacklist.length,'#111827'],
                  ].map(([id,label,total,color]) => (
                    <button key={id} type="button" onClick={()=>setGrupoProtegidoVisible(prev=>prev===id?'':id)}
                      style={{border:`1px solid ${color}`,color:grupoProtegidoVisible===id?'#fff':color,background:grupoProtegidoVisible===id?color:'#fff',borderRadius:8,padding:'7px 11px',fontSize:11,fontWeight:800,cursor:'pointer'}}>
                      {grupoProtegidoVisible===id?'Ocultar':'Ver'} {label} ({total})
                    </button>
                  ))}
                  {grupoProtegidoVisible && <button type="button" onClick={()=>setGrupoProtegidoVisible('')} className="bo-btn-limpiar btn btn-sm">Volver a pendientes operativos</button>}
                </div>
              </div>
            </div>
            </>}
          </section>

          {/* ══ SECCIÓN: CARGA MASIVA ══════════════════════════════════════════ */}
          <section className={`bo-seccion${seccion==='carga-masiva'?'':' hidden'}`}>
            <div className="bo-seccion-header">
              <div>
                <h2>Carga Masiva de Base</h2>
                <p className="bo-sub">Pega números directamente · importa CSV/TXT/XLSX · o usa tu sistema antiguo</p>
              </div>
            </div>

            {/* Date nav carga masiva */}
            <div className="fecha-nav-row" style={{marginBottom:16}}>
              <span style={{fontSize:11,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:.4,whiteSpace:'nowrap'}}>Fecha destino:</span>
              <div className="fecha-nav-ctrl">
                <button className="fnav-btn" onClick={()=>navegarFecha(-1)} disabled={prevDis}>←</button>
                <select className="fnav-select" value={fechaActiva} onChange={e=>setFechaActiva(e.target.value)}>
                  {fechaPestanas.map(f=><option key={f} value={f}>{formatFecha(f)} ({fechaCantidades[f] ?? (baseData[f]||[]).length})</option>)}
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
                      <textarea value={masivaNums} onChange={e=>setMasivaNums(e.target.value)} rows={8} placeholder={'987654321\n976543210\n965432109'} />
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
                    <button className="btn-masiva-preview" onClick={previsualizarMasiva} disabled={cargandoMasiva}>Vista previa</button>
                    <button className="btn-masiva-go" onClick={ejecutarCargaMasiva} disabled={masivaFilasParaCargar.length===0||cargandoMasiva}>
                      {cargandoMasiva ? 'Importando...' : `Cargar ${masivaFilasParaCargar.length} registros`}
                    </button>
                    <span style={{fontSize:11,color:'#6b7280'}}>Destino: <strong>{formatFecha(fechaActiva)}</strong></span>
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
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>N1</th>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>Campaña</th>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>Fecha</th>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase'}}>Estado</th>
                          </tr></thead>
                          <tbody>
                            {masivaFilas.map((f,i)=>(
                              <tr key={i} style={{borderBottom:'1px solid #f3f4f6',background:f.dup?'#fef2f2':''}}>
                                <td style={{padding:'5px 10px',color:'#9ca3af'}}>{i+1}</td>
                                <td style={{padding:'5px 10px',fontFamily:'monospace',fontWeight:600}}>{f.n1}</td>
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
                    <div style={{fontSize:12,color:'#9ca3af'}}>Acepta CSV · TXT · XLSX — columnas: N1, N2, Campaña, Distrito, Tipif</div>
                    <input ref={archivoInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{display:'none'}} onChange={e=>{ if(e.target.files.length) procesarArchivo(e.target.files[0]) }} />
                  </div>
                  {archivoStatus && <div style={{marginTop:10,fontSize:12,color:'#6b7280'}}>{archivoStatus}</div>}
                  {archivoRows.length > 0 && (
                    <div style={{marginTop:10}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>{archivoInfo} — Destino: <strong>{formatFecha(fechaActiva)}</strong></span>
                        <button className="btn-masiva-go" onClick={ejecutarCargaArchivo} disabled={cargandoMasiva}>
                          {cargandoMasiva ? 'Importando...' : `Cargar ${archivoRows.length} registros`}
                        </button>
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
                  {/* Título */}
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:14,fontWeight:700,color:'#1f2937',marginBottom:2}}>Carga masiva desde Excel</div>
                    <div style={{fontSize:12,color:'#6b7280'}}>Importa tu base en formato Excel (.xlsx), CSV o TXT. Un registro por fila.</div>
                  </div>

                  {/* Selector de modo */}
                  <div className="bo-input-group" style={{margin:'0 0 12px'}}>
                    <label>Modo de fecha</label>
                    <select
                      value={legacyUsarFecha}
                      onChange={e=>{ setLegacyUsarFecha(e.target.value); setLegacyRows([]); setLegacyInfo(''); setLegacyStatus(''); setLegacyError(''); setImportResult(null); if(legacyInputRef.current) legacyInputRef.current.value='' }}
                      style={{fontSize:12,padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontFamily:'inherit',background:'#fff'}}
                    >
                      <option value="no">Usar fecha seleccionada — una fecha para todo el archivo</option>
                      <option value="si">Usar fecha del archivo — cada fila tiene su propia fecha</option>
                    </select>
                  </div>

                  {/* Controles de fecha condicionales */}
                  {legacyUsarFecha === 'si' ? (
                    <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,padding:'12px 14px',marginBottom:14}}>
                      <div style={{fontSize:11,fontWeight:700,color:'#1e40af',marginBottom:8,textTransform:'uppercase',letterSpacing:.3}}>Rango permitido (para validación)</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                        <div className="bo-input-group" style={{margin:0}}>
                          <label>Desde</label>
                          <input type="date" value={legacyDesde} onChange={e=>{ setLegacyDesde(e.target.value); setLegacyRows([]); setLegacyInfo(''); if(legacyInputRef.current) legacyInputRef.current.value='' }} style={{fontSize:12,padding:'6px 10px',border:'1px solid #bfdbfe',borderRadius:8,fontFamily:'inherit',background:'#fff'}} />
                        </div>
                        <div className="bo-input-group" style={{margin:0}}>
                          <label>Hasta</label>
                          <input type="date" value={legacyHasta} max={fechaHoy()} onChange={e=>{ setLegacyHasta(e.target.value); setLegacyRows([]); setLegacyInfo(''); if(legacyInputRef.current) legacyInputRef.current.value='' }} style={{fontSize:12,padding:'6px 10px',border:'1px solid #bfdbfe',borderRadius:8,fontFamily:'inherit',background:'#fff'}} />
                        </div>
                      </div>
                      <div style={{fontSize:10,color:'#1e40af',marginTop:6}}>Cada fila debe tener la columna FECHA. Las filas fuera del rango se marcan como error.</div>
                    </div>
                  ) : (
                    <div className="bo-input-group" style={{margin:'0 0 14px'}}>
                      <label>Fecha destino</label>
                      <input
                        type="date"
                        value={legacyFecha}
                        max={fechaHoy()}
                        onChange={e=>{ setLegacyFecha(e.target.value); setLegacyRows([]); setLegacyInfo(''); if(legacyInputRef.current) legacyInputRef.current.value='' }}
                        style={{fontSize:12,padding:'7px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontFamily:'inherit',background:'#fff',width:'100%',boxSizing:'border-box'}}
                      />
                      {legacyFecha > fechaHoy() && <div style={{fontSize:11,color:'#dc2626',marginTop:4}}>No se permiten fechas futuras.</div>}
                    </div>
                  )}

                  {/* Selector de archivo */}
                  <div
                    onClick={()=>legacyInputRef.current?.click()}
                    onDragOver={e=>{ e.preventDefault(); setLegacyDragOver(true) }}
                    onDragLeave={()=>setLegacyDragOver(false)}
                    onDrop={e=>{ e.preventDefault(); setLegacyDragOver(false); if(e.dataTransfer.files.length) procesarLegacy(e.dataTransfer.files[0]) }}
                    style={{border:`2px dashed ${legacyDragOver?'#1d4ed8':'#d1d5db'}`,borderRadius:10,padding:'28px 24px',textAlign:'center',cursor:'pointer',background:legacyDragOver?'#eff6ff':'#fafafa',transition:'all .15s'}}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={legacyDragOver?'#1d4ed8':'#9ca3af'} strokeWidth="1.8" style={{marginBottom:8}} aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <div style={{fontSize:13,fontWeight:600,color:'#374151',marginBottom:3}}>Arrastra tu archivo aquí o haz clic para seleccionar</div>
                    <div style={{fontSize:11,color:'#9ca3af'}}>Archivo Excel (.xlsx), CSV o TXT · Un registro por fila</div>
                    <input ref={legacyInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{display:'none'}} onChange={e=>{ if(e.target.files.length) procesarLegacy(e.target.files[0]) }} />
                  </div>
                  {legacyStatus && <div style={{fontSize:12,color:'#6b7280',marginTop:8}}>{legacyStatus}</div>}

                  {/* Lista de columnas */}
                  <div style={{background:'#f9fafb',border:'1px solid #e5e7eb',borderRadius:8,padding:'12px 16px',marginTop:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#374151',marginBottom:6,textTransform:'uppercase',letterSpacing:.4}}>Columnas del archivo (en orden):</div>
                    <div style={{fontSize:11,color:'#374151',lineHeight:2,wordBreak:'break-word'}}>
                      {legacyUsarFecha==='si' && <><span style={{background:'#dbeafe',borderRadius:4,padding:'1px 6px',marginRight:4,fontWeight:700,color:'#1e40af'}}>FECHA *</span></>}
                      <span style={{background:'#f3f4f6',borderRadius:4,padding:'1px 6px',marginRight:4}}>CAMPAÑA</span>
                      <span style={{background:'#f3f4f6',borderRadius:4,padding:'1px 6px',marginRight:4}}>DISTRITO</span>
                      <span style={{background:'#f3f4f6',borderRadius:4,padding:'1px 6px',marginRight:4}}>N2</span>
                      <span style={{background:'#fef3c7',borderRadius:4,padding:'1px 6px',marginRight:4,fontWeight:700,color:'#92400e'}}>N1 *</span>
                      <span style={{background:'#f3f4f6',borderRadius:4,padding:'1px 6px',marginRight:4}}>TIPIF. BACK</span>
                      <span style={{background:'#f3f4f6',borderRadius:4,padding:'1px 6px',marginRight:4}}>COMENTARIO</span>
                      <span style={{background:'#f3f4f6',borderRadius:4,padding:'1px 6px',marginRight:4}}>TIPIFICACIÓN</span>
                      <span style={{background:'#f3f4f6',borderRadius:4,padding:'1px 6px',marginRight:4}}>HORA</span>
                      <span style={{background:'#f3f4f6',borderRadius:4,padding:'1px 6px',marginRight:4}}>ASESOR 1</span>
                      <span style={{color:'#9ca3af',fontSize:10,marginRight:4}}>···</span>
                      <span style={{background:'#f3f4f6',borderRadius:4,padding:'1px 6px',marginRight:4}}>ASESOR 6</span>
                    </div>
                    <div style={{fontSize:10,color:'#9ca3af',marginTop:6}}>
                      {legacyUsarFecha==='si'
                        ? '* FECHA y N1 son obligatorios. Formatos de fecha aceptados: DD/MM/YYYY o YYYY-MM-DD.'
                        : '* N1 es el único campo obligatorio. El resto son opcionales.'}
                    </div>
                  </div>

                  {/* Botón descargar plantilla */}
                  <button
                    onClick={descargarFormato}
                    style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:10,padding:'14px 20px',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer',marginTop:12,letterSpacing:.2}}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    DESCARGAR PLANTILLA EXCEL DE EJEMPLO
                  </button>

                  {/* Vista previa + botones de importación */}
                  {legacyRows.length > 0 && (() => {
                    const validRows  = legacyRows.filter(r=>!r._fechaError)
                    const errorRows  = legacyRows.filter(r=>r._fechaError)
                    const distribPrev = {}
                    validRows.forEach(r=>{ distribPrev[r.fecha]=(distribPrev[r.fecha]||0)+1 })
                    const fechasDetectadas = Object.keys(distribPrev).sort()
                    return (
                    <div style={{marginTop:16,background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:10,padding:14}}>
                      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10,flexWrap:'wrap',gap:8}}>
                        <div>
                          <div style={{fontSize:12,fontWeight:700,color:'#92400e',marginBottom:4}}>Vista previa — {legacyInfo}</div>
                          {legacyUsarFecha==='si' && fechasDetectadas.length > 1 ? (
                            <div style={{fontSize:11,color:'#92400e'}}>
                              Rango detectado: <strong>{formatFecha(fechasDetectadas[0])} – {formatFecha(fechasDetectadas[fechasDetectadas.length-1])}</strong>
                              <span style={{margin:'0 8px',color:'#fed7aa'}}>·</span>
                              {fechasDetectadas.length} fechas distintas
                              {errorRows.length > 0 && <span style={{marginLeft:8,color:'#dc2626',fontWeight:700}}> · {errorRows.length} con error de fecha</span>}
                            </div>
                          ) : (
                            <div style={{fontSize:11,color:'#92400e'}}>
                              Fecha destino: <strong>{legacyUsarFecha==='si' ? formatFecha(legacyRows.find(r=>!r._fechaError)?.fecha||'') : formatFecha(legacyFecha)}</strong>
                              <span style={{margin:'0 8px',color:'#fed7aa'}}>·</span>
                              {validRows.length} válidos{errorRows.length>0&&<span style={{color:'#dc2626',fontWeight:700}}> · {errorRows.length} con error</span>}
                            </div>
                          )}
                        </div>
                        <div style={{display:'flex',gap:6,flexShrink:0}}>
                          <button className="btn-masiva-preview" onClick={()=>{ setLegacyRows([]); setLegacyError(''); setImportResult(null) }} disabled={cargandoLegacy}>Cancelar</button>
                          <button className="btn-masiva-go" onClick={ejecutarCargaLegacy} style={{background:'#c2410c'}} disabled={cargandoLegacy}>
                            {cargandoLegacy ? 'Importando...' : `Importar ${validRows.length} registros`}
                          </button>
                        </div>
                      </div>
                      {/* Distribución por fecha (modo archivo) */}
                      {legacyUsarFecha==='si' && fechasDetectadas.length > 0 && (
                        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:10}}>
                          {fechasDetectadas.map(f=>(
                            <div key={f} style={{background:'#fff',border:'1px solid #fed7aa',borderRadius:6,padding:'4px 10px',fontSize:11}}>
                              <span style={{fontWeight:700,color:'#c2410c'}}>{formatFecha(f)}</span>
                              <span style={{color:'#92400e',marginLeft:6}}>{distribPrev[f]} reg.</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{maxHeight:220,overflowY:'auto',border:'1px solid #e5e7eb',borderRadius:8,background:'#fff'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,whiteSpace:'nowrap'}}>
                          <thead><tr style={{background:'#f9fafb',position:'sticky',top:0}}>
                            {(legacyUsarFecha==='si'
                              ? ['#','Fecha','Campaña','Distrito','N1','N2','Tipif. Back','Hora','Asesores','Estado']
                              : ['#','Campaña','Distrito','N1','N2','Tipif. Back','Tipif. Vend.','Hora','Asesores']
                            ).map(h=>(
                              <th key={h} style={{padding:'5px 10px',textAlign:'left',color:'#6b7280',fontSize:9,textTransform:'uppercase',fontWeight:700,borderBottom:'1px solid #e5e7eb'}}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {legacyRows.slice(0,80).map((r,i)=>(
                              <tr key={i} style={{borderBottom:'1px solid #f3f4f6',background:r._fechaError?'#fef2f2':''}}>
                                <td style={{padding:'4px 10px',color:'#9ca3af'}}>{i+1}</td>
                                {legacyUsarFecha==='si' && (
                                  <td style={{padding:'4px 10px',fontWeight:700,color:r._fechaError?'#dc2626':'#1d4ed8',minWidth:85}}>
                                    {r._fechaError ? <span title={r._fechaErrorMsg} style={{cursor:'help'}}>⚠ {r._fechaErrorMsg?.slice(0,18)}</span> : formatFecha(r.fecha)}
                                  </td>
                                )}
                                <td style={{padding:'4px 10px',fontWeight:600,color:'#1f2937'}}>{r.campana}</td>
                                <td style={{padding:'4px 10px',color:'#374151'}}>{r.distrito}</td>
                                <td style={{padding:'4px 10px',fontFamily:'monospace',fontWeight:700,color:'#1d4ed8'}}>{r.n1}</td>
                                <td style={{padding:'4px 10px',fontFamily:'monospace',color:'#6b7280'}}>{r.n2||'—'}</td>
                                <td style={{padding:'4px 10px',color:'#374151'}}>{r.tipifBack||'—'}</td>
                                {legacyUsarFecha!=='si' && <td style={{padding:'4px 10px',color:'#374151'}}>{r.tipifVend||'—'}</td>}
                                <td style={{padding:'4px 10px',color:'#185FA5',fontWeight:600}}>{r.hora||'—'}</td>
                                <td style={{padding:'4px 10px',color:'#6b7280',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis'}}>{r.asesores.join(' → ')||'—'}</td>
                                {legacyUsarFecha==='si' && (
                                  <td style={{padding:'4px 10px'}}>
                                    {r._fechaError
                                      ? <span style={{background:'#fee2e2',color:'#991b1b',fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:99}}>ERROR</span>
                                      : <span style={{background:'#dcfce7',color:'#15803d',fontSize:9,fontWeight:700,padding:'2px 6px',borderRadius:99}}>OK</span>}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {legacyRows.length > 80 && <div style={{fontSize:10,color:'#9ca3af',textAlign:'center',marginTop:6}}>Mostrando 80 de {legacyRows.length} registros</div>}
                    </div>
                    )
                  })()}
                </div>
              )}
            </div>

            {/* Error de importación */}
            {legacyError && (
              <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:14,marginTop:4,display:'flex',alignItems:'flex-start',gap:10}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" style={{flexShrink:0,marginTop:1}} aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:'#dc2626',marginBottom:2}}>Error al importar</div>
                  <div style={{fontSize:11,color:'#7f1d1d'}}>{legacyError}</div>
                </div>
              </div>
            )}
            {/* Resultado de importación */}
            {importResult && (() => {
              const { total, importados, creados, actualizados, existentes, duplicados, errores, erroresDetalle, fecha, fechas, distribucion } = importResult
              const fechasSorted = (fechas||[]).slice().sort()
              const esMultifecha = fechasSorted.length > 1
              const titulo = esMultifecha
                ? `IMPORTACIÓN COMPLETADA · Rango: ${formatFecha(fechasSorted[0])} al ${formatFecha(fechasSorted[fechasSorted.length-1])}`
                : `IMPORTACIÓN COMPLETADA · Fecha: ${formatFecha(fecha)}`
              return (
              <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:18,marginTop:4}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#15803d'}}>{titulo}</div>
                  <button
                    onClick={()=>{ irSeccion('base'); setFechaActiva(fecha) }}
                    style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:7,fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                    VER REGISTROS EN BASE
                  </button>
                </div>
                <div style={{display:'flex',gap:20,flexWrap:'wrap',marginBottom: distribucion && Object.keys(distribucion).length ? 14 : 0}}>
                  {[
                    ['Procesados',  total,                      '#374151'],
                    ['Creados',     creados    ?? importados,   '#15803d'],
                    ['Actualizados',actualizados ?? 0,          '#1d4ed8'],
                    ['Existentes',  existentes ?? duplicados ?? 0, '#b45309'],
                    ['Con error',   errores,                    '#dc2626'],
                  ].map(([label,val,color])=>(
                    <div key={label} style={{textAlign:'center',minWidth:60}}>
                      <div style={{fontSize:22,fontWeight:800,color}}>{val}</div>
                      <div style={{fontSize:10,color:'#6b7280',textTransform:'uppercase',letterSpacing:.4}}>{label}</div>
                    </div>
                  ))}
                </div>
                {erroresDetalle && erroresDetalle.length > 0 && (
                  <div style={{borderTop:'1px solid #bbf7d0',paddingTop:10,marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#dc2626',marginBottom:6}}>Registros con error ({erroresDetalle.length}):</div>
                    <div style={{maxHeight:100,overflowY:'auto',fontSize:10,color:'#7f1d1d'}}>
                      {erroresDetalle.map((e,i)=><div key={i} style={{padding:'2px 0'}}>Fila {e.fila} · N1: {e.n1} · {e.motivo}</div>)}
                    </div>
                  </div>
                )}
                {distribucion && Object.keys(distribucion).length > 0 && (
                  <div style={{borderTop:'1px solid #bbf7d0',paddingTop:12}}>
                    <div style={{fontSize:11,fontWeight:700,color:'#15803d',marginBottom:8,textTransform:'uppercase',letterSpacing:.3}}>Distribución final por fecha:</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
                      {Object.entries(distribucion).sort(([a],[b])=>a.localeCompare(b)).map(([f,n])=>(
                        <div key={f} style={{background:'#fff',border:'1px solid #bbf7d0',borderRadius:7,padding:'5px 12px',fontSize:11}}>
                          <span style={{fontWeight:700,color:'#15803d'}}>{formatFecha(f)}</span>
                          <span style={{color:'#374151',marginLeft:8,fontWeight:600}}>{n} importados</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              )
            })()}
          </section>

          {/* ══ SECCIÓN: RENDIMIENTO ═══════════════════════════════════════════ */}
          <section className={`bo-seccion${seccion==='rendimiento'?'':' hidden'}`}>
            <div className="bo-seccion-header">
              <div>
                <h2>Rendimiento de Asesores</h2>
                <p className="bo-sub">Leads asignados y ventas cerradas por período</p>
              </div>
            </div>
            <div className="rend-filtros">
              <div className="bo-input-group" style={{minWidth:150}}>
                <label>Filtrar por</label>
                <select className="form-select" value={rendFiltroTipo} onChange={e=>setRendFiltroTipo(e.target.value)}>
                  <option value="mes">Mes actual</option>
                  <option value="rango">Rango de fechas</option>
                  <option value="dia">Hoy / fecha específica</option>
                  <option value="global">Global (todo)</option>
                </select>
              </div>
              {rendFiltroTipo === 'dia' && (
                <div className="bo-input-group" style={{minWidth:150}}>
                  <label>Fecha</label>
                  <input className="form-control" type="date" value={rendFiltroFecha} onChange={e=>setRendFiltroFecha(e.target.value)} />
                </div>
              )}
              {rendFiltroTipo === 'rango' && <>
                <div className="bo-input-group" style={{minWidth:140}}><label>Desde</label><input className="form-control" type="date" value={rendDesde} onChange={e=>setRendDesde(e.target.value)} /></div>
                <div className="bo-input-group" style={{minWidth:140}}><label>Hasta</label><input className="form-control" type="date" value={rendHasta} onChange={e=>setRendHasta(e.target.value)} /></div>
              </>}
              <div className="bo-input-group" style={{minWidth:170}}>
                <label>Sala</label>
                <select className="form-select" value={rendFiltroSala} onChange={e=>{setRendFiltroSala(e.target.value);setRendFiltroAsesor('')}}>
                  <option value="">Todas las salas</option>
                  {rendSalas.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="bo-input-group" style={{minWidth:210}}>
                <label>Vendedor</label>
                <select className="form-select" value={rendFiltroAsesor} onChange={e=>setRendFiltroAsesor(e.target.value)}>
                  <option value="">Todos los vendedores</option>
                  {rendAsesoresDisponibles.map(a=><option key={a.id||a.nombre} value={a.nombre}>{a.nombre}</option>)}
                </select>
              </div>
              <div className="bo-input-group" style={{minWidth:175}}>
                <label>Ordenar por</label>
                <select className="form-select" value={rendOrden} onChange={e=>setRendOrden(e.target.value)}>
                  <option value="ventas">Mayor cantidad de ventas</option>
                  <option value="leads">Mayor cantidad de leads</option>
                </select>
              </div>
              <div style={{alignSelf:'flex-end',paddingBottom:2}}>
                <button className="bo-btn-limpiar btn btn-sm" style={{fontSize:11,padding:'6px 12px'}} onClick={()=>{setRendFiltroTipo('global');setRendFiltroSala('');setRendFiltroAsesor('')}}>Ver todo</button>
              </div>
            </div>
            <div className="rend-kpis">
              {[['Total clientes',rendTotLeads,'rd-kpi-leads'],['Total ventas',rendTotVentas,'rd-kpi-ventas'],['Ventas cerradas',rendTotCerradas,'rd-kpi-ventas'],['Instaladas',rendTotInstaladas,'rd-kpi-leads'],['Conversión',`${rendConversion}%`,'rd-kpi-ventas']].map(([l,v,cls])=>(
                <div key={l} className={`rend-kpi ${cls}`}><div className="rend-kpi-label">{l}</div><div className="rend-kpi-valor">{v}</div></div>
              ))}
            </div>
            <div className="bo-tabla-wrap">
              <table className="bo-tabla rend-tabla table table-sm table-hover">
                <thead><tr>
                  <th>#</th><th>Asesor</th><th>Clientes</th><th>Ventas</th><th>Ventas cerradas</th><th>Instaladas</th><th>Conversión</th>
                </tr></thead>
                <tbody>
                  {rendData.length === 0
                    ? <tr><td colSpan={7} className="bo-empty">Sin datos.</td></tr>
                    : rendData.map((r,i)=>(
                        <tr key={r.nombre}>
                          <td><div className={`rend-pos${i<3?' '+['p1','p2','p3'][i]:''}`}>{i+1}</div></td>
                          <td><div className="rd-asesor-cell"><div className="rd-avatar" style={{background:colorAv(r.nombre)}}>{iniciales(r.nombre)}</div><div className="rd-name-block"><div className="rd-asesor-name">{r.nombre}</div><div className="rd-asesor-user">{r.usuario}</div></div></div></td>
                          <td style={{fontWeight:600}}>{r.leads}</td>
                          <td><span className="rd-ventas-num">{r.ventas}</span></td>
                          <td>{r.cerradas}</td>
                          <td>{r.instaladas}</td>
                          <td>{r.conversion}%</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>
          </section>

          {/* ══ SECCIÓN: AVANCE DE ASESORES ═══════════════════════════════════ */}
          <section className={`bo-seccion${seccion==='avance'?'':' hidden'}`}>
            <div className="bo-seccion-header">
              <div>
                <h2>Avance de Asesores</h2>
                <p className="bo-sub">Todos los asesores de todas las salas — abre la base de llamadas de cada uno</p>
              </div>
              <input type="text" value={avanceBuscar} onChange={e=>setAvanceBuscar(e.target.value)} placeholder="Buscar asesor..." style={{padding:'8px 12px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:12,fontFamily:'inherit',outline:'none',minWidth:200}} />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
              {avanceFiltrado.length === 0
                ? <div style={{gridColumn:'1/-1',textAlign:'center',padding:40,color:'#9ca3af'}}>No hay asesores registrados.</div>
                : avanceFiltrado.map(a=>(
                    <div key={a.id} style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:16,padding:18,boxShadow:'0 2px 8px rgba(0,0,0,.05)'}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                        <div style={{width:44,height:44,borderRadius:'50%',background:colorAv(a.nombre),display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:700,color:'#fff'}}>{iniciales(a.nombre)}</div>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:'#111827',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{a.nombre}</div>
                          <div style={{fontSize:11,color:'#9ca3af'}}>@{a.usuario||'—'} · {a.sala||'—'}</div>
                        </div>
                      </div>
                      <button onClick={()=>abrirBlModal(a.nombre,a.id)} style={{width:'100%',padding:'9px 12px',border:'1px solid #bfdbfe',borderRadius:8,background:'#eff6ff',color:'#1d4ed8',fontSize:12,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>Ver base de llamadas</button>
                    </div>
                  ))
              }
            </div>
          </section>

        </main>
      </div>

      {/* ══ MODAL ROTACIÓN MANUAL ════════════════════════════════════════════ */}
      {modalRotar.open && (
        <div className="modal-overlay open" onClick={e=>{ if(e.target===e.currentTarget) setModalRotar(p=>({...p,open:false})) }}>
          <div className="modal-box">
            <h3>Rotar lead manualmente</h3>
            <p>{modalRotar.desc}</p>
            {modalRotar.otraDireccionDisponible && (
              <div style={{padding:'10px 12px',border:'1px solid #c4b5fd',borderRadius:10,background:'#f5f3ff',color:'#5b21b6',fontSize:12,fontWeight:700,marginBottom:10}}>
                OTRA DIRECCIÓN — abrirá una venta independiente conservando un solo lead.
              </div>
            )}
            {(() => {
              const esReactivable = nombre => (modalRotar.asesoresReactivables || [])
                .some(n => n.toUpperCase() === String(nombre || '').trim().toUpperCase())
              const esReasignable = nombre => (modalRotar.asesoresReasignables || [])
                .some(n => n.toUpperCase() === String(nombre || '').trim().toUpperCase())
              const disponibles = asesores
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
                      <div key={a.id} onClick={()=>{ setRotModalAsesor(a.nombre); setRotModalError('') }}
                        style={{padding:'7px 9px', cursor:'pointer', fontSize:13, borderRadius:7, fontWeight:a.nombre===rotModalAsesor?700:400, background:a.nombre===rotModalAsesor?'#fef2f2':'transparent', color:a.nombre===rotModalAsesor?'#b91c1c':'#111827'}}>
                        {a.nombre}{esReactivable(a.nombre)
                          ? ' — REACTIVAR HOY'
                          : (esReasignable(a.nombre) ? ' — REASIGNAR MANUALMENTE' : '')}
                      </div>
                    ))}
                    {filtrados.length===0 && <div style={{padding:'8px 9px', fontSize:12, color:'#9ca3af'}}>Sin resultados</div>}
                  </div>
                </div>
              )
            })()}
            <textarea value={rotModalMotivo} onChange={e=>setRotModalMotivo(e.target.value)} placeholder="Motivo de la rotación (opcional)..." />
            {rotModalError && <div role="alert" style={{marginTop:8,padding:'9px 11px',border:'1px solid #fecaca',borderRadius:8,background:'#fef2f2',color:'#b91c1c',fontSize:12,fontWeight:650}}>{rotModalError}</div>}
            <div className="modal-btns">
              <button className="btn-cancelar-modal" onClick={()=>setModalRotar(p=>({...p,open:false}))}>Cancelar</button>
              <button className="btn-confirmar-modal" onClick={confirmarRotacion} disabled={!rotModalAsesor || rotandoManual}>
                {rotModalTipo==='OTRA_DIRECCION' ? (rotandoManual?'Habilitando...':'Habilitar otra dirección') : rotandoManual
                  ? ((modalRotar.asesoresReactivables || []).some(n => n.toUpperCase() === rotModalAsesor.toUpperCase())
                    ? 'Reactivando...'
                    : ((modalRotar.asesoresReasignables || []).some(n => n.toUpperCase() === rotModalAsesor.toUpperCase()) ? 'Reasignando...' : 'Rotando...'))
                  : ((modalRotar.asesoresReactivables || []).some(n => n.toUpperCase() === rotModalAsesor.toUpperCase())
                    ? 'Reactivar hoy'
                    : ((modalRotar.asesoresReasignables || []).some(n => n.toUpperCase() === rotModalAsesor.toUpperCase()) ? 'Reasignar manualmente' : 'Rotar ahora'))}
              </button>
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
              <input value={blBuscar} onChange={e=>setBlBuscar(e.target.value)} placeholder="Filtrar número, campaña, zona u observación..." style={{padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:11,fontFamily:'inherit',outline:'none',minWidth:245}} />
              <select value={blFiltroTipif} onChange={e=>setBlFiltroTipif(e.target.value)} style={{padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:11,fontFamily:'inherit',outline:'none'}}>
                <option value="">Todas las tipificaciones</option><option value="__pendiente__">Sin tipificar</option>
                {blTipificaciones.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
              <select value={blFiltroBack} onChange={e=>setBlFiltroBack(e.target.value)} style={{padding:'6px 10px',border:'1px solid #e5e7eb',borderRadius:8,fontSize:11,fontFamily:'inherit',outline:'none'}}>
                <option value="">Todas las Obs. Back</option><option value="DERIVADO">Derivados</option><option value="LLAMAR AHORA">Llamar ahora</option>
              </select>
              <span style={{fontSize:12,color:'#9ca3af',marginLeft:'auto'}}>{blLeadsFiltrados.length} de {blLeads?.length??0} registros</span>
            </div>
            {blLeads && blLeads.length > 0 && (
              <div style={{padding:'10px 24px',display:'flex',gap:10,flexWrap:'wrap',borderBottom:'1px solid #f3f4f6'}}>
                {[{label:'Leads',val:blLeads.length,color:'#2563eb'},{label:'Tipificados',val:blLeads.filter(l=>(l.tipif_vend||'').trim()!=='').length,color:'#16a34a'},{label:'Derivados',val:blLeads.filter(l=>l.obs_back==='DERIVADO').length,color:'#0284c7'},{label:'VENTA CERRADA',val:blLeads.filter(l=>(l.tipif_vend||'').toUpperCase()==='VENTA CERRADA').length,color:'#7c3aed'},{label:'NC/Buzón',val:blLeads.filter(l=>['NO CONTESTA','BUZON DE VOZ'].includes((l.tipif_vend||'').toUpperCase())).length,color:'#d97706'}]
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
                  {['#','Teléfono N1','N2','Zona','Campaña','Hora asig.','Obs. Back','Tipificación','Hora tipif.','Observación'].map(h=>(
                    <th key={h} style={{padding:'10px 8px',textAlign:'left',fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',borderBottom:'1px solid #e5e7eb'}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {blCargando
                    ? <tr><td colSpan={10} style={{textAlign:'center',padding:40,color:'#9ca3af'}}>Cargando...</td></tr>
                    : !blLeads
                      ? <tr><td colSpan={10} style={{textAlign:'center',padding:40,color:'#ef4444'}}>Error de conexión.</td></tr>
                      : blLeadsFiltrados.length === 0
                        ? <tr><td colSpan={10} style={{textAlign:'center',padding:40,color:'#9ca3af'}}>Sin leads para los filtros seleccionados.</td></tr>
                        : blLeadsFiltrados.map((l,i)=>(
                            <tr key={i} style={{borderBottom:'1px solid #f3f4f6',background:(l.tipif_vend||'').toUpperCase()==='VENTA CERRADA'?'#f0fdf4':''}}>
                              <td style={{padding:8,color:'#9ca3af',fontSize:10}}>{i+1}</td>
                              <td style={{padding:8,fontFamily:'monospace',fontWeight:700,color:'#111827'}}>{l.n1||'—'}</td>
                              <td style={{padding:8,fontFamily:'monospace',color:'#6b7280'}}>{l.n2||'—'}</td>
                              <td style={{padding:8,fontSize:11}}>{l.distrito||l.campana||'—'}</td>
                              <td style={{padding:8,fontSize:11}}>{l.campana||'—'}</td>
                              <td style={{padding:8,fontSize:11,fontFamily:'monospace'}}>{l.hora_asig||'—'}</td>
                              <td style={{padding:8}}>{l.obs_back?<span className={`tipif-badge ${l.obs_back==='DERIVADO'?'b-programado':'b-nocontesta'}`}>{l.obs_back}</span>:'—'}</td>
                              <td style={{padding:8}}><BlBadge tipif={l.tipif_vend} /></td>
                              <td style={{padding:8,fontSize:11,fontFamily:'monospace',color:'#475569'}}>{l.tipif_hora||'—'}</td>
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

      {/* Lista compartida de asesores para el buscador de asignación */}
      <datalist id="asesores-datalist">
        {asesores.map(a=><option key={a.id} value={a.nombre} />)}
      </datalist>

      {numeroModal&&(
        <div className="numero-edit-overlay" onMouseDown={e=>{ if(e.target===e.currentTarget&&!numeroModal.guardando) setNumeroModal(null) }}>
          <div className="numero-edit-modal" role="dialog" aria-modal="true" aria-labelledby="numero-edit-title">
            <button type="button" className="numero-edit-close" onClick={()=>setNumeroModal(null)} disabled={numeroModal.guardando} aria-label="Cerrar">×</button>
            <div id="numero-edit-title" className="numero-edit-title">Editar números</div>
            <div className="numero-edit-sub">Actualiza el número principal y el número secundario del lead.</div>
            <label>Número 1 <span>*</span></label>
            <input value={numeroModal.n1} autoFocus inputMode="numeric" maxLength={20}
              onChange={e=>setNumeroModal(p=>({...p,n1:e.target.value.replace(/\D/g,'')}))}
              onKeyDown={e=>{ if(e.key==='Enter') guardarNumeros(); if(e.key==='Escape'&&!numeroModal.guardando) setNumeroModal(null) }}/>
            <label>Número 2 <small>(opcional)</small></label>
            <input value={numeroModal.n2} inputMode="numeric" maxLength={20}
              onChange={e=>setNumeroModal(p=>({...p,n2:e.target.value.replace(/\D/g,'')}))}
              onKeyDown={e=>{ if(e.key==='Enter') guardarNumeros(); if(e.key==='Escape'&&!numeroModal.guardando) setNumeroModal(null) }}/>
            <div className="numero-edit-actions">
              <button type="button" className="numero-edit-cancel" onClick={()=>setNumeroModal(null)} disabled={numeroModal.guardando}>Cancelar</button>
              <button type="button" className="numero-edit-save" onClick={guardarNumeros} disabled={numeroModal.guardando}>{numeroModal.guardando?'Guardando…':'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ POPOVER DNI ══════════════════════════════════════════════════════ */}
      {dniModal&&(
        <>
          <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setDniModal(null)}/>
          <div className="dni-popover" style={{top:dniModal.top,left:dniModal.left}}
            onKeyDown={e=>e.key==='Escape'&&setDniModal(null)}>
            <button type="button" className="dni-popover-close" onClick={()=>setDniModal(null)} aria-label="Cerrar">×</button>
            <div className="dni-popover-label">{dniModal.label||'DNI DE LA VENTA'}</div>
            {dniModal.editing ? (
              <>
                <input className="dni-popover-value" style={{width:'100%',textAlign:'center',border:'1px solid #bbf7d0',borderRadius:6,padding:'4px 6px',outline:'none'}}
                  value={dniModal.editVal||''} autoFocus maxLength={12}
                  onChange={e=>setDniModal(p=>({...p,editVal:e.target.value.replace(/\D/g,'')}))}
                  onKeyDown={e=>{ if(e.key==='Enter') guardarDni() }} />
                <button type="button" className="dni-copy-btn" onClick={guardarDni}>Guardar</button>
              </>
            ) : (
              <>
                <div className="dni-popover-value" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  <span>{dniModal.dni||'—'}</span>
                  {!dniModal.soloLectura&&<button type="button" title="Editar DNI" onClick={()=>setDniModal(p=>({...p,editing:true,editVal:p.dni||''}))}
                    style={{border:'none',background:'transparent',cursor:'pointer',fontSize:14,padding:0,lineHeight:1}}>✏️</button>}
                </div>
                <button type="button" className="dni-copy-btn" onClick={()=>{ copiarNumero(dniModal.dni); setDniModal(null) }}>Copiar</button>
              </>
            )}
          </div>
        </>
      )}

      {coberturaModal&&(
        <>
          <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setCoberturaModal(null)}/>
          <div className="dni-popover cobertura-popover" style={{top:coberturaModal.top,left:coberturaModal.left}}>
            <button type="button" className="dni-popover-close" onClick={()=>setCoberturaModal(null)} aria-label="Cerrar">×</button>
            <div className="dni-popover-label">SIN COBERTURA</div>
            <div className="cobertura-popover-campo"><strong>Distrito</strong><span>{coberturaModal.distrito||'—'}</span></div>
            <div className="cobertura-popover-campo"><strong>Coordenadas</strong><span>{coberturaModal.coordenadas||'—'}</span></div>
          </div>
        </>
      )}

      {/* ══ MODAL EDITAR CAMPAÑA ═════════════════════════════════════════════ */}
      {campanaModal&&(
        <div className="numero-edit-overlay"
          onMouseDown={e=>{ if(e.target===e.currentTarget&&!campanaModal.guardando) setCampanaModal(null) }}>
          <div className="numero-edit-modal" role="dialog" aria-modal="true" aria-labelledby="campana-edit-title">
            <button type="button" className="numero-edit-close"
              onClick={()=>setCampanaModal(null)} disabled={campanaModal.guardando} aria-label="Cerrar">×</button>
            <div id="campana-edit-title" className="numero-edit-title">Editar campaña</div>
            <div className="numero-edit-sub">Actualiza la campaña correspondiente a este lead.</div>
            <label>Campaña <span>*</span></label>
            <CampanaSelect value={campanaModal.valor} onChange={v=>setCampanaModal(p=>({...p,valor:v}))} plain sinOtro />
            <div className="numero-edit-actions">
              <button type="button" className="numero-edit-cancel"
                onClick={()=>setCampanaModal(null)} disabled={campanaModal.guardando}>Cancelar</button>
              <button type="button" className="numero-edit-save"
                onClick={guardarCampanaModal} disabled={campanaModal.guardando}>
                {campanaModal.guardando?'Guardando…':'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ORIGEN DEL REGISTRO ════════════════════════════════════════ */}
      {origenModal&&(
        <>
          <div style={{position:'fixed',inset:0,zIndex:9998,background:'rgba(0,0,0,0.25)'}} onClick={()=>setOrigenModal(null)}/>
          <div onKeyDown={e=>e.key==='Escape'&&setOrigenModal(null)}
            style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:9999,
              background:'#fff',borderRadius:10,padding:'20px 24px',
              boxShadow:'0 8px 32px rgba(0,0,0,0.18)',minWidth:270,maxWidth:340}}>
            <button type="button" className="dni-popover-close" onClick={()=>setOrigenModal(null)} aria-label="Cerrar">×</button>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:'#6b7280',marginBottom:14,textTransform:'uppercase'}}>Origen del registro</div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div style={{display:'flex',gap:8,alignItems:'baseline'}}>
                <span style={{fontSize:11,color:'#9ca3af',minWidth:90}}>Número</span>
                <strong style={{fontSize:13}}>{origenModal.n1||'—'}</strong>
              </div>
              {origenModal.usuario&&<div style={{display:'flex',gap:8,alignItems:'baseline'}}><span style={{fontSize:11,color:'#9ca3af',minWidth:90}}>Usuario</span><strong style={{fontSize:13}}>{origenModal.usuario}</strong></div>}
              {origenModal.origenCarga&&<div style={{display:'flex',gap:8,alignItems:'baseline'}}><span style={{fontSize:11,color:'#9ca3af',minWidth:90}}>Origen</span><strong style={{fontSize:13,color:'#7c3aed'}}>{origenModal.origenCarga}</strong></div>}
              {origenModal.ip&&<div style={{display:'flex',gap:8,alignItems:'baseline'}}><span style={{fontSize:11,color:'#9ca3af',minWidth:90}}>IP de carga</span><strong style={{fontSize:12}}>{origenModal.ip}</strong></div>}
              <div style={{display:'flex',gap:8,alignItems:'baseline'}}>
                <span style={{fontSize:11,color:'#9ca3af',minWidth:90}}>Campaña</span>
                <strong style={{fontSize:13}}>{origenModal.campana||'—'}</strong>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'baseline'}}>
                <span style={{fontSize:11,color:'#9ca3af',minWidth:90}}>Cargado por</span>
                <strong style={{fontSize:13,color:origenModal.cargadoPor?'#1e40af':'#9ca3af'}}>
                  {origenModal.cargadoPor||'Sin información'}
                </strong>
              </div>
              {origenModal.fecha&&(
                <div style={{display:'flex',gap:8,alignItems:'baseline'}}>
                  <span style={{fontSize:11,color:'#9ca3af',minWidth:90}}>Fecha</span>
                  <strong style={{fontSize:13}}>{origenModal.fecha}</strong>
                </div>
              )}
              {origenModal.hora&&(
                <div style={{display:'flex',gap:8,alignItems:'baseline'}}>
                  <span style={{fontSize:11,color:'#9ca3af',minWidth:90}}>Hora</span>
                  <strong style={{fontSize:13}}>{origenModal.hora}</strong>
                </div>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  )
}
