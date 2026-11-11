// Type descriptors: what each Parquet column is (leaf category, label, list/map/struct shape).
import { UNIT_LABEL } from './values.js'

export const TIME_UNITS = { MILLIS: 'ms', MICROS: 'us', NANOS: 'ns' }

export function describeLeaf(el) {
  const phys = el.type
  const ct = el.converted_type
  const lt = el.logical_type
  const lty = lt?.type
  const d = { kind: 'leaf', phys }
  const set = (cat, label, extra) => Object.assign(d, { cat, label }, extra)
  if (lty === 'NULL') set('null', 'null')
  else if (ct === 'DECIMAL' || lty === 'DECIMAL') {
    const scale = el.scale ?? lt?.scale ?? 0
    const precision = el.precision ?? lt?.precision
    set('decimal', `decimal(${precision ?? '?'},${scale})`, { scale, precision })
  } else if (phys === 'INT96') set('timestamp', 'timestamp[ns] int96', { unit: 'ns', utc: false, int96: true })
  else if (ct === 'DATE' || lty === 'DATE') set('date', 'date')
  else if (lty === 'TIMESTAMP' || ct === 'TIMESTAMP_MILLIS' || ct === 'TIMESTAMP_MICROS') {
    const unit = lty === 'TIMESTAMP' ? TIME_UNITS[lt.unit] ?? 'ms' : ct === 'TIMESTAMP_MILLIS' ? 'ms' : 'us'
    const utc = lty === 'TIMESTAMP' ? !!lt.isAdjustedToUTC : true
    set('timestamp', `timestamp[${UNIT_LABEL[unit]}${utc ? ', UTC' : ''}]`, { unit, utc })
  } else if (lty === 'TIME' || ct === 'TIME_MILLIS' || ct === 'TIME_MICROS') {
    const unit = lty === 'TIME' ? TIME_UNITS[lt.unit] ?? 'ms' : ct === 'TIME_MILLIS' ? 'ms' : 'us'
    set('time', `time[${UNIT_LABEL[unit]}]`, { unit, utc: lty === 'TIME' ? !!lt.isAdjustedToUTC : true })
  } else if (ct === 'INTERVAL' || lty === 'INTERVAL') set('interval', 'interval')
  else if (ct === 'BSON' || lty === 'BSON') set('bson', 'bson')
  else if (ct === 'JSON' || lty === 'JSON') set('json', 'json')
  else if (ct === 'ENUM' || lty === 'ENUM') set('enum', 'enum')
  else if (lty === 'UUID') set('uuid', 'uuid')
  else if (lty === 'FLOAT16') set('float', 'float16', { f16: true })
  else if (lty === 'GEOMETRY' || lty === 'GEOGRAPHY') set('geo', lty.toLowerCase())
  else if (ct === 'UTF8' || lty === 'STRING') set('string', 'string')
  else if (phys === 'BOOLEAN') set('bool', 'boolean')
  else if (phys === 'INT32' || phys === 'INT64') {
    let bits = phys === 'INT32' ? 32 : 64
    let signed = true
    if (lty === 'INTEGER') { bits = lt.bitWidth; signed = lt.isSigned }
    else if (ct && ct.startsWith('UINT_')) { bits = Number(ct.slice(5)); signed = false }
    else if (ct && ct.startsWith('INT_')) bits = Number(ct.slice(4))
    set(phys === 'INT64' ? 'bigint' : 'int', `${signed ? 'int' : 'uint'}${bits}`, { bits, signed })
  } else if (phys === 'FLOAT') set('float', 'float', { f32: true })
  else if (phys === 'DOUBLE') set('float', 'double')
  else if (phys === 'BYTE_ARRAY') set('binary', 'binary')
  else if (phys === 'FIXED_LEN_BYTE_ARRAY') set('fixed', `fixed[${el.type_length}]`)
  else set('unknown', String(phys ?? '?'))
  return d
}

// Mirrors hyparquet's assembly (assemble.js) so every value meets the descriptor of its shape.
export function describe(node, lib, asElement = false) {
  const el = node.element
  let d
  if (lib.isListLike(node)) {
    let sub = node.children[0]
    if (sub.children.length === 1) sub = sub.children[0]
    const item = describe(sub, lib, true)
    d = { kind: 'list', item, label: `list<${item.label}>` }
  } else if (lib.isMapLike(node)) {
    const kv = node.children[0]
    const key = describe(kv.children[0], lib, true)
    const value = describe(kv.children[1], lib, true)
    d = { kind: 'map', key, value, label: `map<${key.label}, ${value.label}>` }
  } else if (node.children.length) {
    if (el.logical_type?.type === 'VARIANT') d = { kind: 'variant', label: 'variant' }
    else {
      const fields = node.children.map(c => ({ name: c.element.name, desc: describe(c, lib) }))
      d = { kind: 'struct', fields, label: 'struct' }
    }
  } else {
    d = describeLeaf(el)
  }
  if (el.repetition_type === 'REPEATED' && !asElement) {
    return { kind: 'list', item: d, label: `list<${d.label}>` }
  }
  return d
}

// Text group used for alignment and badges in the table.
export function family(d) {
  if (d.kind !== 'leaf') return 'nested'
  switch (d.cat) {
    case 'int': case 'bigint': case 'float': case 'decimal': return 'number'
    case 'date': case 'timestamp': case 'time': case 'interval': return 'time'
    case 'bool': return 'bool'
    case 'binary': case 'fixed': case 'bson': return 'binary'
    default: return 'text'
  }
}
