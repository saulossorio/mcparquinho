// Search, filters and sort: loads whole columns into memory and computes the result list.
import { exportChunks, groupCache, readRows } from '../core/reader.js'
import { EMPTY_KEY, MAX_TABLE_CELLS, OUT_KEY, TEXT_LEAF, condFamily, fold, keyOf, makeCondition, sortIndices } from '../query/engine.js'
import { $, fmt, plural, sleep } from './dom.js'
import { loadPage, renderGrid } from './grid.js'
import { muniName } from './municipio.js'
import { renderRgMap } from './slider.js'
import { state } from './state.js'

export const MUNI_COL = String.fromCharCode(2) + 'municipio'

export function newQuery() { return { search: '', filters: new Map(), sort: null } }

export const cloneQuery = q => ({ search: q.search, filters: new Map(q.filters), sort: q.sort && { ...q.sort } })

export const queryActive = () => !!(state.query.search.trim() || state.query.filters.size || state.query.sort)

export const listLength = () => (state.result ? state.result.length : state.ctx ? state.ctx.numRows : 0)

export const colLabel = name => (name === MUNI_COL ? 'município' : name)

export const colDesc = name => (name === MUNI_COL ? TEXT_LEAF : state.ctx.byName.get(name).desc)

export function colValues(name) {
  const t = state.table
  if (name !== MUNI_COL) return t.cols.get(name)
  let v = t.cols.get(MUNI_COL)
  if (!v) {
    const src = t.cols.get(state.muni)
    v = new Array(src.length)
    for (let i = 0; i < src.length; i++) v[i] = muniName(src[i])
    t.cols.set(MUNI_COL, v)
  }
  return v
}

export function colKeys(name) {
  const t = state.table
  let k = t.keys.get(name)
  if (!k) {
    const vals = colValues(name)
    const d = colDesc(name)
    k = new Array(vals.length)
    for (let i = 0; i < vals.length; i++) k[i] = keyOf(vals[i], d)
    t.keys.set(name, k)
  }
  return k
}

export function colFolded(name) {
  const t = state.table
  let f = t.folded.get(name)
  if (!f) {
    const keys = colKeys(name)
    f = new Array(keys.length)
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      f[i] = k === EMPTY_KEY || k === OUT_KEY ? '' : fold(k)
    }
    t.folded.set(name, f)
  }
  return f
}

export function dropMuniCaches() {
  const t = state.table
  if (t) { t.cols.delete(MUNI_COL); t.keys.delete(MUNI_COL); t.folded.delete(MUNI_COL) }
}

// Loads whole columns into memory (once each), in the order the requests arrive.
export function ensureTable(names, report) {
  const run = () => ensureTableNow(names, report)
  state.tableChain = (state.tableChain ?? Promise.resolve()).then(run, run)
  return state.tableChain
}

export async function ensureTableNow(names, report) {
  const { ctx } = state
  if (!state.table) state.table = { cols: new Map(), keys: new Map(), folded: new Map() }
  const t = state.table
  const need = [...new Set(names.flatMap(n => (n === MUNI_COL ? (state.muni ? [state.muni] : []) : [n])))]
  const missing = need.filter(n => !t.cols.has(n))
  if (!missing.length) return { ok: true }
  const loaded = [...t.cols.keys()].filter(n => n !== MUNI_COL).length
  const cells = ctx.numRows * (loaded + missing.length)
  if (cells > MAX_TABLE_CELLS) {
    return {
      ok: false,
      error: `Para buscar, filtrar ou ordenar, a página carrega as colunas usadas do arquivo inteiro na memória: seriam ${fmt(ctx.numRows)} linhas × ${fmt(loaded + missing.length)} colunas, acima do limite de ${fmt(MAX_TABLE_CELLS)} células. Oculte colunas em Colunas e tente de novo.`,
    }
  }
  const token = state.tableToken
  const arrays = missing.map(() => new Array(ctx.numRows))
  const cache = groupCache(ctx.file)
  let done = 0
  try {
    for (const [a, b, g] of exportChunks(ctx, 0, ctx.numRows)) {
      cache.setGroup(g)
      const rows = await readRows(ctx, a, b, missing, cache.buffer)
      if (token !== state.tableToken) return { ok: false, stale: true }
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        for (let j = 0; j < missing.length; j++) arrays[j][a + i] = r[j]
      }
      done += rows.length
      report?.(`Carregando ${plural(ctx.numRows, 'linha', 'linhas')} para buscar, filtrar e ordenar… ${Math.floor(done / ctx.numRows * 100)}%`)
      await sleep(0)
    }
  } catch (e) {
    return { ok: false, error: `Não foi possível ler o arquivo: ${e?.message || e}` }
  }
  if (token !== state.tableToken) return { ok: false, stale: true }
  missing.forEach((n, j) => t.cols.set(n, arrays[j]))
  return { ok: true }
}

