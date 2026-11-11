// HTML table + TSV for "Copiar para colar no Excel".
import { scalarText } from './format.js'
import { exportChunks, plainChunks, readRows } from './reader.js'
import { excelCell, outputColumns } from './xlsx.js'

export const COPY_MAX_CELLS = 200000

export const htmlText = s => s.replace(/[&<>"]/g, c => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'))

export const msoFormat = z => z.replace(/([-:. @\\])/g, '\\$1')

export async function clipboardTable(ctx, { start, end, names, derived, read, exact = true, onProgress, isCancelled }) {
  const cols = outputColumns(ctx, names, derived)
  const oneLine = s => s.replace(/[\t\r\n]+/g, ' ')
  const textStyle = ` style="mso-number-format:'${msoFormat('@')}'"`
  const lines = [cols.map(c => oneLine(c.header)).join('\t')]
  const parts = ['<tr>' + cols.map(c => `<th>${htmlText(c.header)}</th>`).join('') + '</tr>']
  const total = end - start
  let done = 0
  for (const [a, b] of read ? plainChunks(start, end) : exportChunks(ctx, start, end)) {
    if (isCancelled?.()) throw new DOMException('Cópia cancelada', 'AbortError')
    const rows = read ? await read(a, b) : await readRows(ctx, a, b, names)
    for (const row of rows) {
      let tr = '<tr>'
      const cells = []
      for (let k = 0; k < cols.length; k++) {
        const v = cols[k].get(row)
        const d = cols[k].desc
        const cell = excelCell(v, d, exact)
        if (!cell) { tr += '<td></td>'; cells.push(''); continue }
        if (cell.t === 'n') {
          const shown = (d.kind === 'leaf' && scalarText(v, d)) || cell.v
          const style = cell.z ? ` style="mso-number-format:'${msoFormat(cell.z)}'"` : ''
          tr += `<td x:num="${cell.v}"${style}>${htmlText(shown)}</td>`
          cells.push(shown)
        } else if (cell.t === 'b') {
          const s = cell.v ? 'TRUE' : 'FALSE'
          tr += `<td x:bool="${s}">${s}</td>`
          cells.push(s)
        } else {
          tr += `<td${textStyle}>${htmlText(cell.v).replace(/\r\n|\r|\n/g, '<br style="mso-data-placement:same-cell">')}</td>`
          cells.push(oneLine(cell.v))
        }
      }
      parts.push(tr + '</tr>')
      lines.push(cells.join('\t'))
    }
    done += rows.length
    onProgress?.(done, total)
    await new Promise(r => setTimeout(r, 0))
  }
  const html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
    'xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table>' + parts.join('') + '</table></body></html>'
  return { html, text: lines.join('\r\n') + '\r\n' }
}
