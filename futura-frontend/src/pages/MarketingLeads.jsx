import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import JefaturaViewControls from '../components/JefaturaViewControls'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import RangoFechasPicker from '../components/RangoFechasPicker'
import { API, ncHeaders } from '../services/api'
import * as XLSX from 'xlsx'
import '../styles/jefatura.css'

const TIPIF_VEND_RECL_LABELS = {
  'VENTA CERRADA':   'Acepta propuesta',
  'BUZON DE VOZ':    'Buzón de voz',
  'NO TOCAR':        'No cumple el perfil',
  'CORTA LLAMADA':   'Corta llamada',
  'GESTION WSP':      'Gestión WSP',
  'NO CONTESTA':      'No contesta',
  'NO INTERESADO':    'No interesado',
  'NO ROTAR':         'No rotar',
  'VOLVER A LLAMAR':  'Volver a llamar',
  'FRAUDE':           'Provincia',
}
function labelTipifVendRecl(valor) { return TIPIF_VEND_RECL_LABELS[String(valor||'').trim().toUpperCase()] || valor }

// Tipificaciones vigentes del vendedor en Backoffice (mismo set que
// TIPIF_VEND_OPCIONES en Backoffice.jsx) — el reporte de Marketing solo debe
// ofrecer estas para filtrar, no cualquier texto libre historico que haya
// quedado guardado en tipif_vend/tipif_back/tipif_back_2.
const TIPIF_VEND_VENTAS_ACTUALES = ['VENTA CERRADA','PREVENTA','AGENDADO','EN EJECUCION','INSTALADO','NO CONTESTA','BUZON DE VOZ','CORTA LLAMADA','NO DESEA','NO CALIFICA','SIN COBERTURA','CONTACTO CON TERCEROS','EDIFICIO NO LIBERADO','DESEA MOVIL','SERVICIO ACTIVO','NO ROTAR','SIN TIPIFICAR']
// OJO: toISOString() usa UTC, no la hora local — Lima va 5h detrás de UTC,
// así que entre las 7pm y medianoche (hora Lima) esto devolvía "mañana" en
// vez de "hoy" (el reporte cargaba con rango de fechas por defecto vacío).
function fechaHoy() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

// Exportación genérica a Excel: recibe filas ya filtradas (nunca solo la
// página visible) y una lista de columnas [encabezado, getter(fila)].
function descargarExcel(filas, columnas, nombreArchivo) {
  const datos = filas.map(fila => {
    const obj = {}
    columnas.forEach(([header, getter]) => { obj[header] = getter(fila) ?? '-' })
    return obj
  })
  const hoja  = XLSX.utils.json_to_sheet(datos)
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Datos')
  XLSX.writeFile(libro, nombreArchivo)
}

