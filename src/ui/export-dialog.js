// Export dialog: .xlsx download and the two-step copy for Excel.
import { COPY_MAX_CELLS, clipboardTable } from '../core/clipboard.js'
import { ParquetError } from '../core/reader.js'
import { EXCEL_MAX_COLUMNS, EXCEL_MAX_DATA_ROWS, writeXlsx } from '../core/xlsx.js'
import { $, bytesText, fmt, plural } from './dom.js'
import { muniDerived } from './municipio.js'
import { ensureTable, listLength } from './query-state.js'
import { state } from './state.js'

export function pageRange() {
  const start = state.page * state.pageSize
  return [start, Math.min(listLength(), start + state.pageSize)]
}

export function exportChoice() {
  const { ctx } = state
  const form = $('export-form')
  const rowsMode = form.elements['exp-rows'].value
  const colsMode = form.elements['exp-cols'].value
  let start
  let end
  let read = null
  if (state.result) {
    ;[start, end] = rowsMode === 'page' ? pageRange() : [0, state.result.length]
    const result = state.result
    read = async (a, b) => {
      const cols = names.map(n => state.table.cols.get(n))
      return Array.from(result.subarray(a, b), i => cols.map(c => c[i]))
    }
  } else if (rowsMode === 'page') [start, end] = pageRange()
  else if (rowsMode === 'all') { start = 0; end = ctx.numRows }
  else {
    const a = Number($('exp-from').value)
    const b = Number($('exp-to').value)
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b > ctx.numRows || a > ctx.numRows || b < 1) {
      return { error: `Informe linhas entre 1 e ${fmt(ctx.numRows)}.` }
    }
    if (b < a) return { error: 'A linha final precisa ser maior ou igual à inicial.' }
    start = a - 1
    end = b
  }
  const names = colsMode === 'all' ? ctx.columns.map(c => c.name) : state.visible.slice()
  if (end <= start) return { error: 'Não há linhas para exportar.' }
  if (end - start > EXCEL_MAX_DATA_ROWS) return { error: `São ${fmt(end - start)} linhas; o Excel aceita até ${fmt(EXCEL_MAX_DATA_ROWS)}.` }
  if (!names.length) return { error: 'Nenhuma coluna escolhida.' }
  if (names.length > EXCEL_MAX_COLUMNS) return { error: `São ${fmt(names.length)} colunas; o Excel aceita até ${fmt(EXCEL_MAX_COLUMNS)}.` }
  const derived = muniDerived(names)
  return { start, end, names, derived, read, ncols: names.length + derived.length, whole: !read && start === 0 && end === ctx.numRows, filtered: !!read }
}

// Tells, inside the dialog, whether this view can save files.
export function updateAvailability() {
  const note = $('exp-avail')
  if (state.exportMode !== 'options' || !state.ctx || !$('export-dialog').open) return
  if (!state.downloadsChecked) {
    note.hidden = false
    note.textContent = 'Verificando se esta visualização permite baixar arquivos…'
  } else if (!state.downloads) {
    note.hidden = false
    note.textContent = 'Esta visualização não permite baixar arquivos. Use “Copiar para colar no Excel”, ou abra o artefato pelo claude.ai num navegador de computador para baixar o .xlsx.' +
      (state.downloadsWhy ? ` (Detalhe: ${state.downloadsWhy}.)` : '')
  } else {
    note.hidden = true
  }
  updateEstimate()
}

export function updateEstimate() {
  if (state.exportMode !== 'options' || !state.ctx) return
  const c = exportChoice()
  const est = $('exp-estimate')
  const warn = $('exp-warn')
  const blocked = state.downloadsChecked && !state.downloads
  if (c.error) {
    est.textContent = c.error
    $('exp-go').disabled = true
    $('exp-copy').disabled = true
    warn.hidden = true
    return
  }
  const rows = c.end - c.start
  const cells = rows * c.ncols
  est.textContent = `${plural(rows, 'linha', 'linhas')} × ${plural(c.ncols, 'coluna', 'colunas')}`
  $('exp-go').disabled = blocked
  $('exp-copy').disabled = false
  $('exp-copy').title = cells > COPY_MAX_CELLS ? `A cópia aceita até ${fmt(COPY_MAX_CELLS)} células; escolha menos linhas ou colunas.` : ''
  warn.hidden = cells <= 3000000 || blocked
  warn.textContent = 'Exportação grande: pode levar alguns minutos. Deixe esta aba aberta até terminar.'
}

export function setExportMode(mode) {
  state.exportMode = mode
  $('exp-options').hidden = mode !== 'options'
  $('exp-progress').hidden = mode !== 'running'
  $('exp-result').hidden = mode !== 'done' && mode !== 'copy-ready'
  $('exp-go').hidden = mode === 'running'
  $('exp-go').disabled = false
  $('exp-go').textContent = mode === 'options' ? 'Baixar .xlsx' : mode === 'copy-ready' ? 'Copiar agora' : 'Voltar às opções'
  $('exp-copy').hidden = mode !== 'options'
  $('exp-cancel').textContent = mode === 'running' ? 'Cancelar' : mode === 'options' ? 'Cancelar' : 'Fechar'
  if (mode !== 'options') $('exp-estimate').textContent = ''
  if (mode === 'options') updateAvailability()
}

