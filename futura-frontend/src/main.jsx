import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// Si una sesión quedó abierta durante un despliegue puede intentar importar
// un chunk versionado anterior. Recarga una sola vez para tomar el index nuevo
// en lugar de dejar al usuario con la pantalla en blanco.
const CHUNK_RELOAD_KEY = 'futura_chunk_reload_once'
function recuperarVersionFrontend(error) {
  const mensaje = String(error?.reason?.message || error?.message || error?.reason || '')
  if (!/dynamically imported module|loading chunk|chunkloaderror|failed to fetch module/i.test(mensaje)) return
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  window.location.reload()
}
window.addEventListener('error', recuperarVersionFrontend)
window.addEventListener('unhandledrejection', recuperarVersionFrontend)
setTimeout(() => sessionStorage.removeItem(CHUNK_RELOAD_KEY), 15000)

// Evita que el browser restaure el scroll de visitas anteriores en el SPA
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
