import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function JefaturaViewControls({ children }) {
  const { sesion, refrescarSesion } = useAuth()
  const navigate = useNavigate()
  let objetivo = null
  try { objetivo = JSON.parse(sessionStorage.getItem('nc_jefatura_usuario_objetivo') || 'null') } catch {}

  if (!objetivo || (sesion?.cargo !== 'jefatura' && !sesion?._actorJefatura)) return children

  function volver() {
    sessionStorage.removeItem('nc_jefatura_usuario_objetivo')
    sessionStorage.removeItem('nc_dashboard_asesor_objetivo')
    sessionStorage.setItem('nc_jefatura_apartado', 'accesos')
    refrescarSesion()
    navigate('/jefatura')
  }

  return (
    <>
      <span className="jefatura-vista">Vista de: {objetivo.nombre || objetivo.usuario || 'usuario'}</span>
      <button type="button" className="jefatura-volver" onClick={volver}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/><path d="M9 12h10"/></svg>
        <span>Volver a Jefatura</span>
      </button>
    </>
  )
}
