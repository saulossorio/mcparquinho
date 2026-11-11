// Opening files (picker, drop, embedded example) and the error banner.
import SAMPLE_B64 from '../../data/exemplo-vendas.parquet'
import { lruBuffer, openParquet } from '../core/reader.js'
import { closeMenu } from './column-menu.js'
import { $ } from './dom.js'
import { loadPage } from './grid.js'
import { renderFile, selectTab } from './layout.js'
import { renderSelBar } from './marks.js'
import { newQuery, renderQueryBar } from './query-state.js'
import { MAX_DEFAULT_COLUMNS, state } from './state.js'

export function sampleSource() {
  const bytes = Uint8Array.from(atob(SAMPLE_B64), c => c.charCodeAt(0))
  const buf = bytes.buffer
  return { name: 'exemplo-vendas.parquet', size: buf.byteLength, slice: async (s, e) => buf.slice(s, e) }
}

export function fileSource(file) {
  return { name: file.name, size: file.size, slice: (s, e) => file.slice(s, e).arrayBuffer() }
}

export async function openFile(file, extra = 0) {
  if (!state.lib || !file) return
  const ok = await openSource(fileSource(file))
  if (ok && extra) showAlert(`Você soltou ${extra + 1} arquivos; abri só “${file.name}”.`)
}

export async function openSource(src, sample = false) {
  hideAlert()
  document.body.style.cursor = 'progress'
  let ctx
  try {
    ctx = await openParquet(state.lib, src)
  } catch (e) {
    showAlert(`Não foi possível abrir “${src.name}”. ${e?.message || e}`)
    return false
  } finally {
    document.body.style.cursor = ''
  }
  state.ctx = ctx
  state.buffer = lruBuffer(ctx.file)
  state.sample = sample
  state.page = 0
  state.active = null
  state.capped = ctx.columns.length > MAX_DEFAULT_COLUMNS
  state.visible = ctx.columns.slice(0, MAX_DEFAULT_COLUMNS).map(c => c.name)
  state.muni = ''
  state.muniAuto = true
  state.table = null
  state.tableToken++
  state.queryToken++
  state.query = newQuery()
  state.result = null
  state.rowNums = null
  state.sel = { marks: new Uint8Array(ctx.numRows), count: 0, anchor: null }
  $('q').value = ''
  closeMenu()
  renderQueryBar()
  renderSelBar(0)
  state.rows = []
  $('grid').innerHTML = ''
  $('grid-empty').hidden = true
  renderFile()
  selectTab('tab-data')
  $('grid-wrap').scrollTo(0, 0)
  await loadPage()
  return true
}

export function showAlert(text) {
  $('alert-text').textContent = text
  $('alert').hidden = false
}

export function hideAlert() { $('alert').hidden = true }