export default function MarketingLeads() {
  const { sesion, logout } = useAuth()
  const navigate = useNavigate()
  const usuarioNombre = sesion?.nombre || 'Marketing'
  function salir() { logout(); navigate('/login') }

  const [marketingVista, setMarketingVista] = useState('ventas')
  const [ordenCampanas, setOrdenCampanas] = useState('total')
  const [marketingFiltros, setMarketingFiltros] = useState({ desde:fechaHoy(), hasta:fechaHoy(), campana:'', tipificacion:'' })
  const [marketingData, setMarketingData] = useState([])
  const [marketingCatalogos, setMarketingCatalogos] = useState({ campanas:[], tipificaciones:[] })
  const [marketingCarga, setMarketingCarga] = useState({ cargando:false, error:'' })
  // Mismo dashboard, pero para las campañas de Reclutamiento (leads_reclutamiento)
  const [marketingReclFiltros, setMarketingReclFiltros] = useState({ desde:fechaHoy(), hasta:fechaHoy(), campana:'', tipificacion:'' })
  const [marketingReclData, setMarketingReclData] = useState([])
  const [marketingReclCatalogos, setMarketingReclCatalogos] = useState({ campanas:[], tipificaciones:[] })
  const [marketingReclCarga, setMarketingReclCarga] = useState({ cargando:false, error:'' })

  const cargarMarketing = useCallback(async (filtros = marketingFiltros) => {
    setMarketingCarga({ cargando:true, error:'' })
    try {
      const qs = new URLSearchParams()
      Object.entries(filtros).forEach(([k,v]) => { if (v) qs.set(k,v) })
      const res = await fetch(`${API}/leads/marketing-resumen?${qs}`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el dashboard')
      setMarketingData(Array.isArray(data.data) ? data.data : [])
      setMarketingCatalogos({
        campanas:Array.isArray(data.filtros?.campanas) ? data.filtros.campanas : [],
        tipificaciones:Array.isArray(data.filtros?.tipificaciones) ? data.filtros.tipificaciones : [],
      })
      setMarketingCarga({ cargando:false, error:'' })
    } catch (error) {
      setMarketingCarga({ cargando:false, error:error.message || 'Error de conexión' })
    }
  }, [marketingFiltros])

  const cargarMarketingRecl = useCallback(async (filtros = marketingReclFiltros) => {
    setMarketingReclCarga({ cargando:true, error:'' })
    try {
      const qs = new URLSearchParams()
      Object.entries(filtros).forEach(([k,v]) => { if (v) qs.set(k,v) })
      const res = await fetch(`${API}/leads-reclutamiento/marketing-resumen?${qs}`, { headers:ncHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.mensaje || 'No se pudo cargar el dashboard')
      setMarketingReclData(Array.isArray(data.data) ? data.data : [])
      setMarketingReclCatalogos({
        campanas:Array.isArray(data.filtros?.campanas) ? data.filtros.campanas : [],
        tipificaciones:Array.isArray(data.filtros?.tipificaciones) ? data.filtros.tipificaciones : [],
      })
      setMarketingReclCarga({ cargando:false, error:'' })
    } catch (error) {
      setMarketingReclCarga({ cargando:false, error:error.message || 'Error de conexión' })
    }
  }, [marketingReclFiltros])

  useEffect(() => { cargarMarketing(); cargarMarketingRecl() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Una venta cerrada, en cualquiera de sus 3 estados posteriores, sigue
  // siendo una venta: VENTA CERRADA (recien cerrada), INSTALADO (se completo)
  // o VENTA CAIDA (se cayo despues) — las 3 cuentan para el total de ventas.
  const TIPIF_CONJUNTO_VENTA = new Set(['VENTA CERRADA','VENTA CAIDA','INSTALADO'])
  const resumenMarketing = useMemo(() => {
    const porCampana = new Map()
    let total = 0, sinTipificar = 0
    marketingData.forEach(fila => {
      const cantidad = Number(fila.cantidad || 0)
      total += cantidad
      if (fila.tipificacion === 'SIN TIPIFICAR') sinTipificar += cantidad
      const actual = porCampana.get(fila.campana) || { campana:fila.campana, total:0, ventas:0, instaladas:0, tipificaciones:[] }
      actual.total += cantidad
      const tipificacion = String(fila.tipificacion||'').trim().toUpperCase()
      if (TIPIF_CONJUNTO_VENTA.has(tipificacion)) actual.ventas += cantidad
      if (tipificacion === 'INSTALADO') actual.instaladas += cantidad
      actual.tipificaciones.push({ nombre:fila.tipificacion, cantidad })
      porCampana.set(fila.campana, actual)
    })
    const campanas = [...porCampana.values()].sort((a,b) => {
      if (ordenCampanas === 'instaladas') return b.instaladas-a.instaladas || b.ventas-a.ventas || b.total-a.total || a.campana.localeCompare(b.campana,'es')
      if (ordenCampanas === 'ventas') return b.ventas-a.ventas || b.total-a.total || a.campana.localeCompare(b.campana,'es')
      return b.total-a.total || a.campana.localeCompare(b.campana,'es')
    })
    return { total, sinTipificar, tipificados:total-sinTipificar, campanas, max:Math.max(1,...campanas.map(c=>c.total)), maxVentas:Math.max(1,...campanas.map(c=>c.ventas)), maxInstaladas:Math.max(1,...campanas.map(c=>c.instaladas)) }
  }, [marketingData, ordenCampanas])

  function exportarMarketingExcel() {
    descargarExcel(marketingData, [
      ['Campaña', f=>f.campana],
      ['Tipificación', f=>f.tipificacion],
      ['Leads', f=>Number(f.cantidad || 0)],
      ['Primera alta', f=>f.primera_alta || ''],
      ['Última alta', f=>f.ultima_alta || ''],
    ], `leads-marketing-${fechaHoy()}.xlsx`)
  }

  const resumenMarketingRecl = useMemo(() => {
    const porCampana = new Map()
    let total = 0, sinTipificar = 0
    marketingReclData.forEach(fila => {
      const cantidad = Number(fila.cantidad || 0)
      total += cantidad
      if (fila.tipificacion === 'SIN TIPIFICAR') sinTipificar += cantidad
      const actual = porCampana.get(fila.campana) || { campana:fila.campana, total:0, ventas:0, tipificaciones:[] }
      actual.total += cantidad
      // En Reclutamiento "venta" equivale a Acepta propuesta (VENTA CERRADA en tipif_vend).
      if (String(fila.tipificacion||'').trim().toUpperCase() === 'VENTA CERRADA') actual.ventas += cantidad
      actual.tipificaciones.push({ nombre:fila.tipificacion, cantidad })
      porCampana.set(fila.campana, actual)
    })
    const campanas = [...porCampana.values()].sort((a,b) => ordenCampanas==='ventas'
      ? (b.ventas-a.ventas || b.total-a.total || a.campana.localeCompare(b.campana,'es'))
      : (b.total-a.total || a.campana.localeCompare(b.campana,'es')))
    return { total, sinTipificar, tipificados:total-sinTipificar, campanas, max:Math.max(1,...campanas.map(c=>c.total)), maxVentas:Math.max(1,...campanas.map(c=>c.ventas)) }
  }, [marketingReclData, ordenCampanas])

  function exportarMarketingReclExcel() {
    descargarExcel(marketingReclData, [
      ['Campaña', f=>f.campana],
      ['Tipificación', f=>f.tipificacion],
      ['Leads', f=>Number(f.cantidad || 0)],
      ['Primera alta', f=>f.primera_alta || ''],
      ['Última alta', f=>f.ultima_alta || ''],
    ], `leads-marketing-reclutamiento-${fechaHoy()}.xlsx`)
  }

  return (
    <div className="jef-root">
      <div className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <div className="logo-circle"><img src="/assets/logo-futura.png" alt="NC" onError={e=>{e.target.parentNode.textContent='NC'}} /></div>
            <div className="brand-text">
              <img src="/assets/futura-wordmark.png" alt="FUTURA" style={{height:22,width:"auto",display:"block"}} />
              <span className="brand-sub">Marketing · Leads</span>
            </div>
          </div>
        </div>
        <div className="topbar-right">
          <JefaturaViewControls>
            <span className="topbar-badge">MARKETING</span>
            <span className="topbar-user">{usuarioNombre}</span>
          </JefaturaViewControls>
          <CambiarAreaMenu />
          <button className="topbar-salir" onClick={salir}>Salir</button>
        </div>
      </div>

      <div className="app-layout">
        <main className="main">
          <section className="section active">
            <div className="sec-header">
              <div><h2>Dashboard de Leads por Campaña</h2><p>Información de altas y resultados para las áreas de Marketing y Reclutamiento</p></div>
              <div style={{display:'flex',gap:8}}>
                {marketingVista==='ventas'
                  ? <button className="btn-nuevo" style={{background:'#0f766e'}} onClick={exportarMarketingExcel} disabled={!marketingData.length}>Exportar Excel</button>
                  : <button className="btn-nuevo" style={{background:'#0f766e'}} onClick={exportarMarketingReclExcel} disabled={!marketingReclData.length}>Exportar Excel</button>}
                {marketingVista==='ventas'
                  ? <button className="btn-nuevo" onClick={()=>cargarMarketing(marketingFiltros)}>Actualizar</button>
                  : <button className="btn-nuevo" onClick={()=>cargarMarketingRecl(marketingReclFiltros)}>Actualizar</button>}
              </div>
            </div>

            <div className="nav-tabs" style={{display:'flex',gap:8,marginBottom:14}}>
              <button type="button" className={`btn-nuevo${marketingVista==='ventas'?'':' btn-tab-inactivo'}`}
                style={marketingVista==='ventas'?{}:{background:'#e5e7eb',color:'#374151'}}
                onClick={()=>setMarketingVista('ventas')}>Ventas</button>
              <button type="button" className={`btn-nuevo${marketingVista==='reclutamiento'?'':' btn-tab-inactivo'}`}
                style={marketingVista==='reclutamiento'?{}:{background:'#e5e7eb',color:'#374151'}}
                onClick={()=>setMarketingVista('reclutamiento')}>Reclutamiento</button>
            </div>

            {marketingVista==='ventas' && <>
            <div className="filtros-avanzados marketing-filtros">
              <div className="filtros-titulo">Filtros del reporte</div>
              <div className="filtros-grid">
                <label><span>Rango de fechas</span><RangoFechasPicker desde={marketingFiltros.desde} hasta={marketingFiltros.hasta} onChange={v=>setMarketingFiltros(p=>({...p,...v}))} /></label>
                <label><span>Campaña</span><select value={marketingFiltros.campana} onChange={e=>setMarketingFiltros(p=>({...p,campana:e.target.value}))}><option value="">Todas las campañas</option>{marketingCatalogos.campanas.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
                <label><span>Tipificación</span><select value={marketingFiltros.tipificacion} onChange={e=>setMarketingFiltros(p=>({...p,tipificacion:e.target.value}))}><option value="">Todas las tipificaciones</option>{TIPIF_VEND_VENTAS_ACTUALES.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
                <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>setMarketingFiltros({desde:'',hasta:'',campana:'',tipificacion:''})}>Limpiar</button>
              </div>
            </div>

            {marketingCarga.error && <div className="marketing-error">{marketingCarga.error}</div>}
            <div className="kpi-grid marketing-kpis">
              <div className="kpi-card k-blue"><div className="kpi-num">{resumenMarketing.total}</div><div className="kpi-label">Total de leads</div><div className="kpi-sub">según filtros</div></div>
              <div className="kpi-card k-purple"><div className="kpi-num">{resumenMarketing.campanas.length}</div><div className="kpi-label">Campañas</div><div className="kpi-sub">con registros</div></div>
              <div className="kpi-card k-green"><div className="kpi-num">{resumenMarketing.tipificados}</div><div className="kpi-label">Tipificados</div><div className="kpi-sub">con resultado</div></div>
              <div className="kpi-card k-yellow"><div className="kpi-num">{resumenMarketing.sinTipificar}</div><div className="kpi-label">Sin tipificar</div><div className="kpi-sub">pendientes</div></div>
            </div>

            <div className="marketing-grid">
              <div className="chart-card marketing-ranking">
                <div className="chart-title-row">
                  <span>Volumen de leads por campaña</span>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{display:'flex',gap:2}}>
                      <button type="button" onClick={()=>setOrdenCampanas('total')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='total'?'#0f172a':'#fff',color:ordenCampanas==='total'?'#fff':'#374151',cursor:'pointer'}}>Leads</button>
                      <button type="button" onClick={()=>setOrdenCampanas('ventas')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='ventas'?'#0f172a':'#fff',color:ordenCampanas==='ventas'?'#fff':'#374151',cursor:'pointer'}}>Ventas</button>
                      <button type="button" onClick={()=>setOrdenCampanas('instaladas')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='instaladas'?'#0f172a':'#fff',color:ordenCampanas==='instaladas'?'#fff':'#374151',cursor:'pointer'}}>Instaladas</button>
                    </div>
                    {marketingCarga.cargando&&<small>Actualizando…</small>}
                  </div>
                </div>
                <div className="marketing-barras">
                  {resumenMarketing.campanas.length===0 && !marketingCarga.cargando
                    ? <div className="marketing-vacio">No hay leads para los filtros seleccionados.</div>
                    : resumenMarketing.campanas.map((c,i)=><div className="marketing-barra" key={c.campana}>
                        <div className="marketing-barra-top"><strong>{c.campana}</strong><span>{c.total} leads</span></div>
                        <div className="marketing-barra-track"><i style={{width:`${Math.max(3,c.total/resumenMarketing.max*100)}%`,background:['#2563eb','#7c3aed','#0f766e','#ea580c','#db2777'][i%5]}} /></div>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                          <div style={{flex:1,height:3,borderRadius:99,background:'#eef2f7',overflow:'hidden'}}><i style={{display:'block',height:'100%',borderRadius:99,width:`${Math.max(3,c.ventas/resumenMarketing.maxVentas*100)}%`,background:'#86efac'}} /></div>
                          <span style={{fontSize:9,color:'#94a3b8',fontWeight:600,flexShrink:0}}>{c.ventas} venta{c.ventas===1?'':'s'}</span>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                          <div style={{flex:1,height:3,borderRadius:99,background:'#eef2f7',overflow:'hidden'}}><i style={{display:'block',height:'100%',borderRadius:99,width:c.instaladas?`${Math.max(3,c.instaladas/resumenMarketing.maxInstaladas*100)}%`:'0%',background:'#38bdf8'}} /></div>
                          <span style={{fontSize:9,color:'#0284c7',fontWeight:700,flexShrink:0}}>{c.instaladas} instalada{c.instaladas===1?'':'s'}</span>
                        </div>
                      </div>)}
                </div>
              </div>

              <div className="tabla-wrap marketing-tabla-card">
                <div className="tabla-header"><span className="tabla-title">Detalle para Marketing</span><span className="tabla-count">{marketingData.length} grupos</span></div>
                <div style={{overflowX:'auto'}}><table className="tabla marketing-tabla">
                  <thead><tr><th>Campaña</th><th>Tipificación</th><th>Leads</th><th>Primera alta</th><th>Última alta</th></tr></thead>
                  <tbody>{marketingData.length===0
                    ? <tr><td colSpan="5" className="tabla-empty">{marketingCarga.cargando?'Cargando información…':'Sin resultados.'}</td></tr>
                    : marketingData.map((f,i)=><tr key={`${f.campana}-${f.tipificacion}-${i}`}><td><strong>{f.campana}</strong></td><td><span className="marketing-tipif">{f.tipificacion}</span></td><td><strong>{f.cantidad}</strong></td><td>{f.primera_alta?new Date(f.primera_alta).toLocaleString('es-PE',{timeZone:'America/Lima'}):'—'}</td><td>{f.ultima_alta?new Date(f.ultima_alta).toLocaleString('es-PE',{timeZone:'America/Lima'}):'—'}</td></tr>)}</tbody>
                </table></div>
              </div>
            </div>
            </>}

            {marketingVista==='reclutamiento' && <>
            <div className="filtros-avanzados marketing-filtros">
              <div className="filtros-titulo">Filtros del reporte</div>
              <div className="filtros-grid">
                <label><span>Rango de fechas</span><RangoFechasPicker desde={marketingReclFiltros.desde} hasta={marketingReclFiltros.hasta} onChange={v=>setMarketingReclFiltros(p=>({...p,...v}))} /></label>
                <label><span>Campaña</span><select value={marketingReclFiltros.campana} onChange={e=>setMarketingReclFiltros(p=>({...p,campana:e.target.value}))}><option value="">Todas las campañas</option>{marketingReclCatalogos.campanas.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
                <label><span>Tipificación</span><select value={marketingReclFiltros.tipificacion} onChange={e=>setMarketingReclFiltros(p=>({...p,tipificacion:e.target.value}))}><option value="">Todas las tipificaciones</option>{marketingReclCatalogos.tipificaciones.map(v=><option key={v} value={v}>{labelTipifVendRecl(v)}</option>)}</select></label>
                <button type="button" className="flujo-clear filtro-limpiar" onClick={()=>setMarketingReclFiltros({desde:'',hasta:'',campana:'',tipificacion:''})}>Limpiar</button>
              </div>
            </div>

            {marketingReclCarga.error && <div className="marketing-error">{marketingReclCarga.error}</div>}
            <div className="kpi-grid marketing-kpis">
              <div className="kpi-card k-blue"><div className="kpi-num">{resumenMarketingRecl.total}</div><div className="kpi-label">Total de leads</div><div className="kpi-sub">según filtros</div></div>
              <div className="kpi-card k-purple"><div className="kpi-num">{resumenMarketingRecl.campanas.length}</div><div className="kpi-label">Campañas</div><div className="kpi-sub">con registros</div></div>
              <div className="kpi-card k-green"><div className="kpi-num">{resumenMarketingRecl.tipificados}</div><div className="kpi-label">Tipificados</div><div className="kpi-sub">con resultado</div></div>
              <div className="kpi-card k-yellow"><div className="kpi-num">{resumenMarketingRecl.sinTipificar}</div><div className="kpi-label">Sin tipificar</div><div className="kpi-sub">pendientes</div></div>
            </div>

            <div className="marketing-grid">
              <div className="chart-card marketing-ranking">
                <div className="chart-title-row">
                  <span>Volumen de leads por campaña</span>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{display:'flex',gap:2}}>
                      <button type="button" onClick={()=>setOrdenCampanas('total')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='total'?'#0f172a':'#fff',color:ordenCampanas==='total'?'#fff':'#374151',cursor:'pointer'}}>Leads</button>
                      <button type="button" onClick={()=>setOrdenCampanas('ventas')} style={{fontSize:10,fontWeight:700,padding:'3px 9px',borderRadius:6,border:'1px solid #e5e7eb',background:ordenCampanas==='ventas'?'#0f172a':'#fff',color:ordenCampanas==='ventas'?'#fff':'#374151',cursor:'pointer'}}>Ventas</button>
                    </div>
                    {marketingReclCarga.cargando&&<small>Actualizando…</small>}
                  </div>
                </div>
                <div className="marketing-barras">
                  {resumenMarketingRecl.campanas.length===0 && !marketingReclCarga.cargando
                    ? <div className="marketing-vacio">No hay leads para los filtros seleccionados.</div>
                    : resumenMarketingRecl.campanas.map((c,i)=><div className="marketing-barra" key={c.campana}>
                        <div className="marketing-barra-top"><strong>{c.campana}</strong><span>{c.total} leads</span></div>
                        <div className="marketing-barra-track"><i style={{width:`${Math.max(3,c.total/resumenMarketingRecl.max*100)}%`,background:['#2563eb','#7c3aed','#0f766e','#ea580c','#db2777'][i%5]}} /></div>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginTop:4}}>
                          <div style={{flex:1,height:3,borderRadius:99,background:'#eef2f7',overflow:'hidden'}}><i style={{display:'block',height:'100%',borderRadius:99,width:`${Math.max(3,c.ventas/resumenMarketingRecl.maxVentas*100)}%`,background:'#86efac'}} /></div>
                          <span style={{fontSize:9,color:'#94a3b8',fontWeight:600,flexShrink:0}}>{c.ventas} acepta{c.ventas===1?'':'n'} propuesta</span>
                        </div>
                      </div>)}
                </div>
              </div>

              <div className="tabla-wrap marketing-tabla-card">
                <div className="tabla-header"><span className="tabla-title">Detalle para Reclutamiento</span><span className="tabla-count">{marketingReclData.length} grupos</span></div>
                <div style={{overflowX:'auto'}}><table className="tabla marketing-tabla">
                  <thead><tr><th>Campaña</th><th>Tipificación</th><th>Leads</th><th>Primera alta</th><th>Última alta</th></tr></thead>
                  <tbody>{marketingReclData.length===0
                    ? <tr><td colSpan="5" className="tabla-empty">{marketingReclCarga.cargando?'Cargando información…':'Sin resultados.'}</td></tr>
                    : marketingReclData.map((f,i)=><tr key={`${f.campana}-${f.tipificacion}-${i}`}><td><strong>{f.campana}</strong></td><td><span className="marketing-tipif">{labelTipifVendRecl(f.tipificacion)}</span></td><td><strong>{f.cantidad}</strong></td><td>{f.primera_alta?new Date(f.primera_alta).toLocaleString('es-PE',{timeZone:'America/Lima'}):'—'}</td><td>{f.ultima_alta?new Date(f.ultima_alta).toLocaleString('es-PE',{timeZone:'America/Lima'}):'—'}</td></tr>)}</tbody>
                </table></div>
              </div>
            </div>
            </>}
          </section>
        </main>
      </div>
    </div>
  )
}
