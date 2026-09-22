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

// Si algo externo al árbol de React (funciones del navegador, traductores,
// autocompletado) mueve o quita nodos del DOM, React lanza NotFoundError en
// removeChild/insertBefore y deja la pantalla en blanco. Se ignoran esas
// operaciones cuando el nodo ya no pertenece al padre esperado.
if (typeof Node === 'function' && Node.prototype) {
  const removeChildOriginal = Node.prototype.removeChild
  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) {
      console.warn('removeChild ignorado: el nodo ya no es hijo de este padre', child, this)
      return child
    }
    return removeChildOriginal.apply(this, arguments)
  }

  const insertBeforeOriginal = Node.prototype.insertBefore
  Node.prototype.insertBefore = function (nuevo, referencia) {
    if (referencia && referencia.parentNode !== this) {
      console.warn('insertBefore ignorado: la referencia ya no es hija de este padre', referencia, this)
      return nuevo
    }
    return insertBeforeOriginal.apply(this, arguments)
  }
}

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
