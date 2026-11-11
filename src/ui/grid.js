// Data grid: page loading (file or result list), table rendering, pager, keyboard.
import { cellText } from '../core/format.js'
import { readRows } from '../core/reader.js'
import { family } from '../core/types.js'
import { openDetail } from './detail.js'
import { $, esc, fmt } from './dom.js'
import { listIdx, markRange, markRow, refreshMarks } from './marks.js'
import { detectMuni, muniName, renderMuniSelect, viewColumns } from './municipio.js'
import { MUNI_COL, colLabel, ensureTable, listLength, renderQueryBar, setQueryStatus } from './query-state.js'
import { positionMarker } from './slider.js'
import { state } from './state.js'

export const FUNNEL = '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M1 1.5h10L7.2 6.4V10L4.8 11.2V6.4Z" fill="currentColor"/></svg>'

export async function loadPage() {
  const { ctx } = state
  if (!ctx) return
  if (state.result) return loadQueryPage()
  state.rowNums = null
  const total = ctx.numRows
  const pages = Math.max(1, Math.ceil(total / state.pageSize))
  state.page = Math.min(Math.max(0, state.page), pages - 1)
  const start = state.page * state.pageSize
  const end = Math.min(total, start + state.pageSize)
  renderPager()
  positionMarker()
  $('data-error').hidden = true
  if (!total || !state.visible.length) {
    state.rows = []
    state.rowStart = start
    $('grid').innerHTML = ''
    $('grid-empty').hidden = false
    $('grid-empty').textContent = !total
      ? 'Este arquivo não tem linhas. O esquema e os metadados estão nas outras abas.'
      : 'Nenhuma coluna selecionada. Escolha ao menos uma em Colunas.'
    return
  }
  const token = ++state.token
  const wrap = $('grid-wrap')
  const showBusy = () => { if (token === state.token) { wrap.classList.add('busy'); $('loadbar').hidden = false } }
  const busyTimer = setTimeout(showBusy, $('grid').rows.length ? 120 : 0)
  try {
    const rows = await readRows(ctx, start, end, state.visible, state.buffer)
    if (token !== state.token) return
    state.rows = rows
    state.rowStart = start
    $('grid-empty').hidden = true
    if (state.muniAuto && !state.muni) {
      state.muni = detectMuni()
      if (state.muni) renderMuniSelect()
    }
    renderGrid()
  } catch (e) {
    if (token !== state.token) return
    $('data-error').textContent = `Não foi possível ler as linhas ${fmt(start + 1)}–${fmt(end)}: ${e?.message || e}`
    $('data-error').hidden = false
  } finally {
    clearTimeout(busyTimer)
    if (token === state.token) { wrap.classList.remove('busy'); $('loadbar').hidden = true }
  }
}

// A page of the filtered or sorted list, straight from memory.
export async function loadQueryPage() {
  const total = state.result.length
  const pages = Math.max(1, Math.ceil(total / state.pageSize))
  state.page = Math.min(Math.max(0, state.page), pages - 1)
  const start = state.page * state.pageSize
  const end = Math.min(total, start + state.pageSize)
  renderPager()
  positionMarker()
  $('data-error').hidden = true
  if (!state.visible.length) {
    state.rows = []
    $('grid').innerHTML = ''
    $('grid-empty').hidden = false
    $('grid-empty').textContent = 'Nenhuma coluna selecionada. Escolha ao menos uma em Colunas.'
    return
  }
  if (state.visible.some(n => !state.table?.cols.has(n))) {
    const res = await ensureTable(state.visible, setQueryStatus)
    if (!res.ok) { if (!res.stale) renderQueryBar(res.error, 'error'); return }
    renderQueryBar()
  }
  const cols = state.visible.map(n => state.table.cols.get(n))
  const idxs = state.result.subarray(start, end)
  state.rows = Array.from(idxs, i => cols.map(c => c[i]))
  state.rowNums = Array.from(idxs, i => i + 1)
  state.rowStart = start
  $('grid-empty').hidden = total > 0
  $('grid-empty').textContent = 'Nenhuma linha corresponde à busca e aos filtros.'
  renderGrid()
}

export function renderPager() {
  const total = listLength()
  const pages = Math.max(1, Math.ceil(total / state.pageSize))
  const start = state.page * state.pageSize
  const end = Math.min(total, start + state.pageSize)
  $('pg-range').innerHTML = total ? `Linhas <strong>${fmt(start + 1)}–${fmt(end)}</strong> de ${fmt(total)}${state.result ? ' no resultado' : ''}` : state.result ? 'Nenhuma linha no resultado' : 'Sem linhas'
  for (const el of $('goto-form').elements) el.disabled = !!state.result
  $('goto-form').title = state.result ? 'Indisponível com busca, filtro ou ordem ativos' : ''
  $('pg-first').disabled = $('pg-prev').disabled = state.page <= 0
  $('pg-next').disabled = $('pg-last').disabled = state.page >= pages - 1
  $('goto-row').max = String(Math.max(1, total))
  $('goto-row').placeholder = total ? `1 a ${fmt(total)}` : ''
  const bar = $('rgbar')
  bar.setAttribute('aria-valuemax', String(Math.max(1, total)))
  bar.setAttribute('aria-valuenow', String(total ? start + 1 : 1))
  bar.setAttribute('aria-valuetext', total ? `Linhas ${fmt(start + 1)} a ${fmt(end)} de ${fmt(total)}` : 'Sem linhas')
}

