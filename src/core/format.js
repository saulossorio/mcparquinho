// Text for values: dates, timestamps, numbers, binary, JSON-like nested values, statistics.
import { decimalText, signedFromBytes } from './convert.js'
import { Bin, NS_PER_DAY, PDate, PDec, PInterval, PMap, PTime, PTimeOfDay, UNIT_DIGITS, UNIT_NS, hex, isPlainObject, toBytes } from './values.js'

export function civil(days) {
  let z = days + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0)
  return [y, m, d]
}

export const p2 = n => String(n).padStart(2, '0')

export function yearText(y) {
  if (y < 0) return '-' + String(-y).padStart(4, '0')
  if (y > 9999) return '+' + y
  return String(y).padStart(4, '0')
}

export function formatDate(days) {
  const [y, m, d] = civil(days)
  return `${yearText(y)}-${p2(m)}-${p2(d)}`
}

export function clockText(nsOfDay, unit) {
  const secs = nsOfDay / 1000000000n
  const frac = nsOfDay % 1000000000n
  const h = Number(secs / 3600n)
  const mi = Number((secs / 60n) % 60n)
  const s = Number(secs % 60n)
  let out = `${p2(h)}:${p2(mi)}:${p2(s)}`
  if (frac) out += '.' + frac.toString().padStart(9, '0').slice(0, UNIT_DIGITS[unit] ?? 9).replace(/0+$/, '')
  return out
}

export function formatTimestamp(ns, unit, utc) {
  let days = ns / NS_PER_DAY
  let rem = ns % NS_PER_DAY
  if (rem < 0n) { rem += NS_PER_DAY; days -= 1n }
  return `${formatDate(Number(days))} ${clockText(rem, unit)}${utc ? 'Z' : ''}`
}

export function formatTimeOfDay(ns, unit) {
  const r = ((ns % NS_PER_DAY) + NS_PER_DAY) % NS_PER_DAY
  return clockText(r, unit)
}

export function f32Text(v) {
  for (let p = 1; p <= 9; p++) {
    const s = v.toPrecision(p)
    if (Math.fround(Number(s)) === v) return String(Number(s))
  }
  return String(v)
}

export function f16Text(v) {
  if (typeof Math.f16round === 'function') {
    for (let p = 1; p <= 5; p++) {
      const s = v.toPrecision(p)
      if (Math.f16round(Number(s)) === v) return String(Number(s))
    }
  }
  return String(Number(v.toPrecision(5)))
}

export function floatText(v, d) {
  if (Number.isNaN(v)) return 'NaN'
  if (v === Infinity) return 'Infinity'
  if (v === -Infinity) return '-Infinity'
  if (Object.is(v, -0)) return '-0'
  if (d?.f32) return f32Text(v)
  if (d?.f16) return f16Text(v)
  return String(v)
}

export function binText(bytes, max = 32) {
  if (!bytes.length) return '0x (vazio)'
  if (bytes.length <= max) return '0x' + hex(bytes)
  return `0x${hex(bytes, max)}… (${bytes.length.toLocaleString('pt-BR')} bytes)`
}

export function intervalText(v) {
  const parts = []
  parts.push(`${v.months} ${v.months === 1 ? 'mês' : 'meses'}`)
  parts.push(`${v.days} ${v.days === 1 ? 'dia' : 'dias'}`)
  parts.push(`${v.millis} ms`)
  return parts.join(', ')
}

// Text for one scalar, or null when the value is not a scalar.
export function scalarText(v, d) {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number') return d?.cat === 'float' || !Number.isInteger(v) ? floatText(v, d) : String(v)
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (v instanceof PDec) return v.text
  if (v instanceof PTime) return formatTimestamp(v.ns, v.unit, d?.utc)
  if (v instanceof PDate) return formatDate(v.days)
  if (v instanceof PTimeOfDay) return formatTimeOfDay(v.ns, v.unit)
  if (v instanceof Bin) return binText(v.bytes)
  if (v instanceof PInterval) return intervalText(v)
  if (v instanceof Uint8Array) return binText(v)
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString()
  return null
}

