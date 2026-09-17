export const NC_API = import.meta.env.DEV ? 'http://localhost:3000' : ''
export const API    = '/api'

function jefaturaViewHeaders() {
  try {
    const sesion = JSON.parse(sessionStorage.getItem('nc_usuario') || 'null')
    const objetivo = JSON.parse(sessionStorage.getItem('nc_jefatura_usuario_objetivo') || 'null')
    if (sesion?.cargo === 'jefatura' && objetivo?.id && objetivo?.cargo) {
      return {
        'X-NC-View-User': String(objetivo.id),
        'X-NC-View-Area': String(objetivo.cargo),
      }
    }
  } catch {}
  return {}
}

export function ncHeaders() {
  const token = sessionStorage.getItem('nc_token') || ''
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...jefaturaViewHeaders(),
  }
}

export function ncHeadersFile() {
  const token = sessionStorage.getItem('nc_token') || ''
  return { 'Authorization': `Bearer ${token}`, ...jefaturaViewHeaders() }
}
