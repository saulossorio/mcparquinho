// Pure search/filter/sort helpers over columns held in memory (keys, conditions, value lists).
import { formatDate, scalarText, serialize } from '../core/format.js'
import { PDate, PDec, PTime, PTimeOfDay } from '../core/values.js'

export const MAX_TABLE_CELLS = 5000000

export const EMPTY_KEY = '\u0000'

export const OUT_KEY = '\u0001'

export const TEXT_LEAF = { kind: 'leaf', cat: 'string', label: 'string' }

export const NON_ASCII = /[^\x00-\x7f]/

export function fold(s) {
  return NON_ASCII.test(s) ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : s.toLowerCase()
}

// Text that identifies a value in a column's value list and in searches.
export function keyOf(v, d) {
  if (v === undefined) return OUT_KEY
  if (v === null) return EMPTY_KEY
  if (d.kind === 'leaf') {
    const s = scalarText(v, d)
    if (s !== null) return s
  }
  return serialize(v, d, { limit: 2000 }).text
}

export function keyLabel(k) {
  if (k === EMPTY_KEY) return '(Vazias)'
  if (k === OUT_KEY) return '(fora da lista)'
  return k.length > 200 ? k.slice(0, 200) + '…' : k
}

export function sortFamily(d) {
  if (d.kind !== 'leaf') return 'text'
  switch (d.cat) {
    case 'int': case 'float': case 'date': case 'bool': return 'num'
    case 'bigint': case 'decimal': case 'timestamp': case 'time': return 'big'
    default: return 'text'
  }
}

// One comparable key per value (number, BigInt or folded text); null when empty.
export function sortKeyOf(v, d, fam = sortFamily(d)) {
  if (v === null || v === undefined) return null
  if (fam === 'num') {
    if (typeof v === 'number') return Number.isNaN(v) ? Infinity : v
    if (typeof v === 'boolean') return v ? 1 : 0
    if (v instanceof PDate) return v.days
    return null
  }
  if (fam === 'big') {
    if (typeof v === 'bigint') return v
    if (v instanceof PDec) return BigInt(v.text.replace('.', ''))
    if (v instanceof PTime || v instanceof PTimeOfDay) return v.ns
    if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v))
    return null
  }
  return fold(keyOf(v, d))
}

// Orders row indices by one column. Empty values go last in both directions; ties keep the current order.
export function sortIndices(indices, values, d, dir) {
  const fam = sortFamily(d)
  const n = indices.length
  const keys = new Array(n)
  for (let i = 0; i < n; i++) keys[i] = sortKeyOf(values[indices[i]], d, fam)
  const order = new Uint32Array(n)
  for (let i = 0; i < n; i++) order[i] = i
  order.sort((a, b) => {
    const ka = keys[a]
    const kb = keys[b]
    if (ka === null || kb === null) return ka === kb ? a - b : ka === null ? 1 : -1
    const c = ka < kb ? -1 : ka > kb ? 1 : 0
    return c ? c * dir : a - b
  })
  const out = new Uint32Array(n)
  for (let i = 0; i < n; i++) out[i] = indices[order[i]]
  return out
}

// Distinct values with counts, in the column's own order; empty values last.
export function distinctValues(indices, keys, values, d) {
  const counts = new Map()
  const first = new Map()
  for (const i of indices) {
    const k = keys[i]
    const c = counts.get(k)
    if (c === undefined) { counts.set(k, 1); first.set(k, i) } else counts.set(k, c + 1)
  }
  const fam = sortFamily(d)
  const entries = [...counts.keys()].map(k => ({ key: k, count: counts.get(k), sk: sortKeyOf(values[first.get(k)], d, fam) }))
  entries.sort((a, b) => {
    if (a.sk === null || b.sk === null) {
      if (a.sk === b.sk) return a.key < b.key ? -1 : 1
      return a.sk === null ? 1 : -1
    }
    if (a.sk < b.sk) return -1
    if (a.sk > b.sk) return 1
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })
  return entries
}

export const OPS = {
  num: [['eq', 'é igual a'], ['ne', 'é diferente de'], ['gt', 'é maior que'], ['ge', 'é maior ou igual a'], ['lt', 'é menor que'], ['le', 'é menor ou igual a'], ['between', 'está entre']],
  time: [['eq', 'é igual a'], ['ne', 'é diferente de'], ['gt', 'é depois de'], ['ge', 'é igual ou depois de'], ['lt', 'é antes de'], ['le', 'é igual ou antes de'], ['between', 'está entre']],
  text: [['contains', 'contém'], ['ncontains', 'não contém'], ['starts', 'começa com'], ['ends', 'termina com'], ['eq', 'é igual a'], ['ne', 'é diferente de']],
}

export function condFamily(d) {
  if (d.kind !== 'leaf') return 'text'
  switch (d.cat) {
    case 'int': case 'bigint': case 'float': case 'decimal': return 'num'
    case 'date': case 'timestamp': case 'time': return 'time'
    case 'bool': case 'null': return null
    default: return 'text'
  }
}

