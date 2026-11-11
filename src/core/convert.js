// hyparquet parsers and normalization of raw values into the exact types of values.js.
import { Bin, PDate, PDec, PInterval, PMap, PTime, PTimeOfDay, UNIT_NS, hex, isPlainObject, textOrBin, toBytes } from './values.js'

export function makeParsers(lib) {
  const geo = bytes => {
    if (bytes == null) return bytes
    try {
      return lib.wkbToGeojson({ view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), offset: 0 })
    } catch {
      return new Bin(bytes)
    }
  }
  return {
    timestampFromMilliseconds: v => new PTime(BigInt(v) * 1000000n, 'ms'),
    timestampFromMicroseconds: v => new PTime(BigInt(v) * 1000n, 'us'),
    timestampFromNanoseconds: v => new PTime(BigInt(v), 'ns'),
    dateFromDays: v => new PDate(Number(v)),
    stringFromBytes: b => (b == null ? b : textOrBin(b)),
    jsonFromBytes: b => (b == null ? b : textOrBin(b)),
    geometryFromBytes: geo,
    geographyFromBytes: geo,
  }
}

// hyparquet converts DECIMAL to float and rejects INTERVAL/BSON, so those leaves are read raw.
export function readMetadataFor(meta) {
  const raw = new Set(['DECIMAL', 'INTERVAL', 'BSON'])
  const schema = meta.schema.map(el => {
    if (!el.type) return el
    if (raw.has(el.converted_type) || raw.has(el.logical_type?.type)) {
      const copy = { ...el }
      delete copy.converted_type
      delete copy.logical_type
      return copy
    }
    return el
  })
  return { ...meta, schema }
}

export function signedFromBytes(bytes) {
  if (!bytes.length) return 0n
  let v = BigInt('0x' + hex(bytes))
  if (bytes[0] & 0x80) v -= 1n << BigInt(bytes.length * 8)
  return v
}

export function decimalText(unscaled, scale) {
  const neg = unscaled < 0n
  let s = (neg ? -unscaled : unscaled).toString()
  if (scale > 0) {
    s = s.padStart(scale + 1, '0')
    s = s.slice(0, s.length - scale) + '.' + s.slice(s.length - scale)
  } else if (scale < 0) {
    s += '0'.repeat(-scale)
  }
  return (neg ? '-' : '') + s
}

export function toDecimal(v, scale) {
  let unscaled
  if (typeof v === 'bigint') unscaled = v
  else if (typeof v === 'number') unscaled = BigInt(v)
  else {
    const b = toBytes(v)
    if (!b) return v
    unscaled = signedFromBytes(b)
  }
  return new PDec(decimalText(unscaled, scale))
}

export function normLeaf(v, d) {
  switch (d.cat) {
    case 'decimal': return toDecimal(v, d.scale)
    case 'time':
      return typeof v === 'number' || typeof v === 'bigint' ? new PTimeOfDay(BigInt(v) * UNIT_NS[d.unit], d.unit) : v
    case 'interval': {
      const b = toBytes(v)
      if (b && b.length === 12) {
        const dv = new DataView(b.buffer, b.byteOffset, 12)
        return new PInterval(dv.getUint32(0, true), dv.getUint32(4, true), dv.getUint32(8, true))
      }
      return b ? new Bin(b) : v
    }
    case 'bson': case 'fixed': {
      const b = toBytes(v)
      return b ? new Bin(b) : v
    }
    default: return v
  }
}

export function normalize(v, d) {
  if (v === null || v === undefined) return null
  switch (d.kind) {
    case 'leaf': return normLeaf(v, d)
    case 'list': return Array.isArray(v) ? v.map(x => normalize(x, d.item)) : v
    case 'map':
      return isPlainObject(v) ? new PMap(Object.entries(v).map(([k, x]) => [k, normalize(x, d.value)])) : v
    case 'struct': {
      if (!isPlainObject(v)) return v
      const o = {}
      for (const f of d.fields) o[f.name] = normalize(v[f.name], f.desc)
      return o
    }
    default: return v
  }
}
