import { useEffect, useMemo, useState } from 'react'
import { API, NC_API, ncHeaders, ncHeadersFile } from '../services/api'

export function mediaUrl(path) {
  if (!path) return ''
  const raw = String(path).trim()
  if (/^(blob:|data:|https?:\/\/)/i.test(raw)) return raw
  return `${NC_API}/${raw.replace(/^\/+/, '')}`
}

function nombreArchivo(path, fallback = 'archivo') {
  const limpio = String(path || '').split('?')[0].split('#')[0]
  return limpio.split('/').pop() || fallback
}

function esPdf(file) {
  const mime = String(file?.mimetype || file?.mime || '').toLowerCase()
  const ruta = String(file?.ruta || file?.url || file?.path || '').toLowerCase()
  return mime.includes('pdf') || /\.pdf$/i.test(ruta)
}

function esImagen(file) {
  const mime = String(file?.mimetype || file?.mime || '').toLowerCase()
  const ruta = String(file?.ruta || file?.url || file?.path || '').toLowerCase()
  return mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(ruta)
}

function useProtectedMedia(path) {
  const [state, setState] = useState({ url: '', loading: false, error: '' })

  useEffect(() => {
    if (!path) {
      setState({ url: '', loading: false, error: '' })
      return undefined
    }

    const directo = mediaUrl(path)
    if (/^(blob:|data:)/i.test(directo)) {
      setState({ url: directo, loading: false, error: '' })
      return undefined
    }

    let activo = true
    let blobUrl = ''
    setState({ url: '', loading: true, error: '' })

    fetch(directo, { headers: ncHeadersFile() })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
      .then(blob => {
        blobUrl = URL.createObjectURL(blob)
        if (activo) setState({ url: blobUrl, loading: false, error: '' })
      })
      .catch(err => {
        console.error('No se pudo cargar archivo protegido:', err)
        if (activo) setState({ url: directo, loading: false, error: 'No se pudo abrir el archivo. Revisa si existe en el servidor.' })
      })

    return () => {
      activo = false
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [path])

  return state
}

function MediaThumb({ file, onOpen }) {
  const ruta = file?.ruta || file?.url || file?.path || ''
  const nombre = file?.nombre || nombreArchivo(ruta, 'foto')
  const { url, loading, error } = useProtectedMedia(ruta)
  const isPdf = esPdf(file)
  const isImage = esImagen(file)

  return (
    <button type="button" className="media-viewer-thumb" onClick={() => onOpen(file)} title={nombre}>
      <div className="media-viewer-thumb-preview">
        {loading ? (
          <span className="media-viewer-loader">Cargando...</span>
        ) : isImage && url ? (
          <img src={url} alt={nombre} />
        ) : (
          <span className="media-viewer-file-icon">{isPdf ? 'PDF' : 'ARCHIVO'}</span>
        )}
      </div>
      <span className="media-viewer-thumb-name">{nombre}</span>
      {error && <span className="media-viewer-thumb-error">No disponible</span>}
    </button>
  )
}

function MediaPreview({ file }) {
  const ruta = file?.ruta || file?.url || file?.path || ''
  const nombre = file?.nombre || nombreArchivo(ruta, 'archivo')
  const { url, loading, error } = useProtectedMedia(ruta)
  const isPdf = esPdf(file)
  const isImage = esImagen(file)

  return (
    <div className="media-viewer-preview">
      {loading && <div className="media-viewer-preview-empty">Cargando archivo...</div>}
      {!loading && error && <div className="media-viewer-preview-empty">{error}</div>}
      {!loading && !error && isImage && url && <img src={url} alt={nombre} />}
      {!loading && !error && isPdf && url && <iframe title={nombre} src={url} />}
      {!loading && !error && !isImage && !isPdf && (
        <div className="media-viewer-preview-empty">Archivo listo para abrir o descargar.</div>
      )}
      <div className="media-viewer-preview-actions">
        <span>{nombre}</span>
        <div>
          <button type="button" onClick={() => window.open(url || mediaUrl(ruta), '_blank', 'noopener,noreferrer')}>Abrir</button>
          <a href={url || mediaUrl(ruta)} download={nombre}>Descargar</a>
        </div>
      </div>
    </div>
  )
}

function AudioBlock({ audioPath, audioName }) {
  const nombre = audioName || nombreArchivo(audioPath, 'audio')
  const { url, loading, error } = useProtectedMedia(audioPath)

  return (
    <div className="media-viewer-audio">
      <div>
        <strong>Audio / grabación</strong>
        <span>{nombre}</span>
      </div>
      {loading ? (
        <span className="media-viewer-loader">Cargando audio...</span>
      ) : error ? (
        <span className="media-viewer-error">{error}</span>
      ) : url ? (
        <>
          <audio src={url} controls preload="metadata" />
          <div className="media-viewer-audio-actions">
            <button type="button" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Abrir audio</button>
            <a href={url} download={nombre}>Descargar</a>
          </div>
        </>
      ) : (
        <span className="media-viewer-muted">Sin audio registrado.</span>
      )}
    </div>
  )
}

export default function MediaViewer({
  open,
  onClose,
  ventaId = null,
  title = 'Archivos de la venta',
  subtitle = '',
  photos = null,
  audioPath = '',
  audioName = '',
  loading = false,
  error = '',
}) {
  const [preview, setPreview] = useState(null)
  const [autoFotos, setAutoFotos] = useState([])
  const [autoState, setAutoState] = useState({ loading: false, error: '' })

  useEffect(() => {
    if (!open || !ventaId || Array.isArray(photos)) return undefined
    let activo = true
    setAutoState({ loading: true, error: '' })
    setAutoFotos([])

    fetch(`${API}/ventas/${ventaId}/fotos`, { headers: ncHeaders() })
      .then(res => res.json())
      .then(data => {
        if (!activo) return
        if (!data.ok) throw new Error(data.mensaje || 'No se pudieron cargar fotos')
        setAutoFotos(Array.isArray(data.data) ? data.data : [])
        setAutoState({ loading: false, error: '' })
      })
      .catch(err => {
        console.error('No se pudieron cargar fotos:', err)
        if (activo) setAutoState({ loading: false, error: 'No se pudieron cargar las fotos de esta venta.' })
      })

    return () => { activo = false }
  }, [open, ventaId, photos])

  const fotos = useMemo(() => {
    const base = Array.isArray(photos) ? photos : autoFotos
    return base.filter(Boolean)
  }, [photos, autoFotos])
  const cargando = loading || autoState.loading
  const errorFinal = error || autoState.error

  useEffect(() => {
    if (!open) setPreview(null)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="media-viewer-overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="media-viewer-box">
        <div className="media-viewer-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="media-viewer-close" onClick={onClose}>×</button>
        </div>

        {errorFinal && <div className="media-viewer-error-box">{errorFinal}</div>}
        {audioPath && <AudioBlock audioPath={audioPath} audioName={audioName} />}

        <div className="media-viewer-section-title">
          <span>Fotos / documentos</span>
          <b>{cargando ? 'Cargando...' : `${fotos.length} archivo${fotos.length === 1 ? '' : 's'}`}</b>
        </div>

        {cargando ? (
          <div className="media-viewer-empty">Buscando fotos...</div>
        ) : fotos.length ? (
          <div className="media-viewer-grid">
            {fotos.map((foto, idx) => (
              <MediaThumb key={foto.id || foto.ruta || idx} file={foto} onOpen={setPreview} />
            ))}
          </div>
        ) : (
          <div className="media-viewer-empty">No hay fotos registradas para esta venta.</div>
        )}

        {preview && (
          <div className="media-viewer-preview-layer">
            <div className="media-viewer-preview-card">
              <button type="button" className="media-viewer-close preview" onClick={() => setPreview(null)}>×</button>
              <MediaPreview file={preview} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
