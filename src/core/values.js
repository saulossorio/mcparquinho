// Value types produced by the reader (exact timestamps, dates, decimals, binary) and byte helpers.
export const UNIT_NS = { ms: 1000000n, us: 1000n, ns: 1n }

export const UNIT_DIGITS = { ms: 3, us: 6, ns: 9 }

export const UNIT_LABEL = { ms: 'ms', us: 'µs', ns: 'ns' }

export const NS_PER_DAY = 86400000000000n

export class PTime { constructor(ns, unit) { this.ns = ns; this.unit = unit } }

export class PDate { constructor(days) { this.days = days } }

export class PTimeOfDay { constructor(ns, unit) { this.ns = ns; this.unit = unit } }

export class PDec { constructor(text) { this.text = text } }

export class PInterval { constructor(months, days, millis) { this.months = months; this.days = days; this.millis = millis } }

export class PMap { constructor(entries) { this.entries = entries } }

export class Bin {
  constructor(bytes) { this.bytes = bytes }
  toString() { return '0x' + hex(this.bytes) }
}

export const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))

export function hex(bytes, max = Infinity) {
  const n = Math.min(bytes.length, max)
  let s = ''
  for (let i = 0; i < n; i++) s += HEX[bytes[i]]
  return s
}

export const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

export const utf8Encoder = new TextEncoder()

export function textOrBin(bytes) {
  try { return strictUtf8.decode(bytes) } catch { return new Bin(bytes) }
}

export function toBytes(v) {
  if (v instanceof Uint8Array) return v
  if (v instanceof Bin) return v.bytes
  if (typeof v === 'string') return utf8Encoder.encode(v)
  return null
}

export const isPlainObject = x => x !== null && typeof x === 'object' && !Array.isArray(x) && !ArrayBuffer.isView(x) &&
  Object.getPrototypeOf(x) === Object.prototype
