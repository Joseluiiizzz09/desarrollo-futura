// Alerta de documento / teléfono de contacto repetido entre ventas. Solo
// avisa: no bloquea nada. Los conteos vienen de GET /api/ventas/duplicados y
// se comparten entre todas las tablas (un solo pedido por minuto).
import { useEffect, useState } from 'react'
import { API, ncHeaders } from '../services/api'

const normDoc = d => String(d || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '')
const normTel = t => { const n = String(t || '').replace(/\D/g, ''); return n.length > 9 ? n.slice(-9) : n }

let datos = { dni: {}, tel: {} }
let pedidoEn = 0
let promesa = null
const oyentes = new Set()

function cargar() {
  if (promesa || Date.now() - pedidoEn < 60 * 1000) return promesa
  promesa = fetch(`${API}/ventas/duplicados`, { headers: ncHeaders() })
    .then(r => r.json())
    .then(d => { if (d?.ok) { pedidoEn = Date.now(); datos = { dni: d.dni || {}, tel: d.tel || {} }; oyentes.forEach(f => f(datos)) } })
    .catch(() => {})
    .finally(() => { promesa = null })
  return promesa
}

export function useDuplicados() {
  const [d, setD] = useState(datos)
  useEffect(() => {
    oyentes.add(setD)
    cargar()
    const t = setInterval(cargar, 60 * 1000)
    return () => { oyentes.delete(setD); clearInterval(t) }
  }, [])
  return d
}

// <ValorConAlerta tipo="dni" valor={v.dni} /> → el valor con ⚠ si se repite
export function ValorConAlerta({ tipo, valor, vacio = '—' }) {
  const d = useDuplicados()
  const v = String(valor || '').trim()
  if (!v) return vacio
  const n = tipo === 'tel' ? d.tel[normTel(v)] : d.dni[normDoc(v)]
  if (!n) return v
  const que = tipo === 'tel' ? 'Teléfono' : 'Documento'
  return (
    <span className="alerta-dup" title={`${que} repetido: aparece en ${n} ventas. Revisa si se duplicó.`}>
      <span className="alerta-dup-icono" aria-label="Repetido">⚠</span>{v}
    </span>
  )
}
