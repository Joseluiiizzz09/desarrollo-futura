// Mapa cargo -> ruta real registrada en App.jsx. Compartido entre Login.jsx
// (ruta inicial tras autenticar) y el selector de área en el header
// (cambiar de cargo sin cerrar sesión). Un cargo sin entrada aquí no tiene
// ruta navegable — se filtra al construir cualquier selector de área.
export const RUTAS = {
  asesor:         '/dashboard',
  supervisor:     '/supervisor',
  backoffice:     '/backoffice',
  validacion:     '/validacion',
  grabaciones:    '/grabaciones',
  seguimiento:    '/seguimiento',
  jefatura:       '/jefatura',
  usuarios:       '/usuarios',
  programacion:   '/programacion',
  cobranzas:      '/cobranzas',
  calidad:        '/calidad',
  supcalidad:     '/sup-calidad',
  supgrabaciones: '/sup-grabaciones',
  backreclutamiento:   '/backdata-reclutamiento',
  entrevistas:         '/backdata-reclutamiento',
  capacitador:         '/backdata-reclutamiento',
  marketing:           '/marketing-leads',
}
export const CARGO_LABELS = {
  asesor: 'Asesor',
  supervisor: 'Supervisor',
  backoffice: 'Back Office',
  validacion: 'Validación',
  grabaciones: 'Grabaciones',
  seguimiento: 'Seguimiento',
  jefatura: 'Jefatura',
  usuarios: 'Usuarios',
  programacion: 'Programación',
  cobranzas: 'Cobranzas',
  calidad: 'Calidad',
  supcalidad: 'Super de Calidad',
  supgrabaciones: 'Sup. Grabaciones',
  backreclutamiento: 'Back Data Reclutaminto',
  entrevistas: 'Entrevistas',
  capacitador: 'Capacitación',
  marketing: 'Marketing',
}
