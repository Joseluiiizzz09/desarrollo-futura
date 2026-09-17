const formatFechaProgramada = (fecha) => {
  if (!fecha) return ''
  const value = String(fecha).slice(0, 10)
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

export default function ProgramacionInfoCell({ sot, fecha, soloFecha = false, soloFechaLabel = 'Fecha de instalación:', onEdit }) {
  const fechaFormateada = formatFechaProgramada(fecha)
  const contenido = soloFecha
    ? (fechaFormateada ? <><strong>{soloFechaLabel}</strong> {fechaFormateada}</> : '—')
    : (sot || fechaFormateada
        ? <><div><strong>SOT:</strong> {sot || '—'}</div><div><strong>Fecha programada:</strong> {fechaFormateada || '—'}</div></>
        : '—')
  const style = { minWidth: soloFecha ? 150 : 175, fontSize: 10, lineHeight: 1.5, color: '#475569', textAlign: 'left' }

  return onEdit ? (
    <button type="button" onClick={onEdit} title="Editar SOT y fecha programada"
      style={{ ...style, width: '100%', padding: '5px 7px', border: '1px solid #cbd5e1', borderRadius: 7, background: '#f8fafc', cursor: 'pointer', fontFamily: 'inherit' }}>
      {contenido}
    </button>
  ) : <div style={style}>{contenido}</div>
}
