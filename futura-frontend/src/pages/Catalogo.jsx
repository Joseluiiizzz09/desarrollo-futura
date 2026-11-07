import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { cargosDeUsuario } from '../utils/roles'
import CambiarAreaMenu from '../components/CambiarAreaMenu'
import PaquetesCatalogo from '../components/PaquetesCatalogo'
import CampanasCatalogo from '../components/CampanasCatalogo'
import '../styles/usuarios.css'

// Pantalla para los accesos puntuales (subcargos) "Paquetes" y "Campañas":
// quien los tiene puede agregar/editar el catálogo sin ver Usuarios ni Jefatura.
const VISTAS = [['paquetes', 'Paquetes'], ['campanas', 'Campañas']]

export default function Catalogo() {
  const { sesion, logout } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const cargos = cargosDeUsuario(sesion)
  const completo = cargos.includes('jefatura') || cargos.includes('usuarios')
  const disponibles = VISTAS.filter(([id]) => completo || cargos.includes(id))
  const pedida = params.get('v')
  const [vista, setVista] = useState(disponibles.some(([id]) => id === pedida) ? pedida : disponibles[0]?.[0])
  const [toast, setToast] = useState('')
  function mostrarToast(m) { setToast(m); setTimeout(() => setToast(''), 3000) }
  function salir() { logout(); navigate('/login') }

  return (
    <div className="usu-root">
      <div className="topbar">
        <div className="brand">
          <div className="logo-circle"><img src="/assets/logo-futura.png" alt="FUTURA" /></div>
          <div className="brand-text">
            <img src="/assets/futura-wordmark.png" alt="FUTURA" style={{ height: 22, width: 'auto', display: 'block' }} />
            <span className="brand-sub">Catálogo</span>
          </div>
        </div>
        <div className="topbar-right">
          <CambiarAreaMenu />
          <button onClick={salir} className="btn-salir">Salir</button>
        </div>
      </div>

      <div className="pagina">
        <div className="page-header">
          <div>
            <h2>{vista === 'campanas' ? 'Campañas' : 'Paquetes de venta'}</h2>
            <p>{vista === 'campanas' ? 'Agrega, edita u ordena las campañas de Back Data y de Reclutamiento' : 'Agrega, edita u ordena los paquetes que se ofrecen en el formulario de venta'}</p>
          </div>
        </div>

        {disponibles.length > 1 && (
          <div style={{ display: 'flex', gap: 8, margin: '0 0 16px' }}>
            {disponibles.map(([id, label]) => (
              <button key={id} type="button" onClick={() => setVista(id)}
                style={{ padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  border: vista === id ? '1px solid #0f172a' : '1px solid #e5e7eb',
                  background: vista === id ? '#0f172a' : '#fff', color: vista === id ? '#fff' : '#374151' }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {vista === 'paquetes' && <PaquetesCatalogo mostrarToast={mostrarToast} />}
        {vista === 'campanas' && <CampanasCatalogo mostrarToast={mostrarToast} />}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#1f2937', color: '#fff',
          padding: '12px 24px', borderRadius: 12, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast}</div>
      )}
    </div>
  )
}