export function searchColumns() {
  const cols = state.visible.slice()
  if (state.muni && state.visible.includes(state.muni)) cols.push(MUNI_COL)
  return cols
}

export function filterTest(name, f) {
  const keys = f.only || f.except ? colKeys(name) : null
  const values = colValues(name)
  const cond = f.cond ? makeCondition(f.cond, colDesc(name)) : null
  return i => {
    if (f.only && !f.only.has(keys[i])) return false
    if (f.except && f.except.has(keys[i])) return false
    if (cond && cond.test && !cond.test(values[i])) return false
    return true
  }
}

// Rows that pass the search and every filter except the one on `exceptName`.
export function passingIndices(exceptName) {
  const n = state.ctx.numRows
  const tests = []
  for (const [name, f] of state.query.filters) if (name !== exceptName) tests.push(filterTest(name, f))
  const q = fold(state.query.search.trim())
  const folded = q ? searchColumns().map(colFolded) : []
  const out = new Uint32Array(n)
  let m = 0
  outer: for (let i = 0; i < n; i++) {
    for (const t of tests) if (!t(i)) continue outer
    if (q) {
      let hit = false
      for (const f of folded) if (f[i].includes(q)) { hit = true; break }
      if (!hit) continue
    }
    out[m++] = i
  }
  return out.slice(0, m)
}

export function setQueryStatus(text) { renderQueryBar(text, 'busy') }

export function sortWords(name, dir) {
  const fam = condFamily(colDesc(name))
  if (fam === 'num') return dir > 0 ? 'do menor para o maior' : 'do maior para o menor'
  if (fam === 'time') return dir > 0 ? 'do mais antigo para o mais recente' : 'do mais recente para o mais antigo'
  if (fam === null) return dir > 0 ? 'falso primeiro' : 'verdadeiro primeiro'
  return dir > 0 ? 'de A a Z' : 'de Z a A'
}

export function renderQueryBar(message, kind) {
  const bar = $('qbar')
  bar.classList.toggle('error', kind === 'error')
  if (message) {
    $('qbar-text').textContent = message
    $('qbar-clear').hidden = !queryActive()
    bar.hidden = false
    return
  }
  if (!state.ctx || !state.result) { bar.hidden = true; return }
  const parts = [`Mostrando ${fmt(state.result.length)} de ${plural(state.ctx.numRows, 'linha', 'linhas')}`]
  const q = state.query.search.trim()
  if (q) parts.push(`busca “${q}”`)
  if (state.query.filters.size) parts.push(`filtro em ${[...state.query.filters.keys()].map(colLabel).join(', ')}`)
  if (state.query.sort) parts.push(`ordem por ${colLabel(state.query.sort.name)}, ${sortWords(state.query.sort.name, state.query.sort.dir)}`)
  $('qbar-text').textContent = parts.join(' · ')
  $('qbar-clear').hidden = false
  bar.hidden = false
}

// Recomputes the result list. Returns false when the columns could not be loaded.
export async function applyQuery() {
  const token = ++state.queryToken
  if (!queryActive()) {
    state.result = null
    state.page = 0
    state.active = null
    renderQueryBar()
    renderRgMap()
    await loadPage()
    return true
  }
  const q = state.query
  const names = [...new Set([...state.visible, ...q.filters.keys(), ...(q.sort ? [q.sort.name] : []), ...(q.search.trim() ? searchColumns() : [])])]
  const wrap = $('grid-wrap')
  wrap.classList.add('busy')
  $('loadbar').hidden = false
  setQueryStatus('Preparando…')
  try {
    const res = await ensureTable(names, setQueryStatus)
    if (token !== state.queryToken) return true
    if (!res.ok) {
      if (!res.stale) renderQueryBar(res.error, 'error')
      return false
    }
    setQueryStatus('Aplicando…')
    await sleep(0)
    let result = passingIndices(null)
    if (q.sort) result = sortIndices(result, colValues(q.sort.name), colDesc(q.sort.name), q.sort.dir)
    if (token !== state.queryToken) return true
    state.result = result
  } finally {
    if (token === state.queryToken) { wrap.classList.remove('busy'); $('loadbar').hidden = true }
  }
  state.page = 0
  state.active = null
  wrap.scrollTop = 0
  renderQueryBar()
  renderRgMap()
  await loadPage()
  return true
}

// Changes the query; puts it back if the change cannot be applied.
export async function commitQuery(mutate) {
  const prev = cloneQuery(state.query)
  mutate(state.query)
  const ok = await applyQuery()
  if (!ok) {
    const message = $('qbar-text').textContent
    state.query = prev
    $('q').value = prev.search
    if (state.rows.length) renderGrid()
    renderQueryBar(message, 'error')
  }
  return ok
}
