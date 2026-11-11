// The .xlsx writer: a valid ZIP (CRC checked), the OOXML parts Excel needs, exact numbers, dates as
// Excel dates, escaping of characters XML forbids, derived columns and readers from memory.
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import zlib from 'node:zlib'
import { openParquet, writeXlsx, xmlText } from '../../src/core/index.js'
import { NO_TESTDATA, TESTDATA, fileSource, hasTestdata, lib } from './helpers.mjs'

// Minimal ZIP reader: central directory → { name: text }.
function unzip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let eocd = buf.length - 22
  while (dv.getUint32(eocd, true) !== 0x06054b50) eocd--
  const count = dv.getUint16(eocd + 10, true)
  let p = dv.getUint32(eocd + 16, true)
  const files = {}
  for (let i = 0; i < count; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50)
    const method = dv.getUint16(p + 10, true)
    const crc = dv.getUint32(p + 16, true)
    const csize = dv.getUint32(p + 20, true)
    const nameLen = dv.getUint16(p + 28, true)
    const local = dv.getUint32(p + 42, true)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString()
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true)
    const raw = buf.subarray(start, start + csize)
    const data = method === 8 ? zlib.inflateRawSync(raw) : raw
    assert.equal(zlib.crc32(data), crc, `CRC de ${name}`)
    files[name] = data.toString('utf8')
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true)
  }
  return files
}
const cell = (sheet, ref) => sheet.match(new RegExp(`<c r="${ref}"[^>]*>(.*?)</c>`))?.[0] ?? ''

test('xmlText: marcação, _xHHHH_ literal e caracteres de controle', () => {
  assert.equal(xmlText('a & <b> "c"'), 'a &amp; &lt;b&gt; &quot;c&quot;')
  assert.equal(xmlText('lit _x0041_'), 'lit _x005F_x0041_')
  assert.equal(xmlText('ctrl ' + String.fromCharCode(1)), 'ctrl _x0001_')
})

test('types.parquet: partes do pacote, números exatos, datas do Excel', { skip: !hasTestdata('types.parquet') && NO_TESTDATA }, async () => {
  const ctx = await openParquet(lib, fileSource(path.join(TESTDATA, 'types.parquet')))
  const names = ['i64', 'dec38_10', 'dec9_2', 'd32', 'ts_us', 'b', 's', 'st']
  const blob = await writeXlsx(ctx, { start: 0, end: 10, names })
  const files = unzip(Buffer.from(await blob.arrayBuffer()))
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
    assert.ok(files[part], `falta ${part}`)
  }
  const sheet = files['xl/worksheets/sheet1.xml']
  assert.match(sheet, /<pane ySplit="1"/)
  assert.match(sheet, /<autoFilter ref="A1:H11"\/>/)
  assert.match(cell(sheet, 'A3'), /9223372036854775807/) // int64 máximo: texto exato
  assert.match(cell(sheet, 'A3'), /inlineStr/)
  assert.match(cell(sheet, 'B3'), /1234567890123456789012345678\.1234567890/)
  assert.match(cell(sheet, 'C4'), /<v>-9999999\.99<\/v>/) // decimal curto: número
  assert.match(cell(sheet, 'D3'), /inlineStr.*1900-01-01/) // antes de 1900-03-01: texto
  assert.match(cell(sheet, 'D5'), /<v>25569<\/v>/) // 1970-01-01 como data do Excel
  assert.match(files['xl/styles.xml'], /formatCode="yyyy-mm-dd hh:mm:ss\.000"/)
})

test('coluna derivada e leitura a partir da memória', { skip: !hasTestdata('types.parquet') && NO_TESTDATA }, async () => {
  const ctx = await openParquet(lib, fileSource(path.join(TESTDATA, 'types.parquet')))
  const rows = [[1], [2], [3]]
  const blob = await writeXlsx(ctx, {
    start: 0, end: 3, names: ['i8'], read: async (a, b) => rows.slice(a, b),
    derived: [{ after: 0, header: 'i8 (dobro)', value: v => String(v * 2) }],
  })
  const sheet = unzip(Buffer.from(await blob.arrayBuffer()))['xl/worksheets/sheet1.xml']
  assert.match(cell(sheet, 'B1'), /i8 \(dobro\)/)
  assert.match(cell(sheet, 'B4'), /<t xml:space="preserve">6<\/t>/)
})
