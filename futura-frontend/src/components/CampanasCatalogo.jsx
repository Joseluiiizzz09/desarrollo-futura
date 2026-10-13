import { useEffect, useRef, useState } from 'react'
import { API, ncHeaders } from '../services/api'
import { useCatalogoCampanas, fijarCatalogoCampanas, recargarCampanas, colorTextoPara } from '../utils/campanas'

// Usuarios → Campañas: edición manual de las campañas de Back Data (leads) y
// de Back Data Reclutamiento. Los registros guardan el nombre como texto, así
// que renombrar o quitar una campaña no cambia leads ya cargados.
const TIPOS = [
  { id: 'backdata',      label: 'Back Data',     color: false },
  { id: 'reclutamiento', label: 'Reclutamiento', color: true  },
]
const COLOR_NUEVA = '#1d4ed8'

const S = {
  card:   { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, minWidth: 0 },
  head:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  title:  { margin: 0, fontSize: 15, fontWeight: 800, color: '#111827' },
  count:  { fontSize: 11, fontWeight: 700, color: '#6b7280' },
  fila:   { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderBottom: '1px solid #f1f5f9' },
  nombre: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  input:  { flex: 1, minWidth: 0, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', textTransform: 'uppercase' },
  badge:  { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' },
  btn:    { border: '1px solid #e5e7eb', background: '#fff', borderRadius: 7, padding: '4px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' },
  btnPri: { border: 'none', background: '#0f172a', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  picker: { width: 34, height: 30, padding: 0, border: '1px solid #d1d5db', borderRadius: 7, cursor: 'pointer', background: '#fff' },
}

function Etiqueta({ nombre, fondo }) {
  const bg = fondo || '#e5e7eb'
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 6, background: bg, color: colorTextoPara(bg),
      border: /^#f/i.test(bg) ? '1px solid #d1d5db' : 'none', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>
      {nombre}
    </span>
  )
}

function Fila({ c, conColor, primero, ultimo, ocupado, onGuardarNombre, onColor, onToggle, onMover, onEliminar }) {
  const [editando, setEditando] = useState(false)
  // Confirmación dentro de la fila (el cuadro nativo de Chrome a veces ignora "Aceptar")
  const [confirmando, setConfirmando] = useState(false)
  const [valor, setValor] = useState(c.nombre)
  // El selector de color avisa en cada movimiento: se guarda solo cuando se
  // deja de mover (sin una petición por cada tono intermedio)
  const [color, setColor] = useState(c.color_fondo || '#e5e7eb')
  const timerColor = useRef(null)
  useEffect(() => { setColor(c.color_fondo || '#e5e7eb') }, [c.color_fondo])
  useEffect(() => () => clearTimeout(timerColor.current), [])
  function elegirColor(nuevo) {
    setColor(nuevo)
    clearTimeout(timerColor.current)
    timerColor.current = setTimeout(() => { if (nuevo !== c.color_fondo) onColor(c, nuevo) }, 500)
  }

  async function guardar() {
    const nuevo = valor.trim().toUpperCase()
    if (!nuevo || nuevo === c.nombre) { setEditando(false); setValor(c.nombre); return }
    if (await onGuardarNombre(c, nuevo)) setEditando(false)
  }

  return (
    <div style={{ ...S.fila, opacity: c.activo ? 1 : 0.5 }}>
      {editando ? (
        <input autoFocus style={S.input} value={valor} maxLength={100}
          onChange={e => setValor(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') { setEditando(false); setValor(c.nombre) } }} />
      ) : (
        <span style={S.nombre} title={c.nombre}>
          {conColor ? <Etiqueta nombre={c.nombre} fondo={color} /> : c.nombre}
        </span>
      )}
      {!c.activo && <span style={{ ...S.badge, background: '#f3f4f6', color: '#6b7280' }}>Inactiva</span>}
      {conColor && !editando && (
        <input type="color" title="Color de la etiqueta" style={S.picker} disabled={ocupado}
          value={color} onChange={e => elegirColor(e.target.value)} />
      )}
      {editando ? (
        <>
          <button style={S.btn} disabled={ocupado} onClick={guardar}>Guardar</button>
          <button style={S.btn} disabled={ocupado} onClick={() => { setEditando(false); setValor(c.nombre) }}>Cancelar</button>
        </>
      ) : confirmando ? (
        <>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', whiteSpace: 'nowrap' }}>¿Eliminar?</span>
          <button style={{ ...S.btn, background: '#b91c1c', color: '#fff', borderColor: '#b91c1c' }} disabled={ocupado}
            onClick={async () => { if (await onEliminar(c)) return; setConfirmando(false) }}>Sí, eliminar</button>
          <button style={S.btn} disabled={ocupado} onClick={() => setConfirmando(false)}>No</button>
        </>
      ) : (
        <>
          <button style={S.btn} title="Subir" disabled={ocupado || primero} onClick={() => onMover(c, 'arriba')}>↑</button>
          <button style={S.btn} title="Bajar" disabled={ocupado || ultimo} onClick={() => onMover(c, 'abajo')}>↓</button>
          <button style={S.btn} disabled={ocupado} onClick={() => { setValor(c.nombre); setEditando(true) }}>Editar</button>
          <button style={S.btn} disabled={ocupado} onClick={() => onToggle(c)}>{c.activo ? 'Desactivar' : 'Activar'}</button>
          <button style={{ ...S.btn, color: '#b91c1c', borderColor: '#fecaca' }} disabled={ocupado} onClick={() => setConfirmando(true)}>Eliminar</button>
        </>
      )}
    </div>
  )
}

export default function CampanasCatalogo({ mostrarToast }) {
  const filas = useCatalogoCampanas()
  const [nuevos, setNuevos] = useState({ backdata: '', reclutamiento: '' })
  const [colorNuevo, setColorNuevo] = useState(COLOR_NUEVA)
  const [ocupado, setOcupado] = useState(false)
  const toast = mostrarToast || (m => window.alert(m))

  async function llamar(url, opciones, okMsg) {
    setOcupado(true)
    try {
      const res = await fetch(`${API}${url}`, { headers: ncHeaders(), ...opciones })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) { toast(data.mensaje || 'No se pudo guardar'); return false }
      fijarCatalogoCampanas(data.data)
      if (okMsg) toast(okMsg)
      return true
    } catch {
      toast('Error conectando al servidor')
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function agregar(tipo) {
    const nombre = nuevos[tipo].trim()
    if (!nombre) return toast('Escribe el nombre de la campaña')
    const body = { tipo, nombre, ...(tipo === 'reclutamiento' ? { color_fondo: colorNuevo, color_texto: colorTextoPara(colorNuevo) } : {}) }
    const ok = await llamar('/campanas', { method: 'POST', body: JSON.stringify(body) }, 'Campaña agregada')
    if (ok) setNuevos(n => ({ ...n, [tipo]: '' }))
  }
  const guardarNombre = (c, nombre) => llamar(`/campanas/${c.id}`, { method: 'PATCH', body: JSON.stringify({ nombre }) }, 'Campaña actualizada')
  const cambiarColor = (c, fondo) => llamar(`/campanas/${c.id}`, { method: 'PATCH', body: JSON.stringify({ color_fondo: fondo, color_texto: colorTextoPara(fondo) }) })
  const toggle = c => llamar(`/campanas/${c.id}`, { method: 'PATCH', body: JSON.stringify({ activo: !c.activo }) },
    c.activo ? 'Campaña desactivada: ya no aparece en las listas' : 'Campaña activada')
  const mover = (c, direccion) => llamar(`/campanas/${c.id}/mover`, { method: 'POST', body: JSON.stringify({ direccion }) })
  // Los registros ya cargados con la campaña no cambian (guardan el nombre)
  const eliminar = c => llamar(`/campanas/${c.id}`, { method: 'DELETE' }, 'Campaña eliminada')

  if (!filas) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Cargando campañas…</div>
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        {TIPOS.map(t => {
          const lista = filas.filter(c => c.tipo === t.id).sort((a, b) => (a.orden - b.orden) || (a.id - b.id))
          const activas = lista.filter(c => c.activo).length
          return (
            <div key={t.id} style={S.card}>
              <div style={S.head}>
                <h3 style={S.title}>{t.label}</h3>
                <span style={S.count}>{activas} activas · {lista.length} en total</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
                <input style={S.input} placeholder={`Nueva campaña de ${t.label}…`} maxLength={100}
                  value={nuevos[t.id]} onChange={e => setNuevos(n => ({ ...n, [t.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') agregar(t.id) }} />
                {t.color && (
                  <input type="color" title="Color de la etiqueta" style={S.picker}
                    value={colorNuevo} onChange={e => setColorNuevo(e.target.value)} />
                )}
                <button style={S.btnPri} disabled={ocupado} onClick={() => agregar(t.id)}>+ Agregar</button>
              </div>
              {lista.length === 0
                ? <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Sin campañas.</div>
                : lista.map((c, i) => (
                  <Fila key={c.id} c={c} conColor={t.color} primero={i === 0} ultimo={i === lista.length - 1} ocupado={ocupado}
                    onGuardarNombre={guardarNombre} onColor={cambiarColor} onToggle={toggle} onMover={mover} onEliminar={eliminar} />
                ))}
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <button style={S.btn} disabled={ocupado} onClick={() => recargarCampanas()}>↻ Actualizar</button>
      </div>
    </div>
  )
}
