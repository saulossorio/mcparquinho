// Esquema tab.
import { schemaRows } from '../core/metadata.js'
import { family } from '../core/types.js'
import { $, bytesText, esc, fmt, plural } from './dom.js'
import { leafCount } from './layout.js'
import { state } from './state.js'

export const REPETITION = { REQUIRED: 'obrigatório', OPTIONAL: 'opcional', REPEATED: 'repetido' }

export function renderSchema() {
  const { ctx } = state
  const rows = schemaRows(ctx)
  const body = rows.map(r => {
    const a = r.agg
    return `<tr><td><span class="tree${r.isLeaf ? ' leaf' : ''}" style="--d:${r.depth}">${esc(r.name)}</span></td>` +
      `<td>${r.desc ? `<span class="typetag f-${family(r.desc)}">${esc(r.desc.label)}</span>` : ''}</td>` +
      `<td class="m">${esc(r.physical)}</td><td class="m">${esc(r.annotation)}</td>` +
      `<td>${REPETITION[r.repetition] ?? ''}</td>` +
      `<td class="r">${a ? (a.nullsKnown ? fmt(a.nulls) : '—') : ''}</td>` +
      `<td class="r">${a ? bytesText(a.compressed) : ''}</td><td class="r">${a ? bytesText(a.uncompressed) : ''}</td>` +
      `<td class="m dim">${a ? esc([...a.encodings].join(', ')) : ''}</td></tr>`
  }).join('')
  $('panel-schema').innerHTML = `<div class="card"><h2>Esquema<span class="sub">${plural(ctx.columns.length, 'coluna', 'colunas')}, ${plural(leafCount(ctx), 'folha', 'folhas')}</span></h2>` +
    '<div class="tablewrap"><table class="plain"><thead><tr><th>Coluna</th><th>Tipo</th><th>Tipo físico</th><th>Anotação</th><th>Repetição</th>' +
    '<th class="r">Nulos</th><th class="r">Compactado</th><th class="r">Sem compressão</th><th>Codificações</th></tr></thead>' +
    `<tbody>${body}</tbody></table></div></div>`
}