// JSON-like text for any value; numbers stay exact (bigint, decimal) and special values become strings.
export function serialize(value, desc, { pretty = false, limit = Infinity, fullBinary = false } = {}) {
  let out = ''
  let full = false
  const push = s => {
    if (full) return
    if (out.length + s.length > limit) { out += s.slice(0, limit - out.length); full = true } else out += s
  }
  const nl = depth => (pretty ? '\n' + '  '.repeat(depth) : '')
  function walk(x, d, depth) {
    if (full) return
    if (x === null || x === undefined) return push('null')
    if (Array.isArray(x)) return seq(x, d?.kind === 'list' ? d.item : null, depth)
    if (x instanceof PMap) return obj(x.entries.map(([k, v]) => [k, v, d?.kind === 'map' ? d.value : null]), depth)
    if (d?.kind === 'struct' && isPlainObject(x)) return obj(d.fields.map(f => [f.name, x[f.name], f.desc]), depth)
    if (fullBinary && (x instanceof Bin || x instanceof Uint8Array)) return push(JSON.stringify('0x' + hex(toBytes(x))))
    const leaf = d?.kind === 'leaf' ? d : null
    const s = scalarText(x, leaf)
    if (s !== null) {
      if (typeof x === 'boolean' || x instanceof PDec || typeof x === 'bigint') return push(s)
      if (typeof x === 'number') return push(Number.isFinite(x) ? s : JSON.stringify(s))
      return push(JSON.stringify(s))
    }
    if (ArrayBuffer.isView(x) && !(x instanceof DataView)) return seq(Array.from(x), null, depth)
    if (typeof x === 'object') return obj(Object.entries(x).map(([k, v]) => [k, v, null]), depth)
    return push(JSON.stringify(String(x)))
  }
  function seq(arr, itemDesc, depth) {
    if (!arr.length) return push('[]')
    push('[')
    for (let i = 0; i < arr.length && !full; i++) {
      if (i) push(pretty ? ',' : ', ')
      push(nl(depth + 1))
      walk(arr[i], itemDesc, depth + 1)
    }
    push(nl(depth) + ']')
  }
  function obj(entries, depth) {
    if (!entries.length) return push('{}')
    push('{')
    for (let i = 0; i < entries.length && !full; i++) {
      if (i) push(pretty ? ',' : ', ')
      push(nl(depth + 1))
      push(JSON.stringify(entries[i][0]) + ': ')
      walk(entries[i][1], entries[i][2], depth + 1)
    }
    push(nl(depth) + '}')
  }
  walk(value, desc, 0)
  return { text: out, truncated: full }
}

// One-line text for a table cell. Returns null for null values.
export function cellText(v, d, limit = 400) {
  if (v === null || v === undefined) return null
  if (d.kind === 'leaf') {
    if (d.cat === 'geo' && typeof v === 'object' && !(v instanceof Bin)) return serialize(v, null, { limit }).text
    const s = scalarText(v, d)
    if (s !== null) {
      const t = s.length > limit ? s.slice(0, limit) + '…' : s
      return t.replace(/\r\n|\r|\n/g, ' ↵ ').replace(/\t/g, ' ')
    }
  }
  const { text, truncated } = serialize(v, d, { limit })
  return truncated ? text + '…' : text
}

export function statText(v, d) {
  if (v === null || v === undefined) return ''
  if (d.cat === 'geo') return ''
  if (d.cat === 'decimal') {
    if (typeof v === 'number') {
      const fixed = Math.abs(v) < 1e21 ? v.toFixed(Math.min(d.scale, 100)) : String(v)
      return Math.abs(v) * 10 ** d.scale > Number.MAX_SAFE_INTEGER ? '≈ ' + fixed : fixed
    }
    const b = toBytes(v)
    return b ? decimalText(signedFromBytes(b), d.scale) : String(v)
  }
  if (d.cat === 'time' && (typeof v === 'number' || typeof v === 'bigint')) {
    return formatTimeOfDay(BigInt(v) * UNIT_NS[d.unit], d.unit)
  }
  if ((d.cat === 'interval' || d.cat === 'bson' || d.cat === 'fixed') && toBytes(v)) return binText(toBytes(v), 24)
  const s = scalarText(v, d)
  if (s === null) return ''
  return s.length > 120 ? s.slice(0, 120) + '…' : s
}
