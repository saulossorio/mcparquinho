// Streaming .xlsx writer (OOXML + ZIP with native deflate) and the cell rules for Excel.
import { floatText, formatDate, formatTimestamp, scalarText, serialize } from './format.js'
import { ParquetError, exportChunks, groupCache, plainChunks, readRows } from './reader.js'
import { Bin, PDate, PDec, PTime, PTimeOfDay, hex, toBytes } from './values.js'

export const EXCEL_MAX_DATA_ROWS = 1048575

export const EXCEL_MAX_COLUMNS = 16384

export const EXCEL_MAX_TEXT = 32767

export const EXCEL_EPOCH = 25569 // 1970-01-01 as an Excel serial day

export const EXCEL_MIN_SERIAL = 61 // 1900-03-01, first day after Excel's 1900 leap-year bug

export const EXCEL_MAX_SERIAL = 2958466 // 10000-01-01

export const FMT_DATE = 'yyyy-mm-dd'

export const FMT_TIMESTAMP = 'yyyy-mm-dd hh:mm:ss.000'

export const FMT_TIME = 'hh:mm:ss.000'

export const fitText = s => (s.length > EXCEL_MAX_TEXT ? s.slice(0, EXCEL_MAX_TEXT - 1) + '…' : s)

export const significantDigits = s => s.replace(/^-/, '').replace('.', '').replace(/^0+/, '').length

export const numberLiteral = v => (Object.is(v, -0) ? '0' : String(v).toUpperCase())

// Cell for one value: t 'n' (v is a numeric literal), 'b' or 's'; z is a number format.
export function excelCell(v, d, exact = true) {
  if (v === null || v === undefined) return null
  if (d.kind === 'leaf') {
    if (typeof v === 'boolean') return { t: 'b', v }
    if (typeof v === 'number') return Number.isFinite(v) ? { t: 'n', v: numberLiteral(v) } : { t: 's', v: floatText(v, d) }
    if (typeof v === 'bigint') {
      const s = v.toString()
      return !exact || significantDigits(s) <= 15 ? { t: 'n', v: s } : { t: 's', v: s }
    }
    if (v instanceof PDec) {
      if (exact && significantDigits(v.text) > 15) return { t: 's', v: v.text }
      return d.scale > 0 ? { t: 'n', v: v.text, z: '0.' + '0'.repeat(Math.min(d.scale, 15)) } : { t: 'n', v: v.text }
    }
    if (v instanceof PDate) {
      const serial = v.days + EXCEL_EPOCH
      if (serial >= EXCEL_MIN_SERIAL && serial < EXCEL_MAX_SERIAL) return { t: 'n', v: String(serial), z: FMT_DATE }
      return { t: 's', v: formatDate(v.days) }
    }
    if (v instanceof PTime) {
      const ms = v.ns / 1000000n - (v.ns % 1000000n < 0n ? 1n : 0n)
      const serial = Number(ms) / 86400000 + EXCEL_EPOCH
      if (serial >= EXCEL_MIN_SERIAL && serial < EXCEL_MAX_SERIAL) return { t: 'n', v: numberLiteral(serial), z: FMT_TIMESTAMP }
      return { t: 's', v: formatTimestamp(v.ns, v.unit, d.utc) }
    }
    if (v instanceof PTimeOfDay) return { t: 'n', v: numberLiteral(Number(v.ns / 1000000n) / 86400000), z: FMT_TIME }
    if (v instanceof Bin || v instanceof Uint8Array) {
      return { t: 's', v: '0x' + hex(toBytes(v), (EXCEL_MAX_TEXT - 3) >> 1) }
    }
    if (typeof v === 'string') return { t: 's', v: fitText(v) }
    const s = scalarText(v, d)
    if (s !== null) return { t: 's', v: fitText(s) }
  }
  return { t: 's', v: fitText(serialize(v, d, { limit: EXCEL_MAX_TEXT, fullBinary: true }).text) }
}

export function excelWidth(d, name) {
  const base = Math.max(8, Math.min(name.length + 3, 40))
  if (d.kind !== 'leaf') return Math.max(base, 30)
  const min = { timestamp: 23, date: 11, time: 13, decimal: 16, bigint: 16, string: 24, json: 30, binary: 24, uuid: 37 }[d.cat]
  return Math.max(base, min ?? 10)
}

