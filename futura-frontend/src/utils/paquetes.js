import { useEffect, useMemo, useState } from 'react'
import { API, ncHeaders } from '../services/api'

// ── Paquetes por plan ────────────────────────────────────────────────────
// La lista real vive en la base de datos (Usuarios → Paquetes, /api/paquetes)
// y se lee con usePaquetesPorPlan(). La de abajo es solo el RESPALDO mientras
// carga o si la API no responde. Los planes son fijos; lo editable son los
// paquetes de cada plan.
export const PAQUETES_POR_PLAN = {
  '1 PLAY': ['150 MBPS S/70.00','300 MBPS S/75.00','800 MBPS S/100.00','1500 MBPS S/200.00','PROM ENTRADA 200 X 12 M 400 MBPS X 6M 39.5','PROM GRANDE 1000 MBPS X 6M 59.9','PROM GRANDE 850 X 12M 1000 MBPS X 4M 55','PROM LIM/ARQ 400 X 12 M 1000 MBPS X 2 M 1 SOL','PROM MEDIANA 400 X 12M 1000 MBPS X 6M 55','REG PRO 1000 MBPS','REG PRO 500 MBPS'],
  '2 PLAY INTERNET + TELEFONO': ['150 MBPS S/70.00','1000 MBPS S/150.00','1500 MBPS S/205.00','300 MBPS S/80.00','300 MPBS 84.00','400 MBPS 94.00 S','400 MBPS S/90.00','800 MBPS S/105.00'],
  '2 PLAY INTERNET + CABLE ESTANDAR': ['1000 MBPS S/230.00','150 MBPS S/150.00','1500 MBPS S/285.00','300 MBPS S/160.00','400 MBPS S/170.00','800 MBPS S/185.00'],
  '2 PLAY INTERNET + CABLE SUPERIOR': ['1000 MBPS S/270.00','150 MBPS S/190.00','1500 MBPS S/325.00','300 MBPS S/200.00','400 MBPS S/210.00','800 MBPS S/225.00'],
  '3 PLAY ESTANDAR': ['1000 MBPS S/235.00','150 MBPS S/155.00','1500 MBPS S/290.00','300 MBPS S/165.00','400 MBPS S/175.00','800 MBPS S/190.00'],
  '3 PLAY SUPERIOR': ['1000 MBPS S/275.00','150 MBPS S/195.00','1500 MBPS S/330.00','300 MBPS S/205.00','400 MBPS S/215.00','800 MBPS S/230.00'],
}
export const PLANES = Object.keys(PAQUETES_POR_PLAN)

// ── Catálogo compartido (se pide una vez y se reparte a todos) ──
let catalogoCache = null        // filas crudas de /api/paquetes
let catalogoPromesa = null
const suscriptores = new Set()

function avisar() { for (const fn of suscriptores) fn(catalogoCache) }

export function recargarPaquetes() {
  catalogoPromesa = fetch(`${API}/paquetes`, { headers: ncHeaders() })
    .then(r => r.json())
    .then(d => { if (d?.ok && Array.isArray(d.data)) { catalogoCache = d.data; avisar() } return catalogoCache })
    .catch(() => catalogoCache)
  return catalogoPromesa
}

export function fijarCatalogoPaquetes(filas) {
  if (Array.isArray(filas)) { catalogoCache = filas; avisar() }
}

// Filas crudas del catálogo (para la pantalla de administración)
export function useCatalogoPaquetes() {
  const [filas, setFilas] = useState(catalogoCache)
  useEffect(() => {
    suscriptores.add(setFilas)
    if (!catalogoCache && !catalogoPromesa) recargarPaquetes()
    else if (catalogoCache) setFilas(catalogoCache)
    return () => { suscriptores.delete(setFilas) }
  }, [])
  return filas
}

// Filas -> { '1 PLAY': [nombres activos en orden], ... } con todos los planes
function porPlan(filas) {
  if (!Array.isArray(filas) || !filas.length) return PAQUETES_POR_PLAN
  const out = Object.fromEntries(PLANES.map(plan => [plan, []]))
  for (const p of [...filas].sort((a, b) => (a.orden - b.orden) || (a.id - b.id))) {
    if (p.activo && out[p.plan]) out[p.plan].push(p.nombre)
  }
  return out
}

// Paquetes activos por plan, para el formulario de venta
export function usePaquetesPorPlan() {
  const filas = useCatalogoPaquetes()
  return useMemo(() => porPlan(filas), [filas])
}
