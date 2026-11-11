// The reader against pyarrow: every value of every test file must match testdata/<file>.expected.json
// (written by scripts/gen_testdata.py), read whole and in pages that cross row group and page boundaries.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { cellText, hex, openParquet, readRows, toBytes } from '../../src/core/index.js'
import { NO_TESTDATA, TESTDATA, fileSource, hasTestdata, lib } from './helpers.mjs'

const dv = new DataView(new ArrayBuffer(8))
function fbits(v) {
  if (Number.isNaN(v)) return 'NaN'
  dv.setFloat64(0, v)
  return dv.getBigUint64(0).toString()
}

// Canonical form shared with scripts/gen_testdata.py (canon_value / canon_column).
function canon(v, d) {
  if (v === null || v === undefined) return null
  if (d.kind === 'list') return v.map(x => canon(x, d.item))
  if (d.kind === 'struct') return Object.fromEntries(d.fields.map(f => [f.name, canon(v[f.name], f.desc)]))
  if (d.kind === 'map') {
    return v.entries.map(([k, x]) => [k, canon(x, d.value)]).sort((a, b) => (JSON.stringify(a[0]) < JSON.stringify(b[0]) ? -1 : 1))
  }
  switch (d.cat) {
    case 'bool': return v
    case 'int': case 'bigint': return String(v)
    case 'float': return fbits(v)
    case 'decimal': return v.text
    case 'string': case 'enum': case 'json': return typeof v === 'string' ? v : 'BIN:' + hex(toBytes(v))
    case 'binary': return 'hex:' + hex(toBytes(v))
    case 'fixed': case 'bson': return 'hex:' + hex(v.bytes)
    case 'uuid': return 'hex:' + v.replace(/-/g, '')
    case 'date': return v.days
    case 'timestamp': case 'time': return v.ns.toString()
    case 'null': return null
    default: return 'UNHANDLED:' + d.cat
  }
}

// pyarrow reads INT96 as nanoseconds and overflows int64 for years 0001 and 9999; these two values are
// the viewer's correct ones (pyarrow agrees when read with coerce_int96_timestamp_unit='us').
const KNOWN = { 'int96.parquet': { ts_us: { 1: '-62135596800000000000', 3: '253402300799999999000' }, ts_us_utc: { 1: '-62135596800000000000' } } }

function mismatches(file, ctx, rows, names, expected, offset = 0) {
  const out = []
  names.forEach((name, j) => {
    const d = ctx.byName.get(name).desc
    rows.forEach((row, i) => {
      const got = JSON.stringify(canon(row[j], d))
      const known = KNOWN[file]?.[name]?.[i + offset]
      const want = known ? JSON.stringify(known) : JSON.stringify(expected.columns[name][i + offset] ?? null)
      if (got !== want && out.length < 5) out.push(`${name}[${i + offset}] (${d.label}): ${got.slice(0, 120)} ≠ ${want.slice(0, 120)}`)
    })
  })
  return out
}

const files = fs.existsSync(TESTDATA)
  ? fs.readdirSync(TESTDATA).filter(f => f.endsWith('.parquet') && fs.existsSync(path.join(TESTDATA, f + '.expected.json')))
  : []

test('arquivos de teste presentes', { skip: !files.length && NO_TESTDATA }, () => assert.ok(files.length >= 10))

for (const file of files) {
  test(`${file}: valores iguais aos do pyarrow`, async () => {
    const expected = JSON.parse(fs.readFileSync(path.join(TESTDATA, file + '.expected.json'), 'utf8'))
    const ctx = await openParquet(lib, fileSource(path.join(TESTDATA, file)))
    const names = ctx.columns.map(c => c.name)
    assert.equal(ctx.numRows, expected.num_rows)
    assert.deepEqual(mismatches(file, ctx, await readRows(ctx, 0, ctx.numRows, names), names, expected), [])
    for (const [a, b] of [[0, 37], [37, 111], [99, 101], [Math.max(0, ctx.numRows - 13), ctx.numRows]]) {
      if (b > ctx.numRows || a >= b) continue
      const part = await readRows(ctx, a, b, names)
      assert.equal(part.length, b - a)
      assert.deepEqual(mismatches(file, ctx, part, names, expected, a), [], `linhas [${a}, ${b})`)
    }
    // every value has display text
    const sample = await readRows(ctx, 0, Math.min(5, ctx.numRows), names)
    for (const row of sample) names.forEach((n, j) => { cellText(row[j], ctx.byName.get(n).desc) })
  })
}

const bigRanges = fs.existsSync(TESTDATA) ? fs.readdirSync(TESTDATA).filter(f => /^big_\w+\.parquet\.\d+-\d+\.expected\.json$/.test(f)) : []
for (const f of bigRanges) {
  const [, file, a, b] = f.match(/^(big_\w+\.parquet)\.(\d+)-(\d+)\.expected\.json$/)
  test(`${file} linhas [${a}, ${b}): leitura sob demanda`, async () => {
    const expected = JSON.parse(fs.readFileSync(path.join(TESTDATA, f), 'utf8'))
    const ctx = await openParquet(lib, fileSource(path.join(TESTDATA, file)))
    const names = ctx.columns.map(c => c.name)
    const rows = await readRows(ctx, Number(a), Number(b), names)
    assert.deepEqual(mismatches(file, ctx, rows, names, expected), [])
  })
}

for (const [file, message] of [['nao_parquet.bin', /não é Parquet/], ['truncado.parquet', /cortado/], ['cripto.parquet', /criptografado/]]) {
  test(`${file}: erro explicado`, { skip: !hasTestdata(file) && NO_TESTDATA }, async () => {
    await assert.rejects(openParquet(lib, fileSource(path.join(TESTDATA, file))), message)
  })
}
