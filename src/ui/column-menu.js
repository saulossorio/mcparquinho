// Column header menu: sort, condition, value list with search; keeps itself inside the window.
import { EMPTY_KEY, OPS, OUT_KEY, condFamily, distinctValues, fold, keyLabel, makeCondition } from '../query/engine.js'
import { $, esc, fmt } from './dom.js'
import { colDesc, colKeys, colLabel, colValues, commitQuery, ensureTable, passingIndices, sortWords } from './query-state.js'
import { state } from './state.js'

export function closeMenu() {
  const m = state.menu
  state.menu = null
  $('hmenu').hidden = true
  if (m?.anchor?.isConnected) m.anchor.focus({ preventScroll: true })
}

// Opens below the button when it fits, above when there is more room there, and otherwise
// uses the whole window height; never leaves part of the menu outside the window.
export function placeMenu(anchor) {
  const menu = $('hmenu')
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  const r = anchor.getBoundingClientRect()
  menu.style.maxHeight = 'none'
  menu.style.width = `${Math.min(310, vw - 16)}px`
  const w = menu.offsetWidth
  const natural = menu.scrollHeight
  const below = vh - r.bottom - 12
  const above = r.top - 12
  let maxH
  let top
  if (natural <= below || below >= above) {
    maxH = Math.min(natural, below)
    top = r.bottom + 4
  } else {
    maxH = Math.min(natural, above)
    top = r.top - 4 - maxH
  }
  if (maxH < Math.min(natural, 300)) {
    maxH = Math.min(natural, vh - 16)
    top = (vh - maxH) / 2
  }
  menu.style.maxHeight = `${Math.round(maxH)}px`
  menu.style.top = `${Math.round(Math.max(8, top))}px`
  menu.style.left = `${Math.round(Math.max(8, Math.min(r.right - w, vw - w - 8)))}px`
}

export async function openMenu(name, anchor) {
  const d = colDesc(name)
  const fam = condFamily(d)
  const f = state.query.filters.get(name)
  const m = state.menu = { name, d, anchor, entries: [], excluded: new Set(), ready: false }
  const label = colLabel(name)
  $('hm-asc').textContent = `↑ Ordenar ${sortWords(name, 1)}`
  $('hm-desc').textContent = `↓ Ordenar ${sortWords(name, -1)}`
  $('hm-unsort').hidden = state.query.sort?.name !== name
  $('hm-clear').textContent = `Limpar o filtro de “${label}”`
  $('hm-clear').disabled = !f
  $('hm-cond').hidden = !fam
  if (fam) {
    $('hm-op').innerHTML = '<option value="">qualquer valor</option>' + OPS[fam].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')
    $('hm-op').value = f?.cond?.op ?? ''
    $('hm-a').value = f?.cond?.a ?? ''
    $('hm-b').value = f?.cond?.b ?? ''
    const ph = fam === 'num' ? '1234,5' : fam === 'time' ? (d.cat === 'time' ? '14:30' : '01/08/2026') : 'texto'
    $('hm-a').placeholder = ph
    $('hm-b').placeholder = ph
    syncCondArgs()
  }
  $('hm-search').value = ''
  $('hm-error').hidden = true
  $('hm-list').innerHTML = ''
  $('hm-all').checked = true
  $('hm-note').textContent = 'Carregando os valores da coluna…'
  $('hmenu').setAttribute('aria-label', `Ordenar e filtrar ${label}`)
  $('hmenu').hidden = false
  placeMenu(anchor)
  $('hm-asc').focus()
  const res = await ensureTable([name], t => { if (state.menu === m) $('hm-note').textContent = t })
  if (state.menu !== m) return
  if (!res.ok) {
    $('hm-note').textContent = ''
    $('hm-error').textContent = res.error || 'Não foi possível carregar os valores.'
    $('hm-error').hidden = !!res.stale
    return
  }
  const values = colValues(name)
  m.entries = distinctValues(passingIndices(name), colKeys(name), values, d)
  if (f?.except) for (const e of m.entries) if (f.except.has(e.key)) m.excluded.add(e.key)
  if (f?.only) for (const e of m.entries) if (!f.only.has(e.key)) m.excluded.add(e.key)
  m.ready = true
  renderMenuList()
}

export function syncCondArgs() {
  const op = $('hm-op').value
  $('hm-args').hidden = !op
  $('hm-and').hidden = $('hm-b').hidden = op !== 'between'
}

export function renderMenuList() {
  const m = state.menu
  if (!m?.ready) return
  const q = fold($('hm-search').value.trim())
  const shown = []
  let matches = 0
  for (let i = 0; i < m.entries.length; i++) {
    if (q && !fold(keyLabel(m.entries[i].key)).includes(q)) continue
    matches++
    if (shown.length < 1000) shown.push(i)
  }
  m.shown = shown
  $('hm-list').innerHTML = shown.map(i => {
    const e = m.entries[i]
    const special = e.key === EMPTY_KEY || e.key === OUT_KEY
    return `<li><label><input type="checkbox" data-i="${i}"${m.excluded.has(e.key) ? '' : ' checked'}>` +
      `<span class="v${special ? ' dim' : ''}" title="${esc(keyLabel(e.key))}">${esc(keyLabel(e.key))}</span><span class="cnt">${fmt(e.count)}</span></label></li>`
  }).join('')
  $('hm-all').checked = shown.every(i => !m.excluded.has(m.entries[i].key))
  $('hm-note').textContent = !m.entries.length ? 'Nenhum valor nas linhas que passam pelos outros filtros.'
    : matches > shown.length ? `Mostrando ${fmt(shown.length)} de ${fmt(matches)} valores. Use a busca para achar outros.`
      : q && !matches ? 'Nenhum valor encontrado.' : ''
  if (!m.placed && m.anchor?.isConnected) { m.placed = true; placeMenu(m.anchor) }
}

export function applyMenu() {
  const m = state.menu
  if (!m) return
  const f = {}
  const q = fold($('hm-search').value.trim())
  if (m.ready) {
    if (q) {
      const only = new Set()
      for (const e of m.entries) if (fold(keyLabel(e.key)).includes(q) && !m.excluded.has(e.key)) only.add(e.key)
      f.only = only
    } else if (m.excluded.size) f.except = new Set(m.excluded)
  } else {
    const prev = state.query.filters.get(m.name)
    if (prev?.only) f.only = prev.only
    if (prev?.except) f.except = prev.except
  }
  const op = condFamily(m.d) ? $('hm-op').value : ''
  if (op) {
    const cond = { op, a: $('hm-a').value, b: $('hm-b').value }
    const check = makeCondition(cond, m.d)
    if (check.error) {
      $('hm-error').textContent = check.error
      $('hm-error').hidden = false
      $('hm-a').focus()
      return
    }
    f.cond = cond
  }
  const name = m.name
  closeMenu()
  commitQuery(qy => { if (f.only || f.except || f.cond) qy.filters.set(name, f); else qy.filters.delete(name) })
}

export function menuSort(dir) {
  const name = state.menu?.name
  if (!name) return
  closeMenu()
  commitQuery(q => { q.sort = dir ? { name, dir } : null })
}
