// Las tablas son grandes: consultar cada 1-2 segundos reconstruía cientos de
// filas durante toda la sesión aunque no hubiera cambios.
const MIN_POLL_DELAY = 30000
const MAX_POLL_DELAY = 120000
const INTERACTION_GRACE = 5000

let ultimaInteraccion = 0
let listenersInstalados = false
let versionRespuestas = 0

function instalarDetectorInteraccion() {
  if (listenersInstalados || typeof window === 'undefined') return
  listenersInstalados = true
  const marcar = () => { ultimaInteraccion = Date.now() }
  window.addEventListener('pointerdown', marcar, { passive:true, capture:true })
  window.addEventListener('keydown', marcar, { passive:true, capture:true })
  window.addEventListener('input', marcar, { passive:true, capture:true })
  window.addEventListener('wheel', marcar, { passive:true, capture:true })
}

export function setVisibleInterval(task, delay, pisoMinimo = MIN_POLL_DELAY) {
  instalarDetectorInteraccion()
  let running = false
  let cancelado = false
  let sinCambios = 0
  const intervaloBase = Math.max(Number(delay) || pisoMinimo, pisoMinimo)
  let timer = 0

  const programar = () => {
    if (cancelado) return
    // Si las respuestas no cambian, se reduce automáticamente la frecuencia.
    // Cualquier cambio confirmado devuelve el intervalo a su valor base.
    const espera = Math.min(intervaloBase * Math.max(1, 2 ** Math.min(sinCambios, 2)), MAX_POLL_DELAY)
    timer = window.setTimeout(ejecutar, espera)
  }

  const ejecutar = async () => {
    if (cancelado) return
    if (document.visibilityState === 'hidden' || running || Date.now() - ultimaInteraccion < INTERACTION_GRACE) {
      programar()
      return
    }
    running = true
    const versionAntes = versionRespuestas
    try {
      const resultado = await task()
      const huboCambios = resultado === true || versionRespuestas !== versionAntes
      if (!huboCambios) sinCambios = Math.min(sinCambios + 1, 2)
      else sinCambios = 0
    } catch {
      // Un fallo transitorio no debe romper para siempre la automatización.
      sinCambios = Math.min(sinCambios + 1, 2)
    } finally {
      running = false
      programar()
    }
  }

  programar()
  return { cancel: () => { cancelado = true; window.clearTimeout(timer) } }
}

// Acepta tanto los identificadores antiguos de setInterval como el nuevo
// controlador adaptativo, para migrar todas las pantallas sin duplicar lógica.
export function clearVisibleInterval(controlador) {
  if (controlador && typeof controlador.cancel === 'function') controlador.cancel()
  else window.clearInterval(controlador)
}

// Evita setState y renderizados completos cuando el servidor devuelve la
// misma colección. Solo conserva una firma pequeña, no una copia de los datos.
export function responseChanged(ref, data) {
  const json = JSON.stringify(data ?? null)
  let hash = 2166136261
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const firma = `${json.length}:${hash >>> 0}`
  if (ref.current === firma) return false
  ref.current = firma
  versionRespuestas += 1
  return true
}
