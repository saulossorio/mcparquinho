// All DOM event bindings, in one place.
import { applyMenu, closeMenu, menuSort, openMenu, placeMenu, renderMenuList, syncCondArgs } from './column-menu.js'
import { columnsChanged, togglePicker } from './columns.js'
import { copyCell, openDetail } from './detail.js'
import { $, storageSet } from './dom.js'
import { cancelOrClose, onExportSubmit, openExport, prepareCopy, updateEstimate } from './export-dialog.js'
import { hideAlert, openFile } from './files.js'
import { goToPage, goToRow, loadPage, onGridKey } from './grid.js'
import { selectTab, setSummaryOpen } from './layout.js'
import { onMarkClick, refreshMarks } from './marks.js'
import { renderChunks } from './meta-view.js'
import { setMuni } from './municipio.js'
import { MUNI_COL, commitQuery } from './query-state.js'
import { endDrag, onSliderKey, positionMarker, scrubTo } from './slider.js'
import { state } from './state.js'

export function wire() {
  const input = $('file-input')
  $('open-btn').addEventListener('click', () => input.click())
  $('sample-open').addEventListener('click', () => input.click())
  input.addEventListener('change', () => {
    const files = [...input.files]
    input.value = ''
    openFile(files[0], files.length - 1)
  })
  $('alert-close').addEventListener('click', hideAlert)
  $('export-btn').addEventListener('click', openExport)

  for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => selectTab(t.id))
  $('tabs').addEventListener('keydown', e => {
    const tabs = [...document.querySelectorAll('.tab')]
    const i = tabs.indexOf(document.activeElement)
    if (i < 0 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    selectTab(next.id)
    next.focus()
    e.preventDefault()
  })

  $('pg-first').addEventListener('click', () => goToPage(0))
  $('pg-prev').addEventListener('click', () => goToPage(state.page - 1))
  $('pg-next').addEventListener('click', () => goToPage(state.page + 1))
  $('pg-last').addEventListener('click', () => goToPage(Math.ceil(state.ctx.numRows / state.pageSize) - 1))
  $('goto-form').addEventListener('submit', e => {
    e.preventDefault()
    const n = Number($('goto-row').value)
    if (Number.isFinite(n) && n >= 1) goToRow(n)
  })
  $('page-size').addEventListener('change', () => {
    const first = state.page * state.pageSize
    state.pageSize = Number($('page-size').value)
    state.page = Math.floor(first / state.pageSize)
    state.active = null
    loadPage()
  })

  $('cols-btn').addEventListener('click', e => { e.stopPropagation(); togglePicker() })
  $('muni-col').addEventListener('change', () => setMuni($('muni-col').value))
  let searchTimer = 0
  $('q').addEventListener('input', () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => { if (state.ctx) commitQuery(q => { q.search = $('q').value }) }, 350)
  })
  $('qbar-clear').addEventListener('click', () => {
    $('q').value = ''
    commitQuery(q => { q.search = ''; q.filters.clear(); q.sort = null })
  })
  $('grid').addEventListener('click', e => {
    const b = e.target.closest('.hbtn')
    if (!b) return
    e.stopPropagation()
    const name = b.dataset.mc ? MUNI_COL : b.dataset.q
    if (state.menu?.name === name && !$('hmenu').hidden) closeMenu()
    else openMenu(name, b)
  })
  $('hm-asc').addEventListener('click', () => menuSort(1))
  $('hm-desc').addEventListener('click', () => menuSort(-1))
  $('hm-unsort').addEventListener('click', () => menuSort(0))
  $('hm-clear').addEventListener('click', () => {
    const name = state.menu?.name
    closeMenu()
    if (name) commitQuery(q => { q.filters.delete(name) })
  })
  $('hm-op').addEventListener('change', () => { syncCondArgs(); $('hm-error').hidden = true; if ($('hm-op').value) $('hm-a').focus() })
  $('hm-search').addEventListener('input', renderMenuList)
  $('hm-list').addEventListener('change', e => {
    const m = state.menu
    const box = e.target.closest('input[type="checkbox"]')
    if (!m || !box) return
    const key = m.entries[Number(box.dataset.i)].key
    if (box.checked) m.excluded.delete(key)
    else m.excluded.add(key)
    $('hm-all').checked = m.shown.every(i => !m.excluded.has(m.entries[i].key))
  })
  $('hm-all').addEventListener('change', () => {
    const m = state.menu
    if (!m?.ready) return
    for (const i of m.shown) {
      if ($('hm-all').checked) m.excluded.delete(m.entries[i].key)
      else m.excluded.add(m.entries[i].key)
    }
    renderMenuList()
  })
  $('hm-ok').addEventListener('click', applyMenu)
  $('hm-cancel').addEventListener('click', closeMenu)
  for (const id of ['hm-a', 'hm-b']) $(id).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyMenu() } })
  $('hmenu').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeMenu() } })
  document.addEventListener('pointerdown', e => {
    if (!$('hmenu').hidden && !e.target.closest('#hmenu') && !e.target.closest('.hbtn')) closeMenu()
  })
  window.addEventListener('resize', () => { if (state.menu?.anchor?.isConnected) placeMenu(state.menu.anchor) })
  $('col-list').addEventListener('change', columnsChanged)
  $('col-filter').addEventListener('input', () => {
    const q = $('col-filter').value.trim().toLowerCase()
    for (const li of $('col-list').children) li.hidden = !!q && !li.querySelector('.n').textContent.toLowerCase().includes(q)
  })
  const setShown = on => {
    for (const li of $('col-list').children) if (!li.hidden) li.querySelector('input').checked = on
    columnsChanged()
  }
  $('col-all').addEventListener('click', () => setShown(true))
  $('col-none').addEventListener('click', () => setShown(false))
  document.addEventListener('click', e => { if (!$('picker').hidden && !e.target.closest('.picker-wrap')) togglePicker(false) })
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    if (!$('hmenu').hidden) closeMenu()
    else if (!$('picker').hidden) { togglePicker(false); $('cols-btn').focus() }
  })

  $('grid').addEventListener('click', onMarkClick)
  $('sel-clear').addEventListener('click', () => {
    state.sel.marks.fill(0)
    state.sel.count = 0
    state.sel.anchor = null
    refreshMarks()
  })
  let placing = 0
  const follow = () => {
    if ($('hmenu').hidden || placing) return
    placing = requestAnimationFrame(() => {
      placing = 0
      if (state.menu?.anchor?.isConnected) placeMenu(state.menu.anchor)
    })
  }
  $('grid-wrap').addEventListener('scroll', follow, { passive: true })
  window.addEventListener('scroll', follow, { passive: true })
  $('summary-toggle').addEventListener('click', () => setSummaryOpen($('summary').hidden))
  $('sample-close').addEventListener('click', () => { $('sample-notice').hidden = true; storageSet('mcparquinho.aviso', '0') })
  $('grid').addEventListener('click', e => {
    if (e.target.closest('.hbtn')) return
    const td = e.target.closest('td')
    if (!td) return
    openDetail(td.parentElement.sectionRowIndex, Number(td.dataset.c))
  })
  $('grid-wrap').addEventListener('keydown', onGridKey)
  const bar = $('rgbar')
  bar.addEventListener('pointerdown', e => {
    if (!state.ctx?.numRows || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault()
    bar.focus({ preventScroll: true })
    try { bar.setPointerCapture(e.pointerId) } catch {}
    state.drag = { id: e.pointerId, row: 0 }
    bar.classList.add('dragging')
    scrubTo(e.clientX)
  })
  bar.addEventListener('pointermove', e => { if (state.drag && e.pointerId === state.drag.id) scrubTo(e.clientX) })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    bar.addEventListener(type, e => { if (state.drag && e.pointerId === state.drag.id) endDrag() })
  }
  bar.addEventListener('keydown', onSliderKey)
  new ResizeObserver(() => positionMarker()).observe($('rgbar'))

  $('panel-meta').addEventListener('toggle', e => {
    if (e.target.matches?.('.rgdetails') && e.target.open) renderChunks(e.target)
  }, true)

  $('cell-close').addEventListener('click', () => $('cell-dialog').close())
  $('cell-close-x').addEventListener('click', () => $('cell-dialog').close())
  $('cell-copy').addEventListener('click', copyCell)
  $('cell-dialog').addEventListener('close', () => $('grid-wrap').focus({ preventScroll: true }))

  $('export-form').addEventListener('submit', onExportSubmit)
  $('exp-copy').addEventListener('click', prepareCopy)
  $('export-form').addEventListener('input', updateEstimate)
  $('export-form').addEventListener('change', updateEstimate)
  for (const id of ['exp-from', 'exp-to']) {
    $(id).addEventListener('focus', () => { $('export-form').querySelector('input[name="exp-rows"][value="range"]').checked = true; updateEstimate() })
  }
  $('exp-cancel').addEventListener('click', cancelOrClose)
  $('exp-close-x').addEventListener('click', cancelOrClose)
  $('export-dialog').addEventListener('cancel', e => { if (state.exportMode === 'running') { e.preventDefault(); cancelOrClose() } })

  let depth = 0
  const hasFiles = e => [...(e.dataTransfer?.types ?? [])].includes('Files')
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; e.preventDefault(); depth++; $('drop').hidden = false })
  window.addEventListener('dragover', e => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy' })
  window.addEventListener('dragleave', e => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) $('drop').hidden = true })
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth = 0
    $('drop').hidden = true
    if (state.exportMode === 'running') return
    const files = [...e.dataTransfer.files]
    openFile(files[0], files.length - 1)
  })
}