// XML text: escapes markup, Excel's own _xHHHH_ sequences and characters XML 1.0 forbids.
export function xmlText(s) {
  return s
    .replace(/_(x[0-9A-Fa-f]{4}_)/g, '_x005F_$1')
    .replace(/[&<>"]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g,
      c => '_x' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') + '_')
}

export function columnLetters(index) {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(crc, bytes) {
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)
  return crc
}

export function deflateRawSupported() {
  try { new CompressionStream('deflate-raw'); return true } catch { return false }
}

// Compresses whatever produce() writes; keeps compressed output as Blobs.
export async function zipEntry(name, produce) {
  const encoder = new TextEncoder()
  let crc = 0xFFFFFFFF
  let size = 0
  let compSize = 0
  const parts = []
  if (deflateRawSupported()) {
    const cs = new CompressionStream('deflate-raw')
    const writer = cs.writable.getWriter()
    const reader = cs.readable.getReader()
    const pump = (async () => {
      let pending = []
      let bytes = 0
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        pending.push(value)
        bytes += value.length
        compSize += value.length
        if (bytes > 8 << 20) { parts.push(new Blob(pending)); pending = []; bytes = 0 }
      }
      if (pending.length) parts.push(new Blob(pending))
    })()
    try {
      await produce(async text => {
        const chunk = encoder.encode(text)
        crc = crc32(crc, chunk)
        size += chunk.length
        await writer.write(chunk)
      })
      await writer.close()
    } catch (e) {
      writer.abort(e).catch(() => {})
      pump.catch(() => {})
      throw e
    }
    await pump
    return { name, crc: (crc ^ 0xFFFFFFFF) >>> 0, size, compSize, parts, method: 8 }
  }
  await produce(async text => {
    const chunk = encoder.encode(text)
    crc = crc32(crc, chunk)
    size += chunk.length
    parts.push(chunk)
  })
  return { name, crc: (crc ^ 0xFFFFFFFF) >>> 0, size, compSize: size, parts, method: 0 }
}

export function zipBlob(entries) {
  const now = new Date()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const out = []
  const central = []
  let offset = 0
  const enc = new TextEncoder()
  for (const e of entries) {
    if (e.size > 0xFFFFFFFE || offset > 0xFFFFFFFE) throw new ParquetError('A planilha passou de 4 GB, o limite deste exportador. Exporte menos linhas ou colunas.')
    const name = enc.encode(e.name)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0, true)
    local.setUint16(8, e.method, true)
    local.setUint16(10, time, true)
    local.setUint16(12, date, true)
    local.setUint32(14, e.crc, true)
    local.setUint32(18, e.compSize, true)
    local.setUint32(22, e.size, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    out.push(local.buffer, name, ...e.parts)
    const cd = new DataView(new ArrayBuffer(46))
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true)
    cd.setUint16(6, 20, true)
    cd.setUint16(8, 0, true)
    cd.setUint16(10, e.method, true)
    cd.setUint16(12, time, true)
    cd.setUint16(14, date, true)
    cd.setUint32(16, e.crc, true)
    cd.setUint32(20, e.compSize, true)
    cd.setUint32(24, e.size, true)
    cd.setUint16(28, name.length, true)
    cd.setUint32(42, offset, true)
    central.push(cd.buffer, name)
    offset += 30 + name.length + e.compSize
  }
  const cdSize = central.reduce((n, p) => n + p.byteLength, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, cdSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...out, ...central, end.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// Output columns: the file's columns plus derived ones (text computed from a source column), in order.
export const TEXT_DESC = { kind: 'leaf', cat: 'string', label: 'string' }

export function outputColumns(ctx, names, derived = []) {
  const cols = []
  names.forEach((n, j) => {
    cols.push({ header: n, desc: ctx.byName.get(n).desc, get: row => row[j] })
    for (const d of derived) {
      if (d.after === j) cols.push({ header: d.header, desc: TEXT_DESC, get: row => d.value(row[j]) ?? null })
    }
  })
  return cols
}

export const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

export const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

export const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

export const NS_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'

export async function writeXlsx(ctx, { start, end, names, derived, read, onProgress, isCancelled, exact = true, sheetName = 'Dados' }) {
  const cols = outputColumns(ctx, names, derived)
  if (end - start > EXCEL_MAX_DATA_ROWS) throw new ParquetError(`O Excel aceita até ${EXCEL_MAX_DATA_ROWS.toLocaleString('pt-BR')} linhas por planilha.`)
  if (cols.length > EXCEL_MAX_COLUMNS) throw new ParquetError(`O Excel aceita até ${EXCEL_MAX_COLUMNS.toLocaleString('pt-BR')} colunas.`)
  const letters = cols.map((_, k) => columnLetters(k))
  const total = end - start
  const lastRef = `${letters[letters.length - 1]}${total + 1}`
  const formats = new Map() // format code -> style index (0 normal, 1 header)
  const styleFor = z => {
    let s = formats.get(z)
    if (s === undefined) { s = formats.size + 2; formats.set(z, s) }
    return s
  }
  const cache = groupCache(ctx.file)
  let done = 0

  const sheet = await zipEntry('xl/worksheets/sheet1.xml', async write => {
    let xml = XML_HEAD + `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><dimension ref="A1:${lastRef}"/>` +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>' +
      cols.map((c, k) => `<col min="${k + 1}" max="${k + 1}" width="${excelWidth(c.desc, c.header)}" customWidth="1"/>`).join('') +
      '</cols><sheetData><row r="1">' +
      cols.map((c, k) => `<c r="${letters[k]}1" t="inlineStr" s="1"><is><t xml:space="preserve">${xmlText(fitText(c.header))}</t></is></c>`).join('') +
      '</row>'
    for (const [a, b, g] of read ? plainChunks(start, end) : exportChunks(ctx, start, end)) {
      if (isCancelled?.()) throw new DOMException('Exportação cancelada', 'AbortError')
      cache.setGroup(g)
      const rows = read ? await read(a, b) : await readRows(ctx, a, b, names, cache.buffer)
      for (let i = 0; i < rows.length; i++) {
        const r = done + i + 2
        const row = rows[i]
        xml += `<row r="${r}">`
        for (let k = 0; k < cols.length; k++) {
          const cell = excelCell(cols[k].get(row), cols[k].desc, exact)
          if (!cell) continue
          const ref = letters[k] + r
          if (cell.t === 'n') xml += cell.z ? `<c r="${ref}" s="${styleFor(cell.z)}"><v>${cell.v}</v></c>` : `<c r="${ref}"><v>${cell.v}</v></c>`
          else if (cell.t === 'b') xml += `<c r="${ref}" t="b"><v>${cell.v ? 1 : 0}</v></c>`
          else xml += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlText(cell.v)}</t></is></c>`
        }
        xml += '</row>'
        if (xml.length > 1 << 20) { await write(xml); xml = '' }
      }
      done += rows.length
      onProgress?.(done, total)
      await new Promise(r => setTimeout(r, 0))
    }
    await write(xml + `</sheetData><autoFilter ref="A1:${lastRef}"/></worksheet>`)
  })

  const numFmts = [...formats.keys()].map((code, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xmlText(code)}"/>`).join('')
  const xfs = [...formats.keys()].map((_, i) => `<xf numFmtId="${164 + i}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join('')
  const styles = XML_HEAD + `<styleSheet xmlns="${NS_MAIN}">` +
    (formats.size ? `<numFmts count="${formats.size}">${numFmts}</numFmts>` : '') +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${formats.size + 2}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>${xfs}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
  const quotedSheet = `'${sheetName.replace(/'/g, "''")}'`
  const absRef = `$A$1:$${letters[letters.length - 1]}$${total + 1}`
  const workbook = XML_HEAD + `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView/></bookViews>` +
    `<sheets><sheet name="${xmlText(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
    `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">${xmlText(quotedSheet)}!${absRef}</definedName></definedNames></workbook>`
  const workbookRels = XML_HEAD + `<Relationships xmlns="${NS_PKG}">` +
    `<Relationship Id="rId1" Type="${NS_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`
  const rootRels = XML_HEAD + `<Relationships xmlns="${NS_PKG}">` +
    `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  const contentTypes = XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'
  const small = async (name, text) => zipEntry(name, async write => write(text))
  const entries = [
    await small('[Content_Types].xml', contentTypes),
    await small('_rels/.rels', rootRels),
    await small('xl/workbook.xml', workbook),
    await small('xl/_rels/workbook.xml.rels', workbookRels),
    await small('xl/styles.xml', styles),
    sheet,
  ]
  return zipBlob(entries)
}
