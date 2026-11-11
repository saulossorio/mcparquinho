// Metadados tab (file facts, key-value metadata, row groups and column chunks).
import { chunkStats, leafAggregates, leafDescFor } from '../core/metadata.js'
import { prettyJson } from './detail.js'
import { $, bytesText, esc, fmt, plural } from './dom.js'
import { leafCount } from './layout.js'
import { MAX_RG_DETAILS, state } from './state.js'

export function renderMeta() {
  const { ctx } = state
  const m = ctx.meta
  const aggs = leafAggregates(ctx)
  let pageIdx = 0
  let bloom = 0
  let chunks = 0
  for (const a of aggs.values()) { pageIdx += a.pageIndex; bloom += a.bloom; chunks += a.chunks }
  const compressed = ctx.rowGroups.reduce((n, g) => n + g.compressed, 0)
  const uncompressed = ctx.rowGroups.reduce((n, g) => n + g.uncompressed, 0)
  const ratio = uncompressed ? ` · ${(compressed / uncompressed * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do original` : ''
  const facts = [
    ['Arquivo', esc(ctx.name)],
    ['Tamanho do arquivo', `${bytesText(ctx.size)} <span class="dim">(${fmt(ctx.size)} bytes)</span>`],
    ['Linhas', fmt(ctx.numRows)],
    ['Colunas', `${fmt(ctx.columns.length)} no topo, ${plural(leafCount(ctx), 'folha', 'folhas')}`],
    ['Row groups', fmt(ctx.rowGroups.length)],
    ['Dados das colunas', `${bytesText(compressed)} compactados, ${bytesText(uncompressed)} sem compressão${ratio}`],
    ['Compressão', esc(ctx.codecs.join(', ') || '—') + (ctx.unsupported.length ? ` <span class="dim">(sem suporte aqui: ${esc(ctx.unsupported.join(', '))})</span>` : '')],
    ['Versão do formato', esc(String(m.version))],
    ['Gerado por', esc(m.created_by ?? '—')],
    ['Rodapé com metadados', bytesText(m.metadata_length)],
    ['Índices de página', `${fmt(pageIdx)} de ${plural(chunks, 'column chunk', 'column chunks')}`],
    ['Bloom filters', `${fmt(bloom)} de ${plural(chunks, 'column chunk', 'column chunks')}`],
  ]
  const kvs = m.key_value_metadata ?? []
  const kvHtml = kvs.length ? kvs.map(kv => {
    const val = kv.value ?? ''
    let note
    let body
    if (kv.key === 'ARROW:schema') {
      note = `esquema Arrow serializado em base64, ${plural(val.length, 'caractere', 'caracteres')}`
      body = val.slice(0, 2000) + (val.length > 2000 ? '…' : '')
    } else {
      const pretty = /^\s*[{[]/.test(val) ? prettyJson(val) : null
      note = `${pretty ? 'JSON, ' : ''}${plural(val.length, 'caractere', 'caracteres')}`
      body = (pretty ?? val).slice(0, 200000)
    }
    return `<details class="kv"${val.length < 160 ? ' open' : ''}><summary><span class="k">${esc(kv.key)}</span><span class="s">${note}</span></summary><pre>${esc(body)}</pre></details>`
  }).join('') : '<p class="hint" style="padding:12px 16px">Este arquivo não tem metadados chave-valor.</p>'
  const groups = ctx.rowGroups.slice(0, MAX_RG_DETAILS)
  const rgHtml = groups.map(g =>
    `<details class="rgdetails" data-g="${g.index}"><summary><span class="g">${fmt(g.index + 1)}</span><span class="c">${fmt(g.start + 1)}</span>` +
    `<span class="c">${fmt(g.rows)}</span><span class="c opt">${bytesText(g.compressed)}</span><span class="c opt">${bytesText(g.uncompressed)}</span></summary><div class="rgbody"></div></details>`).join('')
  $('panel-meta').innerHTML =
    `<div class="card"><h2>Arquivo</h2><dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></div>` +
    `<div class="card"><h2>Metadados chave-valor<span class="sub">${plural(kvs.length, 'entrada', 'entradas')}</span></h2>${kvHtml}</div>` +
    `<div class="card"><h2>Row groups<span class="sub">abra um para ver os column chunks, com codec, estatísticas e tamanhos</span></h2>` +
    '<div class="rghead"><span>#</span><span class="c">Primeira linha</span><span class="c">Linhas</span><span class="c opt">Compactado</span><span class="c opt">Sem compressão</span></div>' +
    rgHtml + (ctx.rowGroups.length > MAX_RG_DETAILS ? `<p class="hint" style="padding:12px 16px">Mostrando os primeiros ${fmt(MAX_RG_DETAILS)} de ${fmt(ctx.rowGroups.length)} row groups.</p>` : '') + '</div>'
}

export function renderChunks(details) {
  const body = details.querySelector('.rgbody')
  if (body.childElementCount) return
  const { ctx } = state
  const g = ctx.rowGroups[Number(details.dataset.g)]
  const rows = g.rg.columns.map(cc => {
    const md = cc.meta_data
    if (!md) return '<tr><td colspan="11" class="dim">Column chunk sem metadados legíveis (provavelmente criptografado).</td></tr>'
    const d = leafDescFor(ctx, md.path_in_schema)
    const st = chunkStats(md, d)
    const idx = [cc.offset_index_offset !== undefined ? 'página' : '', md.bloom_filter_offset !== undefined ? 'bloom' : ''].filter(Boolean).join(', ') || '—'
    return `<tr><td class="m">${esc(md.path_in_schema.join('.'))}</td><td class="m dim">${esc(md.type)}</td><td class="m">${esc(md.codec)}</td>` +
      `<td class="m dim">${esc(md.encodings.join(', '))}</td><td class="r">${fmt(Number(md.num_values))}</td>` +
      `<td class="r">${st.nulls !== undefined ? fmt(Number(st.nulls)) : '—'}</td><td class="m" title="${esc(st.min)}">${esc(st.min) || '<span class="dim">—</span>'}</td>` +
      `<td class="m" title="${esc(st.max)}">${esc(st.max) || '<span class="dim">—</span>'}</td><td class="r">${bytesText(Number(md.total_compressed_size))}</td>` +
      `<td class="r">${bytesText(Number(md.total_uncompressed_size))}</td><td class="dim">${idx}</td></tr>`
  }).join('')
  body.innerHTML = '<div class="tablewrap"><table class="plain"><thead><tr><th>Coluna</th><th>Físico</th><th>Codec</th><th>Codificações</th>' +
    '<th class="r">Valores</th><th class="r">Nulos</th><th>Mínimo</th><th>Máximo</th><th class="r">Compactado</th><th class="r">Sem compressão</th><th>Índices</th></tr></thead>' +
    `<tbody>${rows}</tbody></table></div>`
}
