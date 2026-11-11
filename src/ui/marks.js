// Row marks (checkbox next to the row number) and the counter.
import { $, fmt, plural } from './dom.js'
import { listLength } from './query-state.js'
import { state } from './state.js'

export const listIdx = pos => (state.result ? state.result[pos] : pos)

export function markRow(i, on) {
  const sel = state.sel
  if ((sel.marks[i] === 1) !== on) {
    sel.marks[i] = on ? 1 : 0
    sel.count += on ? 1 : -1
  }
}

export function markRange(a, b, on) {
  for (let p = Math.min(a, b); p <= Math.max(a, b); p++) markRow(listIdx(p), on)
}

export function markAllInList(on) {
  const sel = state.sel
  if (!state.result) {
    sel.marks.fill(on ? 1 : 0)
    sel.count = on ? sel.marks.length : 0
  } else for (const i of state.result) markRow(i, on)
  sel.anchor = null
}

export function marksInList() {
  const sel = state.sel
  if (!state.result) return sel.count
  let k = 0
  for (const i of state.result) k += sel.marks[i]
  return k
}

export function renderSelBar(inList) {
  const sel = state.sel
  if (!sel || !sel.count) { $('selbar').hidden = true; return }
  let text = plural(sel.count, 'linha marcada', 'linhas marcadas')
  if (state.result && inList < sel.count) text += ` (${fmt(inList)} no resultado atual, ${fmt(sel.count - inList)} fora dele)`
  $('sel-text').textContent = text
  $('selbar').hidden = false
}

// Syncs the checkboxes, row tint, header box and counter with the marks.
export function refreshMarks() {
  const sel = state.sel
  if (!sel) return
  const body = $('grid').tBodies[0]
  if (body) {
    for (let i = 0; i < body.rows.length; i++) {
      const tr = body.rows[i]
      const on = sel.marks[listIdx(state.rowStart + i)] === 1
      tr.classList.toggle('sel', on)
      const box = tr.querySelector('.selrow')
      if (box) box.checked = on
    }
  }
  const inList = marksInList()
  const all = $('sel-all')
  if (all) {
    const total = listLength()
    all.checked = total > 0 && inList === total
    all.indeterminate = inList > 0 && inList < total
  }
  renderSelBar(inList)
}

export function onMarkClick(e) {
  const th = e.target.closest('th.rn')
  if (!th || !state.sel) return
  const box = th.querySelector('input[type="checkbox"]')
  if (!box) return
  if (e.target !== box) box.checked = !box.checked
  if (th.closest('thead')) markAllInList(box.checked)
  else {
    const pos = state.rowStart + Number(box.dataset.r)
    if (e.shiftKey && state.sel.anchor !== null) markRange(state.sel.anchor, pos, box.checked)
    else markRow(listIdx(pos), box.checked)
    state.sel.anchor = pos
    if (e.shiftKey) getSelection()?.removeAllRanges()
  }
  refreshMarks()
}
