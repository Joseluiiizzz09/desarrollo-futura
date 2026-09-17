export default function CanalBadge({ canal }) {
  const valor = String(canal || '').trim().toUpperCase()
  if (!valor) return <span className="badge-canal badge-canal-sin">SIN CANAL</span>
  const cls = valor === 'NETCONTACT' ? 'badge-canal-netcontact' : valor === 'KELS' ? 'badge-canal-kels' : 'badge-canal-sin'
  return <span className={`badge-canal ${cls}`}>{valor}</span>
}