export function showResult(text, kind) {
  const result = $('exp-result')
  result.textContent = text
  result.className = `result ${kind}`
}

export function openExport() {
  const { ctx } = state
  if (!ctx) return
  const form = $('export-form')
  const [ps, pe] = pageRange()
  $('exp-file').textContent = ctx.name
  const total = listLength()
  $('exp-page-label').textContent = !total ? 'Página atual (sem linhas)' : state.result ? `Página atual (${plural(pe - ps, 'linha', 'linhas')} do resultado)` : `Página atual: linhas ${fmt(ps + 1)}–${fmt(pe)}`
  const tooMany = total > EXCEL_MAX_DATA_ROWS
  $('exp-all-label').textContent = state.result
    ? `Todas as linhas do resultado (${fmt(total)}), na ordem da tabela${tooMany ? ': passa do limite do Excel' : ''}`
    : tooMany ? `Todas as linhas (${fmt(total)}): passa do limite do Excel` : `Todas as linhas (${fmt(total)})`
  $('exp-range-opt').hidden = !!state.result
  form.querySelector('input[name="exp-rows"][value="all"]').disabled = tooMany
  form.querySelector('input[name="exp-rows"][value="page"]').checked = true
  for (const id of ['exp-from', 'exp-to']) { $(id).min = '1'; $(id).max = String(Math.max(1, ctx.numRows)) }
  $('exp-from').value = String(ps + 1)
  $('exp-to').value = String(Math.max(pe, ps + 1))
  const visRadio = form.querySelector('input[name="exp-cols"][value="visible"]')
  visRadio.disabled = !state.visible.length
  const plusMuni = state.muni ? ' + município' : ''
  $('exp-vis-label').textContent = `Visíveis na tabela (${fmt(state.visible.length)}${state.visible.includes(state.muni) ? plusMuni : ''})`
  $('exp-allcols-label').textContent = `Todas (${fmt(ctx.columns.length)}${plusMuni})`
  form.querySelector(`input[name="exp-cols"][value="${state.visible.length ? 'visible' : 'all'}"]`).checked = true
  state.clip = null
  $('export-dialog').showModal()
  setExportMode('options')
}

export function exportName(ctx, c) {
  const base = ctx.name.replace(/\.(parquet|parq|pq)$/i, '') || 'dados'
  if (c.filtered) return c.start === 0 && c.end === state.result.length ? `${base}_filtrado.xlsx` : `${base}_filtrado_${c.start + 1}-${c.end}.xlsx`
  return c.whole ? `${base}.xlsx` : `${base}_linhas_${c.start + 1}-${c.end}.xlsx`
}

export function exportErrorText(err) {
  if (err?.name === 'AbortError') return 'Cancelado. Nada foi salvo.'
  switch (err?.code) {
    case 'declined': return 'Download recusado. Nada foi salvo.'
    case 'rate_limited': return 'Já existe um download esperando confirmação. Aguarde um pouco e tente de novo.'
    case 'too_large': return 'O arquivo ficou grande demais para o destino escolhido. Exporte menos linhas ou colunas.'
    case 'rejected_extension': case 'extension_not_enabled': return 'Esta visualização não permite salvar arquivos .xlsx. Use “Copiar para colar no Excel”.'
    case 'bad_request': case 'transform_error': return 'O pedido de download foi recusado por um erro interno. Tente de novo.'
    case undefined: return err instanceof ParquetError ? err.message : `Não foi possível gerar o arquivo: ${err?.message || err}`
    default:
      state.downloads = null
      return 'Esta visualização não permite baixar arquivos. Use “Copiar para colar no Excel”.'
  }
}

export function progress(text) {
  return done => {
    const total = state.progressTotal
    $('exp-bar').style.width = `${(done / total * 100).toFixed(1)}%`
    $('exp-progress-text').textContent = `${text}: ${fmt(done)} de ${fmt(total)} linhas`
  }
}

