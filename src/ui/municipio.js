// Optional "município" column: code → name lookup, detection of the code column, selector.
import MUNICIPIOS_TSV from '../../data/municipios-mt.tsv'
import { PDec } from '../core/values.js'
import { updateColsCount } from './columns.js'
import { $, esc } from './dom.js'
import { loadPage, renderGrid } from './grid.js'
import { MUNI_COL, applyQuery, dropMuniCaches, queryActive } from './query-state.js'
import { state } from './state.js'

/** Código → nome, from data/municipios-mt.tsv (one "código<TAB>NOME" per line; lines starting with # are comments). */
export const MUNICIPIOS = new Map(MUNICIPIOS_TSV.split(/\r?\n/)
  .filter(line => line.trim() && !line.startsWith('#'))
  .map(line => {
    const [code, ...name] = line.split('\t')
    return [code.trim(), name.join(' ').trim()]
  }))

export const MUNI_CATS = new Set(['int', 'bigint', 'string', 'decimal', 'enum'])

export function codeKey(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 ? String(v) : null
  if (typeof v === 'bigint') return v >= 0n ? v.toString() : null
  if (v instanceof PDec) {
    const m = /^(\d+)(?:\.0+)?$/.exec(v.text)
    return m ? m[1].replace(/^0+(?=\d)/, '') : null
  }
  if (typeof v === 'string') {
    const t = v.trim()
    return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, '') : null
  }
  return null
}

// null: no code in the cell; undefined: a code that is not in the list
export function muniName(v) {
  const k = codeKey(v)
  return k === null ? null : MUNICIPIOS.get(k)
}

export const isMuniCandidate = c => c.desc.kind === 'leaf' && MUNI_CATS.has(c.desc.cat)

export function renderMuniSelect() {
  const { ctx } = state
  const cands = ctx.columns.filter(isMuniCandidate)
  $('muni-field').hidden = !cands.length
  $('muni-col').innerHTML = '<option value="">não mostrar</option>' +
    cands.map(c => `<option value="${esc(c.name)}"${c.name === state.muni ? ' selected' : ''}>de ${esc(c.name)}</option>`).join('')
}

// The visible column whose codes are mostly in the list, judged on the rows already loaded.
export function detectMuni() {
  const { ctx, rows } = state
  let best = ''
  let bestRate = 0
  state.visible.forEach((name, j) => {
    if (!isMuniCandidate(ctx.byName.get(name))) return
    let n = 0
    let hit = 0
    for (const row of rows) {
      const k = codeKey(row[j])
      if (k !== null) { n++; if (MUNICIPIOS.has(k)) hit++ }
    }
    if (n && hit / n > bestRate) { bestRate = hit / n; best = name }
  })
  return bestRate >= 0.6 ? best : ''
}

export function setMuni(name) {
  state.muniAuto = false
  state.muni = name
  state.active = null
  dropMuniCaches()
  if (state.query.filters.has(MUNI_COL) || state.query.sort?.name === MUNI_COL || queryActive()) {
    state.query.filters.delete(MUNI_COL)
    if (state.query.sort?.name === MUNI_COL) state.query.sort = null
    if (name && !state.visible.includes(name)) {
      const order = state.ctx.columns.map(c => c.name)
      state.visible = order.filter(n => n === name || state.visible.includes(n))
      const box = $('col-list').querySelector(`input[data-name="${CSS.escape(name)}"]`)
      if (box) box.checked = true
      updateColsCount()
    }
    applyQuery()
    return
  }
  if (name && !state.visible.includes(name)) {
    const order = state.ctx.columns.map(c => c.name)
    state.visible = order.filter(n => n === name || state.visible.includes(n))
    const box = $('col-list').querySelector(`input[data-name="${CSS.escape(name)}"]`)
    if (box) box.checked = true
    updateColsCount()
    loadPage()
  } else if (state.rows.length) renderGrid()
}

export function viewColumns() {
  const out = []
  state.visible.forEach((name, j) => {
    out.push({ j })
    if (name === state.muni) out.push({ j, muni: true })
  })
  return out
}

export function muniDerived(names) {
  const j = state.muni ? names.indexOf(state.muni) : -1
  return j < 0 ? [] : [{ after: j, header: `${state.muni} (município)`, value: muniName }]
}
