import { useEffect, useState } from 'react'
import { API, ncHeaders } from '../services/api'

// ── Campañas ─────────────────────────────────────────────────────────────
// La lista real vive en la base de datos (Usuarios → Campañas, /api/campanas)
// y se lee con useCampanas() / useCampanasReclutamiento(). Las listas de abajo
// son solo el RESPALDO mientras carga o si la API no responde.

// Back Data (leads): formulario de registro individual y carga masiva
export const CAMPANAS = [
  'A - SCW',
  'ADRI',
  'KEV',
  'EMER',
  'E1',
  'E2',
  'E3',
  'E4',
  'E5',
  'F2',
  'F3',
  'FABIAN',
  'GOOGLE',
  'GUSTAVO',
  'H1',
  'H4',
  'H5',
  'H7',
  'K1',
  'K2',
  'K3',
  'K6',
  'K8',
  'K9',
  'LEAD CRM',
  'M1',
  'M2',
  'M3',
  'M4',
  'MACETA',
  'MATEO',
  'MESSENGER',
  'NICOLE',
  'NX03',
  'NX04',
  'NX7',
  'RAHI',
  'REFERIDO',
  'REFUERZO',
  'YOPI',
  'YURI',
]

// Back Data Reclutamiento: cada campaña con el color de su etiqueta
export const CAMPANAS_RECLUTAMIENTO_RESPALDO = [
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

// ── Catálogo compartido (se pide una vez y se reparte a todos) ──
let catalogoCache = null
let catalogoPromesa = null
const suscriptores = new Set()

function avisar() { for (const fn of suscriptores) fn(catalogoCache) }

export function recargarCampanas() {
  catalogoPromesa = fetch(`${API}/campanas`, { headers: ncHeaders() })
    .then(r => r.json())
    .then(d => { if (d?.ok && Array.isArray(d.data)) { catalogoCache = d.data; avisar() } return catalogoCache })
    .catch(() => catalogoCache)
  return catalogoPromesa
}

export function fijarCatalogoCampanas(filas) {
  if (Array.isArray(filas)) { catalogoCache = filas; avisar() }
}

// Filas crudas del catálogo (para la pantalla de administración)
export function useCatalogoCampanas() {
  const [filas, setFilas] = useState(catalogoCache)
  useEffect(() => {
    suscriptores.add(setFilas)
    if (!catalogoCache && !catalogoPromesa) recargarCampanas()
    else if (catalogoCache) setFilas(catalogoCache)
    return () => { suscriptores.delete(setFilas) }
  }, [])
  return filas
}

function activasDe(filas, tipo) {
  return filas
    .filter(c => c.tipo === tipo && c.activo)
    .sort((a, b) => (a.orden - b.orden) || (a.id - b.id))
}

// Nombres de las campañas activas de Back Data, en orden
export function useCampanas() {
  const filas = useCatalogoCampanas()
  if (!Array.isArray(filas) || !filas.some(c => c.tipo === 'backdata')) return CAMPANAS
  return activasDe(filas, 'backdata').map(c => c.nombre)
}

// Texto legible sobre un fondo: oscuro en fondos claros, blanco en oscuros
export function colorTextoPara(fondo) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(fondo || ''))
  if (!m) return '#ffffff'
  const [r, g, b] = m.slice(1).map(h => parseInt(h, 16))
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#374151' : '#ffffff'
}

// Campañas activas de Reclutamiento como { valor, bg, color, borde }
export function useCampanasReclutamiento() {
  const filas = useCatalogoCampanas()
  if (!Array.isArray(filas) || !filas.some(c => c.tipo === 'reclutamiento')) return CAMPANAS_RECLUTAMIENTO_RESPALDO
  return activasDe(filas, 'reclutamiento').map(c => {
    const bg = c.color_fondo || '#e5e7eb'
    const borde = c.color_borde || (colorTextoPara(bg) !== '#ffffff' && /^#f/i.test(bg) ? '#d1d5db' : undefined)
    return { valor: c.nombre, bg, color: c.color_texto || colorTextoPara(bg), borde }
  })
}
