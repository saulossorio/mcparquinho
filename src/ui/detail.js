// Cell detail dialog and copy.
import { scalarText, serialize } from '../core/format.js'
import { Bin, PDate, PDec, PMap, PTime, PTimeOfDay, UNIT_LABEL, UNIT_NS, hex, toBytes } from '../core/values.js'
import { $, esc, fmt, plural } from './dom.js'
import { setActive } from './grid.js'
import { muniName } from './municipio.js'
import { state } from './state.js'

export function hexdump(bytes, max = 4096) {
  const n = Math.min(bytes.length, max)
  let out = ''
  for (let o = 0; o < n; o += 16) {
    const part = bytes.subarray(o, Math.min(o + 16, n))
    const hx = Array.from(part, b => b.toString(16).padStart(2, '0')).join(' ').padEnd(47, ' ')
    const asc = Array.from(part, b => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join('')
    out += o.toString(16).padStart(8, '0') + '  ' + hx + '  ' + asc + '\n'
  }
  return out
}

export function prettyJson(text) {
  if (/\d{16,}/.test(text)) return null
  try { return JSON.stringify(JSON.parse(text), null, 2) } catch { return null }
}

export function detailContent(v, d) {
  if (v === null || v === undefined) return { html: '<p class="big nul">null</p><p class="hint">Valor nulo nesta linha.</p>', copy: null }
  const hint = s => `<p class="hint">${s}</p>`
  if (d.kind !== 'leaf' || (d.cat === 'geo' && !(v instanceof Bin))) {
    const { text, truncated } = serialize(v, d, { pretty: true, limit: 500000 })
    let note = d.kind === 'list' && Array.isArray(v) ? plural(v.length, 'item', 'itens') : d.kind === 'map' && v instanceof PMap ? plural(v.entries.length, 'chave', 'chaves') : d.kind === 'struct' ? plural(d.fields.length, 'campo', 'campos') : 'Valor aninhado'
    if (truncated) note += ' · mostrando os primeiros 500 mil caracteres'
    return { html: hint(note) + `<pre>${esc(text)}</pre>`, copy: text }
  }
  if (typeof v === 'string') {
    if (d.cat === 'json') {
      const pretty = prettyJson(v)
      return { html: hint(`JSON, ${plural(v.length, 'caractere', 'caracteres')}`) + `<pre>${esc(pretty ?? v)}</pre>`, copy: v }
    }
    const extra = d.cat === 'binary' ? ' · bytes sem anotação de texto, válidos em UTF-8' : ''
    return { html: hint(plural([...v].length, 'caractere', 'caracteres') + extra) + `<pre>${esc(v)}</pre>`, copy: v }
  }
  if (v instanceof Bin || v instanceof Uint8Array) {
    const bytes = toBytes(v)
    const note = plural(bytes.length, 'byte', 'bytes') + (bytes.length > 4096 ? ' · mostrando os primeiros 4.096' : '')
    return { html: hint(note) + `<pre>${esc(hexdump(bytes) || '(vazio)')}</pre>`, copy: '0x' + hex(bytes) }
  }
  const text = scalarText(v, d) ?? String(v)
  let note = esc(d.label)
  if (v instanceof PDec) note = `${esc(d.label)} · valor exato`
  else if (v instanceof PTime) {
    const raw = v.ns / UNIT_NS[v.unit]
    note = `${d.utc ? 'Instante em UTC' : 'Data e hora sem fuso horário'} · valor gravado: ${raw.toString()} ${UNIT_LABEL[v.unit]} desde 1970-01-01`
  } else if (v instanceof PDate) note = `${plural(v.days, 'dia', 'dias')} desde 1970-01-01`
  else if (v instanceof PTimeOfDay) note = `Hora do dia, em ${UNIT_LABEL[v.unit]}`
  return { html: `<p class="big">${esc(text)}</p>` + hint(note), copy: text }
}

export const rowNumOf = r => (state.rowNums ? state.rowNums[r] : state.rowStart + r + 1)

export function openDetail(r, c) {
  const vc = state.view[c]
  const col = vc && state.ctx.byName.get(state.visible[vc.j])
  if (!col || !state.rows[r]) return
  setActive(r, c, false)
  const v = state.rows[r][vc.j]
  let html
  let copy
  if (vc.muni) {
    const name = muniName(v)
    const code = scalarText(v, col.desc)
    html = name === null ? '<p class="big nul">null</p><p class="hint">Sem código nesta linha.</p>'
      : name === undefined ? `<p class="big nul">sem tradução</p><p class="hint">O código ${esc(code)} não está na lista de municípios.</p>`
        : `<p class="big">${esc(name)}</p><p class="hint">Código ${esc(code)} na coluna ${esc(col.name)}</p>`
    copy = name || null
    $('cell-title').textContent = 'município'
    $('cell-meta').textContent = `tradução de ${col.name} · linha ${fmt(rowNumOf(r))}`
  } else {
    ({ html, copy } = detailContent(v, col.desc))
    $('cell-title').textContent = col.name
    $('cell-meta').textContent = `${col.desc.label} · linha ${fmt(rowNumOf(r))}`
  }
  $('cell-body').innerHTML = html
  $('cell-status').textContent = ''
  state.copyText = copy
  $('cell-copy').disabled = copy == null
  $('cell-dialog').showModal()
}

export async function copyCell() {
  if (state.copyText == null) return
  try {
    await navigator.clipboard.writeText(state.copyText)
    $('cell-status').textContent = 'Copiado.'
  } catch {
    const target = $('cell-body').querySelector('pre, .big')
    if (target) {
      const range = document.createRange()
      range.selectNodeContents(target)
      const sel = getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    }
    $('cell-status').textContent = 'A cópia automática foi bloqueada. O valor está selecionado: use Ctrl+C.'
  }
}
