export function permisosDeUsuario(usuario) {
  if (!usuario) return []
  if (Array.isArray(usuario.permisos)) return usuario.permisos.filter(Boolean)
  try {
    const permisos = JSON.parse(usuario.permisos || '[]')
    return Array.isArray(permisos) ? permisos.filter(Boolean) : []
  } catch {
    return []
  }
}

export function cargosDeUsuario(usuario) {
  return [...new Set([usuario?.cargo, ...permisosDeUsuario(usuario)].filter(Boolean))]
}

export function usuarioTieneCargo(usuario, cargo) {
  return cargosDeUsuario(usuario).includes(cargo)
}

