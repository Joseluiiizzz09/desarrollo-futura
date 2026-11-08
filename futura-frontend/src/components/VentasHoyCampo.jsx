import { useEffect, useMemo, useState } from 'react'
import { API, ncHeaders } from '../services/api'

// Cuadro "Ventas del día — Campo" agrupado por la jerarquía de Grupo Futura:
// Jefe Comercial → (clic) Jefes de Área → (clic) Supervisores (equipos).
// `filas`: [{ sala, label, n }] de los equipos con ventas Claro; `total`.
const SIN_JEFE = 'SIN JEFE ASIGNADO'

export default function VentasHoyCampo({ filas, total }) {
  const [jerarquia, setJerarquia] = useState([])
  const [abiertos, setAbiertos] = useState(() => new Set())

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
      if (!jefes.has(jefe)) jefes.set(jefe, { nombre: jefe, n: 0, areas: new Map() })
      const j = jefes.get(jefe)
      j.n += f.n
      if (!j.areas.has(area)) j.areas.set(area, { nombre: area, n: 0, equipos: [] })
      const a = j.areas.get(area)
      a.n += f.n
      a.equipos.push(f)
    }
    const orden = (x, y) => (y.n - x.n) || x.nombre.localeCompare(y.nombre, 'es')
    return [...jefes.values()]
      .sort((x, y) => (x.nombre === SIN_JEFE) - (y.nombre === SIN_JEFE) || orden(x, y))
      .map(j => ({ ...j, areas: [...j.areas.values()].sort((x, y) => (!x.nombre) - (!y.nombre) || orden(x, y))
        .map(a => ({ ...a, equipos: [...a.equipos].sort((x, y) => (y.n - x.n) || x.label.localeCompare(y.label, 'es')) })) }))
  }, [filas, jerarquia])

  const alternar = clave => setAbiertos(prev => {
    const s = new Set(prev)
    s.has(clave) ? s.delete(clave) : s.add(clave)
    return s
  })

  const fila = (clave, nivel, texto, n, desplegable, abierto, rol) => (
    <tr key={clave} className={`vhc-n${nivel}${desplegable ? ' vhc-click' : ''}`} onClick={desplegable ? () => alternar(clave) : undefined}>
      <td title={texto}>
        <span style={{ paddingLeft: nivel * 18 }}>
          {desplegable ? <span className="vhc-flecha">{abierto ? '▾' : '▸'}</span> : <span className="vhc-punto">•</span>}
          {rol && <span className="vhc-rol">{rol}</span>}{texto}
        </span>
      </td>
      <td>{n}</td>
    </tr>
  )

  const filasTabla = []
  for (const j of arbol) {
    const kj = `j:${j.nombre}`
    const abiertoJ = abiertos.has(kj)
    filasTabla.push(fila(kj, 0, j.nombre, j.n, true, abiertoJ, j.nombre === SIN_JEFE ? '' : 'JEFE'))
    if (!abiertoJ) continue
    for (const a of j.areas) {
      if (!a.nombre) {
        // Supervisores que reportan directo al Jefe (sin Jefe de Área)
        a.equipos.forEach(f => filasTabla.push(fila(`${kj}|e:${f.sala}`, 1, f.label, f.n, false)))
        continue
      }
      const ka = `${kj}|a:${a.nombre}`
      const abiertoA = abiertos.has(ka)
      filasTabla.push(fila(ka, 1, a.nombre, a.n, true, abiertoA, 'SUB JEFE'))
      if (abiertoA) a.equipos.forEach(f => filasTabla.push(fila(`${ka}|e:${f.sala}`, 2, f.label, f.n, false)))
    }
  }

  return (
    <div className="ventas-hoy-card">
      <div className="ventas-hoy-head"><span>Ventas del día — Campo</span><small>ingresadas hoy · clic para desglosar</small></div>
      <table className="ventas-hoy-tabla">
        <tbody>
          {filasTabla}
          {filasTabla.length === 0 && <tr><td colSpan="2" className="ventas-hoy-vacio">Sin equipos</td></tr>}
        </tbody>
        <tfoot><tr><td>Total</td><td>{total}</td></tr></tfoot>
      </table>
    </div>
  )
}
