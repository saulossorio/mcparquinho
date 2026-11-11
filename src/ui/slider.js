// Row-group slider: draw segments, place the page marker, drag/click/keyboard navigation.
import { $, bytesText, fmt, plural } from './dom.js'
import { goToPage } from './grid.js'
import { listLength } from './query-state.js'
import { MAX_RG_SEGMENTS, state } from './state.js'

export function renderRgMap() {
  const { ctx } = state
  const bar = $('rgbar')
  bar.querySelectorAll('.rgseg').forEach(n => n.remove())
  $('rg-label').textContent = state.result ? plural(state.result.length, 'linha no resultado', 'linhas no resultado') : plural(ctx.rowGroups.length, 'row group', 'row groups')
  const dense = !!state.result || ctx.rowGroups.length > MAX_RG_SEGMENTS || !ctx.numRows
  bar.classList.toggle('dense', dense)
  if (!dense) {
    const frag = document.createDocumentFragment()
    for (const g of ctx.rowGroups) {
      const b = document.createElement('div')
      b.className = 'rgseg'
      b.dataset.g = g.index
      b.style.flexGrow = String(g.rows)
      b.title = `Row group ${fmt(g.index + 1)}: linhas ${fmt(g.start + 1)}–${fmt(g.start + g.rows)} (${plural(g.rows, 'linha', 'linhas')}, ${bytesText(g.compressed)})`
      frag.append(b)
    }
    bar.prepend(frag)
  }
  $('rgmap').hidden = false
}

export function groupOf(row) {
  const groups = state.ctx.rowGroups
  let lo = 0
  let hi = groups.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (groups[mid].start <= row) lo = mid
    else hi = mid - 1
  }
  return lo
}

// Places the marker over the segment(s) that hold the current page, or the page being dragged to.
export function positionMarker(preview) {
  const { ctx } = state
  const mark = $('rgmark')
  const total = listLength()
  if (!ctx || !total) { mark.hidden = true; $('rg-where').textContent = ''; return }
  if (state.drag && !preview) return
  const start = preview ? preview[0] : state.page * state.pageSize
  const end = preview ? preview[1] : Math.min(total, start + state.pageSize)
  const bar = $('rgbar')
  const segs = bar.querySelectorAll('.rgseg')
  const width = bar.clientWidth
  const at = row => {
    if (!segs.length) return (row / total) * width
    const g = Math.min(groupOf(Math.min(row, ctx.numRows - 1)), segs.length - 1)
    const grp = ctx.rowGroups[g]
    const seg = segs[g]
    const frac = grp.rows ? Math.min(1, (row - grp.start) / grp.rows) : 0
    return seg.offsetLeft + frac * seg.offsetWidth
  }
  const left = at(start)
  const right = end >= total && segs.length ? segs[segs.length - 1].offsetLeft + segs[segs.length - 1].offsetWidth : at(end)
  mark.hidden = false
  mark.style.left = `${Math.max(0, left - 2)}px`
  mark.style.width = `${Math.max(6, right - left + 4)}px`
  if (state.result) {
    $('rg-where').textContent = `${preview ? 'Ir para' : 'Página atual:'} posições ${fmt(start + 1)}–${fmt(end)}`
    return
  }
  const g1 = groupOf(start)
  const g2 = groupOf(Math.max(start, end - 1))
  const groups = g1 === g2 ? `row group ${fmt(g1 + 1)}` : `row groups ${fmt(g1 + 1)}–${fmt(g2 + 1)}`
  $('rg-where').textContent = preview ? `Linhas ${fmt(start + 1)}–${fmt(end)} · ${groups}` : `Página atual ${g1 === g2 ? 'no' : 'nos'} ${groups}`
}

export function rowAtX(clientX) {
  const { ctx } = state
  const bar = $('rgbar')
  const x = clientX - bar.getBoundingClientRect().left
  const segs = state.result ? [] : bar.querySelectorAll('.rgseg')
  const total = listLength()
  const last = total - 1
  if (!segs.length) return Math.min(last, Math.max(0, Math.floor(x / bar.clientWidth * total)))
  for (let g = 0; g < segs.length; g++) {
    const seg = segs[g]
    if (x < seg.offsetLeft + seg.offsetWidth + 1 || g === segs.length - 1) {
      const grp = ctx.rowGroups[g]
      const frac = Math.min(1, Math.max(0, (x - seg.offsetLeft) / Math.max(1, seg.offsetWidth)))
      return Math.min(last, grp.start + Math.min(Math.max(0, grp.rows - 1), Math.floor(frac * grp.rows)))
    }
  }
  return last
}

export let scrubTimer = 0

export function scrubTo(clientX) {
  const row = rowAtX(clientX)
  const page = Math.floor(row / state.pageSize)
  state.drag.row = row
  const start = page * state.pageSize
  positionMarker([start, Math.min(listLength(), start + state.pageSize)])
  clearTimeout(scrubTimer)
  if (page !== state.page) scrubTimer = setTimeout(() => { if (state.drag && page !== state.page) goToPage(page) }, 150)
}

export function endDrag() {
  const drag = state.drag
  if (!drag) return
  state.drag = null
  clearTimeout(scrubTimer)
  $('rgbar').classList.remove('dragging')
  const page = Math.floor(drag.row / state.pageSize)
  if (page !== state.page) goToPage(page)
  else positionMarker()
}

export function onSliderKey(e) {
  if (!state.ctx || !listLength()) return
  const pages = Math.ceil(listLength() / state.pageSize)
  const step = Math.max(1, Math.round(pages / 10))
  let p = state.page
  switch (e.key) {
    case 'ArrowRight': case 'ArrowUp': p += 1; break
    case 'ArrowLeft': case 'ArrowDown': p -= 1; break
    case 'PageUp': p += step; break
    case 'PageDown': p -= step; break
    case 'Home': p = 0; break
    case 'End': p = pages - 1; break
    default: return
  }
  e.preventDefault()
  p = Math.min(pages - 1, Math.max(0, p))
  if (p !== state.page) goToPage(p)
}
