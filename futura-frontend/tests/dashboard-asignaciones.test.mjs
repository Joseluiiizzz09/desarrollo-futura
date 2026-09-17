import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('../src/pages/Dashboard.jsx', import.meta.url), 'utf8')
const helper = source.slice(source.indexOf('function asignacionesVigentesDelAsesor('), source.indexOf('// ─── Componente principal'))
const asignaciones = runInNewContext(`${helper}; asignacionesVigentesDelAsesor`)
const old = { asesor: 'LEONARDO THIAGO', fecha: '2026-09-03', hora: '14:58' }
assert.equal(asignaciones([old], 'SAFIRO HIDALGO', 138, 138).length, 1)
assert.equal(asignaciones([old], 'OTRO', 139, 138).length, 0)
assert.equal(asignaciones([old], 'LEONARDO THIAGO', 138, 139).length, 1)
assert.equal(asignaciones([old, { tipo: 'QUITAR_ASIGNACION', asesorQuitado: old.asesor }], 'SAFIRO HIDALGO', 138, 138).length, 0)
assert.equal(asignaciones([{ ...old, asesor_id: 139 }], 'SAFIRO HIDALGO', 138, 138).length, 0)
assert.equal(asignaciones([{ ...old, fecha: '2026-09-02' }], 'SAFIRO HIDALGO', 138, 138)[0].fecha, '2026-09-02')
assert.equal(asignaciones([old, { tipo: 'TIPIF_VEND', asesor: 'SAFIRO HIDALGO', fecha: '2026-09-04' }], 'SAFIRO HIDALGO', 138, 138)[0].fecha, '2026-09-03')
console.log('7 pruebas de identidad, fecha y retiro correctas')