// Accepts 1234.5, 1234,5 and 1.234,5.
export function parseNumber(s) {
  let t = String(s).trim().replace(/\s/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null
  return { num: Number(t), big: /^[-+]?\d+$/.test(t) ? BigInt(t) : null }
}

export function daysFromCivil(y, m, d) {
  y -= m <= 2 ? 1 : 0
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

export const NS = { day: 86400000000000n, hour: 3600000000000n, minute: 60000000000n, second: 1000000000n }

// Clock "10", "10:30", "10:30:15" or "10:30:15.250" as [start, end) in ns of the day.
export function parseClock(h, mi, sec, frac) {
  if (h === undefined) return null
  const H = Number(h)
  const M = Number(mi ?? 0)
  const S = Number(sec ?? 0)
  if (H > 23 || M > 59 || S > 59) return null
  let lo = BigInt(H) * NS.hour + BigInt(M) * NS.minute + BigInt(S) * NS.second
  let step = mi === undefined ? NS.hour : sec === undefined ? NS.minute : NS.second
  if (frac !== undefined) {
    lo += BigInt(frac.padEnd(9, '0'))
    step = 10n ** BigInt(9 - frac.length)
  }
  return [lo, lo + step]
}

// Date, date-time or time typed in ISO (2026-08-01 10:30) or Brazilian (01/08/2026 10:30) form,
// as a [start, end) range in the column's key space.
export function parseMoment(s, d) {
  const t = String(s).trim()
  if (d.cat === 'time') {
    const m = /^(\d{1,2})(?::(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?$/.exec(t)
    return m ? parseClock(m[1], m[2], m[3], m[4]) : null
  }
  const clock = '(?:[ T](\\d{1,2})(?::(\\d{2})(?::(\\d{2})(?:[.,](\\d{1,9}))?)?)?Z?)?'
  let y, mo, day, rest
  let m = new RegExp(`^(-?\\d{4})-(\\d{1,2})-(\\d{1,2})${clock}$`).exec(t)
  if (m) [y, mo, day, ...rest] = m.slice(1)
  else {
    m = new RegExp(`^(\\d{1,2})/(\\d{1,2})/(\\d{4})${clock}$`).exec(t)
    if (!m) return null
    ;[day, mo, y, ...rest] = m.slice(1)
  }
  const Y = Number(y)
  const MO = Number(mo)
  const D = Number(day)
  if (MO < 1 || MO > 12 || D < 1 || D > 31) return null
  const days = daysFromCivil(Y, MO, D)
  if (formatDate(days) !== `${String(Y).padStart(4, '0')}-${String(MO).padStart(2, '0')}-${String(D).padStart(2, '0')}`) return null
  if (d.cat === 'date') return [days, days + 1]
  const base = BigInt(days) * NS.day
  if (rest[0] === undefined) return [base, base + NS.day]
  const c = parseClock(...rest)
  return c ? [base + c[0], base + c[1]] : null
}

export const numOf = v => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : v instanceof PDec ? Number(v.text) : NaN)

// Builds a test for one condition, or { error } explaining what to type.
export function makeCondition(cond, d) {
  const fam = condFamily(d)
  const { op } = cond
  const negative = op === 'ne' || op === 'ncontains'
  if (fam === 'text') {
    const q = fold(String(cond.a ?? ''))
    if (!q && op !== 'eq' && op !== 'ne') return { error: 'Digite o texto da condição.' }
    const test = k => {
      switch (op) {
        case 'contains': return k.includes(q)
        case 'ncontains': return !k.includes(q)
        case 'starts': return k.startsWith(q)
        case 'ends': return k.endsWith(q)
        case 'eq': return k === q
        default: return k !== q
      }
    }
    return { test: v => (v === null || v === undefined ? negative : test(fold(keyOf(v, d)))) }
  }
  if (fam === 'num') {
    const a = parseNumber(cond.a ?? '')
    const b = op === 'between' ? parseNumber(cond.b ?? '') : null
    if (!a || (op === 'between' && !b)) return { error: 'Digite um número, como 1234,5 ou 1234.5.' }
    const [lo, hi] = op === 'between' && b.num < a.num ? [b, a] : [a, b]
    const exact = d.cat === 'bigint' && lo.big !== null && (op !== 'between' || hi.big !== null)
    const test = v => {
      const x = exact && typeof v === 'bigint' ? v : numOf(v)
      const L = exact && typeof v === 'bigint' ? lo.big : lo.num
      if (typeof x === 'number' && Number.isNaN(x)) return false
      switch (op) {
        case 'eq': return x === L
        case 'ne': return x !== L
        case 'gt': return x > L
        case 'ge': return x >= L
        case 'lt': return x < L
        case 'le': return x <= L
        default: return x >= L && x <= (exact && typeof v === 'bigint' ? hi.big : hi.num)
      }
    }
    return { test: v => (v === null || v === undefined ? negative : test(v)) }
  }
  if (fam === 'time') {
    const ra = parseMoment(cond.a ?? '', d)
    const rb = op === 'between' ? parseMoment(cond.b ?? '', d) : null
    const hint = d.cat === 'time' ? 'Digite um horário, como 14:30 ou 14:30:15.' : d.cat === 'date'
      ? 'Digite uma data, como 2026-08-01 ou 01/08/2026.' : 'Digite uma data, com ou sem hora, como 01/08/2026 ou 2026-08-01 14:30.'
    if (!ra || (op === 'between' && !rb)) return { error: hint }
    const fam2 = sortFamily(d)
    const [r1, r2] = op === 'between' && rb[0] < ra[0] ? [rb, ra] : [ra, rb]
    const test = k => {
      switch (op) {
        case 'eq': return k >= r1[0] && k < r1[1]
        case 'ne': return !(k >= r1[0] && k < r1[1])
        case 'gt': return k >= r1[1]
        case 'ge': return k >= r1[0]
        case 'lt': return k < r1[0]
        case 'le': return k < r1[1]
        default: return k >= r1[0] && k < r2[1]
      }
    }
    return { test: v => { const k = sortKeyOf(v, d, fam2); return k === null ? negative : test(k) } }
  }
  return { error: 'Use a lista de valores para esta coluna.' }
}
