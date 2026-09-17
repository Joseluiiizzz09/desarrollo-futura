import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { cargosDeUsuario } from '../utils/roles'
import { RUTAS, CARGO_LABELS } from '../utils/rutas'

// Selector discreto de área para usuarios con más de un cargo real
// (cargo principal + adicional vía `permisos`). No otorga permisos nuevos:
// solo navega entre rutas que el backend ya autoriza para este usuario
// (auth() en el backend valida por cargo O permisos, ver middleware/auth.js).
// Usuarios de un solo cargo no ven nada — el componente no renderiza.
export default function CambiarAreaMenu() {
  const { sesion } = useAuth()
  const navigate = useNavigate()
  const cargos = cargosDeUsuario(sesion).filter((c) => RUTAS[c])
  if (cargos.length <= 1) return null

  return (
    <select
      value=""
      onChange={(e) => { if (e.target.value) navigate(RUTAS[e.target.value]) }}
      title="Cambiar área"
      style={{
        fontSize: 11, fontWeight: 600, padding: '6px 10px', borderRadius: 8,
        border: '1px solid #e5e7eb', background: '#fff', color: '#374151',
        cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
      }}
    >
      <option value="">Cambiar área</option>
      {cargos.map((c) => (
        <option key={c} value={c}>{CARGO_LABELS[c] || c}</option>
      ))}
    </select>
  )
}
