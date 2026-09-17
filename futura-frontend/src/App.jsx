import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { leerSesionActual, useAuth } from './hooks/useAuth'
import { cargosDeUsuario } from './utils/roles'
import { RUTAS } from './utils/rutas'

const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Backoffice = lazy(() => import('./pages/Backoffice'))
const Supervisor = lazy(() => import('./pages/Supervisor'))
const Validacion = lazy(() => import('./pages/Validacion'))
const Seguimiento = lazy(() => import('./pages/Seguimiento'))
const Grabaciones = lazy(() => import('./pages/Grabaciones'))
const SupGrabaciones = lazy(() => import('./pages/SupGrabaciones'))
const Programacion = lazy(() => import('./pages/Programacion'))
const Cobranzas = lazy(() => import('./pages/Cobranzas'))
const Calidad = lazy(() => import('./pages/Calidad'))
const SupCalidad = lazy(() => import('./pages/SupCalidad'))
const Jefatura = lazy(() => import('./pages/Jefatura'))
const Usuarios = lazy(() => import('./pages/Usuarios'))
const Backdatareclutamiento = lazy(() => import('./pages/Backdatareclutamiento'))
const DashboardReclutamiento = lazy(() => import('./pages/dashboardreclutamiento'))
const MarketingLeads = lazy(() => import('./pages/MarketingLeads'))

function RouteLoader() {
  return (
    <div style={{ minHeight:'100vh', display:'grid', placeItems:'center', background:'#f5f6fa', color:'#64748b', fontFamily:'Inter, sans-serif' }}>
      Cargando módulo…
    </div>
  )
}

function rutaInicialAutorizada(sesion) {
  return cargosDeUsuario(sesion).map(cargo => RUTAS[cargo]).find(Boolean) || '/login'
}

function PrivateRoute({ children, cargo }) {
  // sessionStorage es la fuente autoritativa durante una vista delegada.
  // Leerla aquí evita una carrera entre navigate() y el setState de useAuth.
  useAuth() // mantiene este componente reactivo ante login/logout/cambio de vista
  const sesion = leerSesionActual()
  if (!sesion) return <Navigate to="/login" replace />
  const cargosPermitidos = Array.isArray(cargo) ? cargo : cargo ? [cargo] : null
  if (cargosPermitidos && !cargosPermitidos.some(c => cargosDeUsuario(sesion).includes(c))) {
    return <Navigate to={rutaInicialAutorizada(sesion)} replace />
  }
  return children
}

function InicioAutorizado() {
  useAuth()
  const sesion = leerSesionActual()
  return <Navigate to={sesion ? rutaInicialAutorizada(sesion) : '/login'} replace />
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<InicioAutorizado />} />

      <Route path="/dashboard"     element={<PrivateRoute cargo="asesor"><Dashboard /></PrivateRoute>} />
      <Route path="/backoffice"    element={<PrivateRoute cargo="backoffice"><Backoffice /></PrivateRoute>} />
      <Route path="/supervisor"    element={<PrivateRoute cargo="supervisor"><Supervisor /></PrivateRoute>} />
      <Route path="/validacion"    element={<PrivateRoute cargo="validacion"><Validacion /></PrivateRoute>} />
      <Route path="/seguimiento"   element={<PrivateRoute cargo="seguimiento"><Seguimiento /></PrivateRoute>} />
      <Route path="/grabaciones"   element={<PrivateRoute cargo="grabaciones"><Grabaciones /></PrivateRoute>} />
      <Route path="/sup-grabaciones" element={<PrivateRoute cargo="supgrabaciones"><SupGrabaciones /></PrivateRoute>} />
      <Route path="/programacion"  element={<PrivateRoute cargo="programacion"><Programacion /></PrivateRoute>} />
      <Route path="/cobranzas"     element={<PrivateRoute cargo="cobranzas"><Cobranzas /></PrivateRoute>} />
      <Route path="/calidad"       element={<PrivateRoute cargo="calidad"><Calidad /></PrivateRoute>} />
      <Route path="/sup-calidad"   element={<PrivateRoute cargo="supcalidad"><SupCalidad /></PrivateRoute>} />
      <Route path="/jefatura"      element={<PrivateRoute cargo="jefatura"><Jefatura /></PrivateRoute>} />
      <Route path="/usuarios"      element={<PrivateRoute cargo="usuarios"><Usuarios /></PrivateRoute>} />
      <Route path="/backdata-reclutamiento" element={<PrivateRoute cargo={['backreclutamiento','entrevistas','capacitador']}><Backdatareclutamiento /></PrivateRoute>} />
      <Route path="/reclutamiento"          element={<PrivateRoute cargo="asesorreclutamiento"><DashboardReclutamiento /></PrivateRoute>} />
      <Route path="/marketing-leads"        element={<PrivateRoute cargo="marketing"><MarketingLeads /></PrivateRoute>} />

      <Route path="*" element={<InicioAutorizado />} />
      </Routes>
    </Suspense>
  )
}