export function renderGrid() {
  const { ctx, rows, rowStart } = state
  const cols = state.visible.map(n => ctx.byName.get(n))
  const fams = cols.map(c => family(c.desc))
  const view = viewColumns()
  state.view = view
  let h = '<thead><tr><th class="rn" scope="col"><span class="selcell"><input type="checkbox" id="sel-all" ' +
    'aria-label="Marcar todas as linhas da lista" title="Marcar ou desmarcar todas as linhas da lista atual"><span>#</span></span></th>'
  const q = state.query
  const hbtn = qname => {
    const filtered = q.filters.has(qname)
    const dir = q.sort?.name === qname ? q.sort.dir : 0
    const icon = (filtered ? FUNNEL : '') + (dir ? (dir > 0 ? '↑' : '↓') : '') || '▾'
    return `<button type="button" class="hbtn${filtered || dir ? ' on' : ''}"${qname === MUNI_COL ? ' data-mc="1"' : ` data-q="${esc(qname)}"`} ` +
      `aria-label="Ordenar e filtrar ${esc(colLabel(qname))}" title="Ordenar e filtrar">${icon}</button>`
  }
  for (const vc of view) {
    const c = cols[vc.j]
    if (vc.muni) h += `<th scope="col" class="virt" title="Nome do município para o código em ${esc(c.name)}. Não faz parte do arquivo."><div class="hcell"><div class="hname"><span class="cn">município</span><span class="ct">de ${esc(c.name)}</span></div>${hbtn(MUNI_COL)}</div></th>`
    else h += `<th scope="col" class="f-${fams[vc.j]}" title="${esc(c.name)} · ${esc(c.desc.label)}"><div class="hcell"><div class="hname"><span class="cn">${esc(c.name)}</span><span class="ct">${esc(c.desc.label)}</span></div>${hbtn(c.name)}</div></th>`
  }
  h += '</tr></thead><tbody>'
  for (let i = 0; i < rows.length; i++) {
    const num = fmt(state.rowNums ? state.rowNums[i] : rowStart + i + 1)
    h += `<tr><th class="rn" scope="row"><span class="selcell"><input type="checkbox" class="selrow" data-r="${i}" aria-label="Marcar linha ${num}"><span>${num}</span></span></th>`
    const row = rows[i]
    for (let k = 0; k < view.length; k++) {
      const vc = view[k]
      if (vc.muni) {
        const name = muniName(row[vc.j])
        h += name === null ? `<td data-c="${k}" class="virt nul">null</td>`
          : name === undefined ? `<td data-c="${k}" class="virt miss" title="Código fora da lista">—</td>`
            : `<td data-c="${k}" class="virt">${esc(name)}</td>`
        continue
      }
      const t = cellText(row[vc.j], cols[vc.j].desc, 300)
      h += t === null ? `<td data-c="${k}" class="nul">null</td>` : `<td data-c="${k}" class="f-${fams[vc.j]}">${esc(t)}</td>`
    }
    h += '</tr>'
  }
  $('grid').innerHTML = h + '</tbody>'
  refreshMarks()
  if (state.active) setActive(state.active.r, state.active.c, false)
}

export function goToPage(p) {
  state.page = p
  state.active = null
  $('grid-wrap').scrollTop = 0
  loadPage()
}

export async function goToRow(n) {
  const total = state.ctx.numRows
  if (!total) return
  const row = Math.min(Math.max(1, Math.floor(n)), total) - 1
  state.page = Math.floor(row / state.pageSize)
  state.active = { r: row - state.page * state.pageSize, c: state.active?.c ?? 0 }
  await loadPage()
  const td = cellEl(state.active.r, state.active.c)
  if (td) td.scrollIntoView({ block: 'center', inline: 'nearest' })
}

export function cellEl(r, c) {
  const tr = $('grid').tBodies[0]?.rows[r]
  return tr ? tr.cells[c + 1] : null
}

export function setActive(r, c, scroll = true) {
  const rows = state.rows.length
  const cols = state.view.length
  if (!rows || !cols) return
  r = Math.min(Math.max(0, r), rows - 1)
  c = Math.min(Math.max(0, c), cols - 1)
  $('grid').querySelector('td.active')?.classList.remove('active')
  state.active = { r, c }
  const td = cellEl(r, c)
  if (!td) return
  td.classList.add('active')
  if (scroll) td.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

export function onGridKey(e) {
  if (!state.rows.length) return
  const a = state.active ?? { r: 0, c: 0 }
  const pages = Math.ceil(listLength() / state.pageSize)
  switch (e.key) {
    case 'ArrowDown': setActive(a.r + 1, a.c); break
    case 'ArrowUp': setActive(a.r - 1, a.c); break
    case 'ArrowRight': setActive(a.r, a.c + 1); break
    case 'ArrowLeft': setActive(a.r, a.c - 1); break
    case 'Home': setActive(a.r, 0); break
    case 'End': setActive(a.r, state.view.length - 1); break
    case 'PageDown': if (state.page < pages - 1) goToPage(state.page + 1); break
    case 'PageUp': if (state.page > 0) goToPage(state.page - 1); break
    case 'Enter':
      if (!state.active) setActive(a.r, a.c)
      openDetail(state.active.r, state.active.c)
      break
    case ' ': {
      if (!state.active) setActive(a.r, a.c)
      const pos = state.rowStart + state.active.r
      const idx = listIdx(pos)
      if (e.shiftKey && state.sel.anchor !== null) markRange(state.sel.anchor, pos, true)
      else markRow(idx, state.sel.marks[idx] !== 1)
      state.sel.anchor = pos
      refreshMarks()
      break
    }
    default: return
  }
  e.preventDefault()
}
