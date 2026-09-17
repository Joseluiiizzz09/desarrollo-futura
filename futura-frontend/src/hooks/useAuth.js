import { useEffect, useState } from 'react'

const AUTH_CHANGE_EVENT = 'nc-auth-change'

export function leerSesionActual() {
  try {
    const raw = sessionStorage.getItem('nc_usuario')
    const actor = raw ? JSON.parse(raw) : null
    const objetivo = JSON.parse(sessionStorage.getItem('nc_jefatura_usuario_objetivo') || 'null')
    if (actor?.cargo === 'jefatura' && objetivo?.id && objetivo?.cargo) {
      return { ...actor, ...objetivo, cargo: objetivo.cargo, _actorJefatura: actor }
    }
    return actor
  } catch {
    return null
  }
}

export function useAuth() {
  const [sesion, setSesion] = useState(leerSesionActual)

  useEffect(() => {
    const sincronizar = () => setSesion(leerSesionActual())
    window.addEventListener(AUTH_CHANGE_EVENT, sincronizar)
    window.addEventListener('storage', sincronizar)
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, sincronizar)
      window.removeEventListener('storage', sincronizar)
    }
  }, [])

  function refrescarSesion() {
    // `storage` no se dispara en la misma pestaña; este evento mantiene
    // sincronizadas todas las instancias de useAuth antes de navegar.
    window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
  }

  function login(token, usuario) {
    sessionStorage.setItem('nc_token', token)
    sessionStorage.setItem('nc_usuario', JSON.stringify(usuario))
    setSesion(usuario)
    refrescarSesion()
  }

  function logout() {
    sessionStorage.removeItem('nc_jefatura_usuario_objetivo')
    sessionStorage.removeItem('nc_dashboard_asesor_objetivo')
    sessionStorage.removeItem('nc_token')
    sessionStorage.removeItem('nc_usuario')
    setSesion(null)
    refrescarSesion()
  }

  function getToken() {
    return sessionStorage.getItem('nc_token') || ''
  }

  function tieneAcceso(cargo) {
    if (!sesion) return false
    // Cada sesion usa un solo cargo activo para no mezclar permisos.
    return sesion.cargo === cargo
  }

  return { sesion, login, logout, getToken, tieneAcceso, refrescarSesion }
}
