import { useState } from 'react'
import { API, ncHeaders } from '../services/api'
import { useCatalogoPaquetes, fijarCatalogoPaquetes, recargarPaquetes, PLANES } from '../utils/paquetes'

// Usuarios → Paquetes: edición manual del catálogo de paquetes por plan que
// usa el formulario de venta. Las ventas guardan el nombre como texto, así
// que renombrar o quitar un paquete no cambia ventas ya registradas.
const S = {
  card:   { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, minWidth: 0 },
  head:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  title:  { margin: 0, fontSize: 15, fontWeight: 800, color: '#111827' },
  count:  { fontSize: 11, fontWeight: 700, color: '#6b7280' },
  fila:   { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderBottom: '1px solid #f1f5f9' },
  nombre: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  input:  { flex: 1, minWidth: 0, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' },
  badge:  { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' },
  btn:    { border: '1px solid #e5e7eb', background: '#fff', borderRadius: 7, padding: '4px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' },
  btnPri: { border: 'none', background: '#0f172a', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
}

function Fila({ p, primero, ultimo, ocupado, onGuardarNombre, onToggle, onMover, onEliminar }) {
  const [editando, setEditando] = useState(false)
  // Confirmación dentro de la fila (el cuadro nativo de Chrome a veces ignora "Aceptar")
  const [confirmando, setConfirmando] = useState(false)
  const [valor, setValor] = useState(p.nombre)

  async function guardar() {
    const nuevo = valor.trim()
    if (!nuevo || nuevo === p.nombre) { setEditando(false); setValor(p.nombre); return }
    if (await onGuardarNombre(p, nuevo)) setEditando(false)
  }

  return (
    <div style={{ ...S.fila, opacity: p.activo ? 1 : 0.5 }}>
      {editando ? (
        <input autoFocus style={S.input} value={valor} maxLength={150}
          onChange={e => setValor(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') { setEditando(false); setValor(p.nombre) } }} />
      ) : (
        <span style={S.nombre} title={p.nombre}>{p.nombre}</span>
      )}
      {!p.activo && <span style={{ ...S.badge, background: '#f3f4f6', color: '#6b7280' }}>Inactivo</span>}
      {editando ? (
        <>
          <button style={S.btn} disabled={ocupado} onClick={guardar}>Guardar</button>
          <button style={S.btn} disabled={ocupado} onClick={() => { setEditando(false); setValor(p.nombre) }}>Cancelar</button>
        </>
      ) : confirmando ? (
        <>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', whiteSpace: 'nowrap' }}>¿Eliminar?</span>
          <button style={{ ...S.btn, background: '#b91c1c', color: '#fff', borderColor: '#b91c1c' }} disabled={ocupado}
            onClick={async () => { if (await onEliminar(p)) return; setConfirmando(false) }}>Sí, eliminar</button>
          <button style={S.btn} disabled={ocupado} onClick={() => setConfirmando(false)}>No</button>
        </>
      ) : (
        <>
          <button style={S.btn} title="Subir" disabled={ocupado || primero} onClick={() => onMover(p, 'arriba')}>↑</button>
          <button style={S.btn} title="Bajar" disabled={ocupado || ultimo} onClick={() => onMover(p, 'abajo')}>↓</button>
          <button style={S.btn} disabled={ocupado} onClick={() => { setValor(p.nombre); setEditando(true) }}>Editar</button>
          <button style={S.btn} disabled={ocupado} onClick={() => onToggle(p)}>{p.activo ? 'Desactivar' : 'Activar'}</button>
          <button style={{ ...S.btn, color: '#b91c1c', borderColor: '#fecaca' }} disabled={ocupado} onClick={() => setConfirmando(true)}>Eliminar</button>
        </>
      )}
    </div>
  )
}

export default function PaquetesCatalogo({ mostrarToast }) {
  const filas = useCatalogoPaquetes()
  const [nuevos, setNuevos] = useState({})
  const [ocupado, setOcupado] = useState(false)
  const toast = mostrarToast || (m => window.alert(m))

  async function llamar(url, opciones, okMsg) {
    setOcupado(true)
    try {
      const res = await fetch(`${API}${url}`, { headers: ncHeaders(), ...opciones })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) { toast(data.mensaje || 'No se pudo guardar'); return false }
      fijarCatalogoPaquetes(data.data)
      if (okMsg) toast(okMsg)
      return true
    } catch {
      toast('Error conectando al servidor')
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function agregar(plan) {
    const nombre = (nuevos[plan] || '').trim()
    if (!nombre) {
      // Lleva al cuadro de texto: primero se escribe el nombre y luego se agrega
      document.getElementById(`nuevo-paquete-${plan}`)?.focus()
      return toast('Primero escribe el nombre del paquete en el cuadro de la izquierda')
    }
    const ok = await llamar('/paquetes', { method: 'POST', body: JSON.stringify({ plan, nombre }) }, 'Paquete agregado')
    if (ok) setNuevos(n => ({ ...n, [plan]: '' }))
  }
  const guardarNombre = (p, nombre) => llamar(`/paquetes/${p.id}`, { method: 'PATCH', body: JSON.stringify({ nombre }) }, 'Paquete actualizado')
  const toggle = p => llamar(`/paquetes/${p.id}`, { method: 'PATCH', body: JSON.stringify({ activo: !p.activo }) },
    p.activo ? 'Paquete desactivado: ya no aparece en el formulario de venta' : 'Paquete activado')
  const mover = (p, direccion) => llamar(`/paquetes/${p.id}/mover`, { method: 'POST', body: JSON.stringify({ direccion }) })
  // Las ventas ya registradas con el paquete no cambian (guardan el nombre)
  const eliminar = p => llamar(`/paquetes/${p.id}`, { method: 'DELETE' }, 'Paquete eliminado')

  if (!filas) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Cargando paquetes…</div>
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        {PLANES.map(plan => {
          const lista = filas.filter(p => p.plan === plan).sort((a, b) => (a.orden - b.orden) || (a.id - b.id))
          const activos = lista.filter(p => p.activo).length
          return (
            <div key={plan} style={S.card}>
              <div style={S.head}>
                <h3 style={S.title}>{plan}</h3>
                <span style={S.count}>{activos} activos · {lista.length} en total</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input id={`nuevo-paquete-${plan}`} style={S.input} placeholder={`Nuevo paquete para ${plan}…`} maxLength={150}
                  value={nuevos[plan] || ''} onChange={e => setNuevos(n => ({ ...n, [plan]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') agregar(plan) }} />
                <button style={S.btnPri} disabled={ocupado} onClick={() => agregar(plan)}>+ Agregar</button>
              </div>
              {lista.length === 0
                ? <div style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Sin paquetes.</div>
                : lista.map((p, i) => (
                  <Fila key={p.id} p={p} primero={i === 0} ultimo={i === lista.length - 1} ocupado={ocupado}
                    onGuardarNombre={guardarNombre} onToggle={toggle} onMover={mover} onEliminar={eliminar} />
                ))}
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 12, textAlign: 'right' }}>
        <button style={S.btn} disabled={ocupado} onClick={() => recargarPaquetes()}>↻ Actualizar</button>
      </div>
    </div>
  )
}
