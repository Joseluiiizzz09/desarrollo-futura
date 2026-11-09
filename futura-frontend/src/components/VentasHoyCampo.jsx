import { useEffect, useMemo, useState } from 'react'
import { API, ncHeaders } from '../services/api'

// Cuadro "Ventas del día — Campo" agrupado por la jerarquía de Grupo Futura:
// Jefe Comercial → (clic) Jefes de Área → (clic) Supervisores (equipos).
// `filas`: [{ sala, label, n }] de los equipos con ventas Claro; `total`.
const SIN_JEFE = 'SIN JEFE ASIGNADO'

// `onFoco({ nombre, grupos:[{label, salas}], asesoresDe })`: el nivel elegido,
// para que los gráficos del Dashboard muestren el mismo desglose.
export default function VentasHoyCampo({ datos, titulo = 'Ventas del día — Campo', subtitulo = 'ingresadas hoy', onFoco }) {
  const { filas, total, totH = 0, totV = 0 } = datos
  const [jerarquia, setJerarquia] = useState([])
  const [abiertos, setAbiertos] = useState(() => new Set())
  const [foco, setFoco] = useState(null)

  useEffect(() => {
    let vivo = true
    fetch(`${API}/ventas/equipos-campo`, { headers: ncHeaders() })
      .then(r => r.json()).then(d => { if (vivo && d.ok) setJerarquia(d.equipos || []) })
      .catch(() => {})
    return () => { vivo = false }
  }, [])

  const arbol = useMemo(() => {
    const porEquipo = new Map(jerarquia.map(e => [String(e.equipo || '').toUpperCase(), e]))
    const jefes = new Map()
    for (const f of filas) {
      const e = porEquipo.get(String(f.label || '').toUpperCase()) || porEquipo.get(String(f.sala || '').toUpperCase())
      const jefe = e?.jefe_comercial?.nombre || SIN_JEFE
      const area = e?.jefe_area?.nombre || ''
      if (!jefes.has(jefe)) jefes.set(jefe, { nombre: jefe, n: 0, h: 0, vt: 0, areas: new Map() })
      const j = jefes.get(jefe)
      j.n += f.n; j.h += f.h || 0; j.vt += f.vt || 0
      if (!j.areas.has(area)) j.areas.set(area, { nombre: area, n: 0, h: 0, vt: 0, equipos: [] })
      const a = j.areas.get(area)
      a.n += f.n; a.h += f.h || 0; a.vt += f.vt || 0
      a.equipos.push(f)
    }
    const orden = (x, y) => (y.n - x.n) || x.nombre.localeCompare(y.nombre, 'es')
    return [...jefes.values()]
      .sort((x, y) => (x.nombre === SIN_JEFE) - (y.nombre === SIN_JEFE) || orden(x, y))
      .map(j => ({ ...j, areas: [...j.areas.values()].sort((x, y) => (!x.nombre) - (!y.nombre) || orden(x, y))
        .map(a => ({ ...a, equipos: [...a.equipos].sort((x, y) => (y.n - x.n) || x.label.localeCompare(y.label, 'es')) })) }))
  }, [filas, jerarquia])

  // Cada nodo del árbol: sus salas (equipos), su padre y sus hijos
  const nodos = useMemo(() => {
    const m = new Map()
    for (const j of arbol) {
      const kj = `j:${j.nombre}`
      const hijosJ = []
      for (const a of j.areas) {
        if (!a.nombre) {
          a.equipos.forEach(f => {
            m.set(`${kj}|e:${f.sala}`, { nombre: f.label, salas: [f.sala], padre: kj, equipo: true })
            hijosJ.push({ label: f.label, salas: [f.sala] })
          })
          continue
        }
        const ka = `${kj}|a:${a.nombre}`
        a.equipos.forEach(f => m.set(`${ka}|e:${f.sala}`, { nombre: f.label, salas: [f.sala], padre: ka, equipo: true }))
        const salasA = a.equipos.map(f => f.sala)
        m.set(ka, { nombre: a.nombre, salas: salasA, padre: kj, hijos: a.equipos.map(f => ({ label: f.label, salas: [f.sala] })) })
        hijosJ.push({ label: a.nombre, salas: salasA })
      }
      m.set(kj, { nombre: j.nombre, salas: hijosJ.flatMap(h => h.salas), padre: null, hijos: hijosJ })
    }
    return m
  }, [arbol])

  useEffect(() => {
    if (!onFoco) return
    const n = foco && nodos.get(foco)
    if (!n) onFoco({ nombre: '', grupos: arbol.map(j => ({ label: j.nombre, salas: nodos.get(`j:${j.nombre}`)?.salas || [] })), asesoresDe: null })
    else if (n.equipo) onFoco({ nombre: n.nombre, grupos: [], asesoresDe: n.salas })
    else onFoco({ nombre: n.nombre, grupos: n.hijos, asesoresDe: null })
  }, [foco, nodos, arbol, onFoco])

  // Clic: abre/cierra el nivel y lo deja elegido para los gráficos
  const alternar = (clave, desplegable) => {
    const padre = nodos.get(clave)?.padre ?? null
    if (!desplegable) { setFoco(f => f === clave ? padre : clave); return }
    const abierto = abiertos.has(clave)
    setAbiertos(prev => {
      const s = new Set(prev)
      abierto ? s.delete(clave) : s.add(clave)
      return s
    })
    setFoco(f => abierto ? ((f && (f === clave || f.startsWith(`${clave}|`))) ? padre : f) : clave)
  }

  const fila = (clave, nivel, texto, c, desplegable, abierto, rol) => (
    <tr key={clave} className={`vhc-n${nivel} vhc-click${foco === clave ? ' vhc-foco' : ''}`} onClick={() => alternar(clave, desplegable)}>
      <td title={texto}>
        <span style={{ paddingLeft: nivel * 18 }}>
          {desplegable ? <span className="vhc-flecha">{abierto ? '▾' : '▸'}</span> : <span className="vhc-punto">•</span>}
          {rol && <span className="vhc-rol">{rol}</span>}{texto}
        </span>
      </td>
      <td>{c.h || 0}</td><td>{c.vt || 0}</td><td>{c.n}</td>
    </tr>
  )

  const filasTabla = []
  for (const j of arbol) {
    const kj = `j:${j.nombre}`
    const abiertoJ = abiertos.has(kj)
    filasTabla.push(fila(kj, 0, j.nombre, j, true, abiertoJ, j.nombre === SIN_JEFE ? '' : 'JEFE'))
    if (!abiertoJ) continue
    for (const a of j.areas) {
      if (!a.nombre) {
        // Supervisores que reportan directo al Jefe (sin Jefe de Área)
        a.equipos.forEach(f => filasTabla.push(fila(`${kj}|e:${f.sala}`, 1, f.label, f, false)))
        continue
      }
      const ka = `${kj}|a:${a.nombre}`
      const abiertoA = abiertos.has(ka)
      filasTabla.push(fila(ka, 1, a.nombre, a, true, abiertoA, 'SUB JEFE'))
      if (abiertoA) a.equipos.forEach(f => filasTabla.push(fila(`${ka}|e:${f.sala}`, 2, f.label, f, false)))
    }
  }

  return (
    <div className="ventas-hoy-card">
      <div className="ventas-hoy-head"><span>{titulo}</span><small>{subtitulo} · clic para desglosar (los gráficos siguen la selección)</small></div>
      <table className="ventas-hoy-tabla vh-hv">
        <thead><tr><th>Equipo</th><th title="Horizontal">Horiz.</th><th title="Vertical">Vert.</th><th>Total</th></tr></thead>
        <tbody>
          {filasTabla}
          {filasTabla.length === 0 && <tr><td colSpan="4" className="ventas-hoy-vacio">Sin equipos</td></tr>}
        </tbody>
        <tfoot><tr><td>Total</td><td>{totH}</td><td>{totV}</td><td>{total}</td></tr></tfoot>
      </table>
    </div>
  )
}