export async function downloadXlsx() {
  const c = exportChoice()
  if (c.error) return
  const ctx = state.ctx
  state.cancelExport = false
  state.progressTotal = c.end - c.start
  setExportMode('running')
  $('exp-bar').style.width = '0%'
  if (!state.downloadsChecked) {
    $('exp-progress-text').textContent = 'Verificando se esta visualização permite baixar arquivos…'
    await state.downloadsReady
  }
  if (!state.downloads) {
    setExportMode('options')
    return
  }
  $('exp-progress-text').textContent = 'Lendo as linhas…'
  let message
  let ok = false
  try {
    if (c.read) {
      const res = await ensureTable(c.names, t => { $('exp-progress-text').textContent = t })
      if (!res.ok) throw new ParquetError(res.error || 'O arquivo mudou durante a exportação.')
    }
    const blob = await writeXlsx(ctx, {
      start: c.start, end: c.end, names: c.names, derived: c.derived, read: c.read, exact: $('exp-exact').checked,
      isCancelled: () => state.cancelExport, onProgress: progress('Gravando'),
    })
    const filename = exportName(ctx, c)
    if (!state.downloads.browser) $('exp-progress-text').textContent = `Arquivo pronto (${bytesText(blob.size)}). Confirme o download na janela que apareceu.`
    const res = await state.downloads.save({ filename, data: blob })
    ok = true
    if (res?.url) {
      if (state.lastUrl) URL.revokeObjectURL(state.lastUrl)
      state.lastUrl = res.url
      state.lastName = filename
    }
    message = state.downloads.browser ? `Download iniciado: ${filename} (${bytesText(blob.size)}).`
      : res?.status === 'delivered' ? `Arquivo entregue: ${filename}` : `Arquivo salvo: ${filename}`
  } catch (err) {
    message = exportErrorText(err)
  }
  setExportMode('done')
  showResult(message, ok ? 'ok' : 'bad')
  if (ok && state.downloads?.browser && state.lastUrl) {
    const again = document.createElement('a')
    again.href = state.lastUrl
    again.download = state.lastName
    again.textContent = 'Se não baixou, clique aqui.'
    again.className = 'linklike'
    $('exp-result').append(' ', again)
  }
}

// Step 1: read the rows. Step 2 (a new click) copies, because browsers only copy right after a click.
export async function prepareCopy() {
  const c = exportChoice()
  if (c.error) return
  const cells = (c.end - c.start) * c.ncols
  if (cells > COPY_MAX_CELLS) {
    setExportMode('done')
    showResult(`A cópia aceita até ${fmt(COPY_MAX_CELLS)} células, e a seleção tem ${fmt(cells)}. Escolha menos linhas ou colunas, ou baixe o .xlsx.`, 'bad')
    return
  }
  state.cancelExport = false
  state.progressTotal = c.end - c.start
  setExportMode('running')
  $('exp-bar').style.width = '0%'
  $('exp-progress-text').textContent = 'Lendo as linhas…'
  try {
    if (c.read) {
      const res = await ensureTable(c.names, t => { $('exp-progress-text').textContent = t })
      if (!res.ok) throw new ParquetError(res.error || 'O arquivo mudou durante a cópia.')
    }
    state.clip = await clipboardTable(state.ctx, {
      start: c.start, end: c.end, names: c.names, derived: c.derived, read: c.read, exact: $('exp-exact').checked,
      isCancelled: () => state.cancelExport, onProgress: progress('Preparando'),
    })
    state.clip.label = `${plural(c.end - c.start, 'linha', 'linhas')} × ${plural(c.ncols, 'coluna', 'colunas')}`
  } catch (err) {
    setExportMode('done')
    showResult(exportErrorText(err), 'bad')
    return
  }
  setExportMode('copy-ready')
  showResult(`Pronto para copiar: ${state.clip.label}. Clique em “Copiar agora” e depois cole no Excel com Ctrl+V (⌘V no Mac).`, 'ready')
  $('exp-go').focus()
}

export function copyNow() {
  const clip = state.clip
  if (!clip) return
  const ok = () => { setExportMode('done'); showResult(`Copiado: ${clip.label}. Agora cole no Excel com Ctrl+V (⌘V no Mac).`, 'ok') }
  const fail = () => { setExportMode('done'); showResult('O navegador bloqueou a cópia. Tente de novo, ou use “Baixar .xlsx”.', 'bad') }
  let copied = false
  const onCopy = e => {
    e.clipboardData.setData('text/html', clip.html)
    e.clipboardData.setData('text/plain', clip.text)
    e.preventDefault()
    copied = true
  }
  document.addEventListener('copy', onCopy)
  try {
    copied = document.execCommand('copy') && copied
  } catch {
    copied = false
  } finally {
    document.removeEventListener('copy', onCopy)
  }
  if (copied) return ok()
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) {
      navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([clip.html], { type: 'text/html' }),
        'text/plain': new Blob([clip.text], { type: 'text/plain' }),
      })]).then(ok, () => navigator.clipboard.writeText(clip.text).then(ok, fail))
    } else if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(clip.text).then(ok, fail)
    } else fail()
  } catch {
    fail()
  }
}

export function onExportSubmit(e) {
  e.preventDefault()
  if (state.exportMode === 'options') downloadXlsx()
  else if (state.exportMode === 'copy-ready') copyNow()
  else if (state.exportMode === 'done') setExportMode('options')
}

export function cancelOrClose() {
  if (state.exportMode === 'running') { state.cancelExport = true; $('exp-progress-text').textContent = 'Cancelando…'; return }
  $('export-dialog').close()
}
