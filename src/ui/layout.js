// File chip, summary tiles (collapsible), compact info line and tabs.
import { renderPicker } from './columns.js'
import { $, bytesText, esc, fmt, plural, storageGet, storageSet } from './dom.js'
import { renderMeta } from './meta-view.js'
import { renderMuniSelect } from './municipio.js'
import { renderSchema } from './schema-view.js'
import { positionMarker, renderRgMap } from './slider.js'
import { state } from './state.js'

export function leafCount(ctx) { return ctx.meta.schema.filter(el => el.type).length }

export function shortCreatedBy(s) { return s ? s.replace(/\s*\(build [^)]*\)/, '').replace(/\s+version\s+/i, ' ') : '—' }

export function renderFile() {
  const { ctx } = state
  $('boot').hidden = true
  $('filechip').hidden = false
  $('fname').textContent = ctx.name
  $('fname').title = ctx.name
  $('fsize').textContent = bytesText(ctx.size)
  $('samplepill').hidden = !state.sample
  $('sample-notice').hidden = !state.sample || storageGet('mcparquinho.aviso') === '0'
  $('tabsrow').hidden = false
  $('export-btn').hidden = false
  $('schema-count').textContent = fmt(ctx.columns.length)
  $('meta-count').textContent = plural(ctx.rowGroups.length, 'row group', 'row groups')
  renderSummary()
  renderRgMap()
  renderPicker()
  renderMuniSelect()
  renderSchema()
  renderMeta()
}

export function setSummaryOpen(open, remember = true) {
  $('summary').hidden = !open
  $('summary-toggle').setAttribute('aria-expanded', String(open))
  $('summary-caret').textContent = open ? '▴' : '▾'
  if (remember) storageSet('mcparquinho.resumo', open ? '1' : '0')
  requestAnimationFrame(positionMarker)
}

export function renderSummary() {
  const { ctx } = state
  const leaves = leafCount(ctx)
  const compressed = ctx.rowGroups.reduce((n, g) => n + g.compressed, 0)
  const uncompressed = ctx.rowGroups.reduce((n, g) => n + g.uncompressed, 0)
  const tiles = [
    ['Linhas', fmt(ctx.numRows)],
    ['Colunas', fmt(ctx.columns.length) + (leaves !== ctx.columns.length ? `<span class="sub">${plural(leaves, 'folha', 'folhas')}</span>` : '')],
    ['Row groups', fmt(ctx.rowGroups.length)],
    ['Dados', bytesText(compressed) + (uncompressed > compressed ? `<span class="sub">de ${bytesText(uncompressed)}</span>` : ''), '', `${bytesText(compressed)} compactados, ${bytesText(uncompressed)} sem compressão`],
    ['Compressão', esc(ctx.codecs.join(', ') || '—'), 'small'],
    ['Gerado por', esc(shortCreatedBy(ctx.meta.created_by)), 'small', ctx.meta.created_by],
  ]
  $('summary').innerHTML = tiles.map(([k, v, cls, title]) =>
    `<div class="tile"><dt>${k}</dt><dd class="${cls || ''}"${title ? ` title="${esc(title)}"` : ''}>${v}</dd></div>`).join('')
  $('compact-info').textContent = `${plural(ctx.numRows, 'linha', 'linhas')} · ${plural(ctx.columns.length, 'coluna', 'colunas')} · ${plural(ctx.rowGroups.length, 'row group', 'row groups')} · ${ctx.codecs.join(', ') || '—'}`
  setSummaryOpen(storageGet('mcparquinho.resumo') === '1', false)
}

export function selectTab(id) {
  for (const t of document.querySelectorAll('.tab')) {
    const on = t.id === id
    t.setAttribute('aria-selected', String(on))
    t.tabIndex = on ? 0 : -1
    $(t.getAttribute('aria-controls')).hidden = !on
  }
  if (id === 'tab-data') requestAnimationFrame(positionMarker)
}
