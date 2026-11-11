// Column picker (show/hide columns).
import { $, esc, fmt } from './dom.js'
import { loadPage } from './grid.js'
import { applyQuery, queryActive, renderQueryBar } from './query-state.js'
import { MAX_DEFAULT_COLUMNS, state } from './state.js'

export function renderPicker() {
  const { ctx } = state
  const vis = new Set(state.visible)
  $('col-filter').value = ''
  $('col-list').innerHTML = ctx.columns.map(c =>
    `<li><label><input type="checkbox" data-name="${esc(c.name)}"${vis.has(c.name) ? ' checked' : ''}>` +
    `<span class="n" title="${esc(c.name)}">${esc(c.name)}</span><span class="ct">${esc(c.desc.label)}</span></label></li>`).join('')
  updateColsCount()
}

export function updateColsCount() {
  const n = state.visible.length
  const total = state.ctx.columns.length
  $('cols-count').textContent = n === total ? fmt(total) : `${fmt(n)}/${fmt(total)}`
  const hint = $('cols-hint')
  hint.hidden = !state.capped
  if (state.capped) hint.textContent = `Este arquivo tem ${fmt(total)} colunas. A tabela começou com as ${fmt(MAX_DEFAULT_COLUMNS)} primeiras; escolha outras em Colunas.`
}

export let reloadTimer = 0

export function columnsChanged() {
  const boxes = $('col-list').querySelectorAll('input[type="checkbox"]')
  const prev = state.visible
  state.visible = [...boxes].filter(b => b.checked).map(b => b.dataset.name)
  state.capped = false
  state.active = null
  updateColsCount()
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(async () => {
    if (!queryActive()) return loadPage()
    if (await applyQuery()) return
    const message = $('qbar-text').textContent
    state.visible = prev
    for (const b of boxes) b.checked = prev.includes(b.dataset.name)
    updateColsCount()
    await applyQuery()
    renderQueryBar(message, 'error')
  }, 300)
}

export function togglePicker(show) {
  const picker = $('picker')
  const open = show ?? picker.hidden
  picker.hidden = !open
  $('cols-btn').setAttribute('aria-expanded', String(open))
  if (!open) return
  const r = $('cols-btn').getBoundingClientRect()
  const vh = document.documentElement.clientHeight
  const below = vh - r.bottom - 14
  const above = r.top - 14
  const up = below < 260 && above > below
  picker.classList.toggle('up', up)
  picker.style.maxHeight = `${Math.round(Math.max(160, up ? above : below))}px`
  $('col-filter').focus()
}
