// Summaries for the Esquema and Metadados tabs (sizes, nulls, encodings, statistics).
import { statText } from './format.js'
import { TIME_UNITS, describeLeaf } from './types.js'
import { UNIT_LABEL } from './values.js'

export function leafAggregates(ctx) {
  const aggs = new Map()
  for (const rg of ctx.meta.row_groups) {
    for (const cc of rg.columns) {
      const md = cc.meta_data
      if (!md) continue
      const key = md.path_in_schema.join('\u0000')
      let a = aggs.get(key)
      if (!a) {
        a = { compressed: 0, uncompressed: 0, values: 0, nulls: 0, nullsKnown: true, encodings: new Set(), codecs: new Set(), pageIndex: 0, bloom: 0, chunks: 0 }
        aggs.set(key, a)
      }
      a.chunks++
      a.compressed += Number(md.total_compressed_size)
      a.uncompressed += Number(md.total_uncompressed_size)
      a.values += Number(md.num_values)
      if (md.statistics?.null_count !== undefined) a.nulls += Number(md.statistics.null_count)
      else a.nullsKnown = false
      for (const e of md.encodings) a.encodings.add(e)
      a.codecs.add(md.codec)
      if (cc.offset_index_offset !== undefined) a.pageIndex++
      if (md.bloom_filter_offset !== undefined) a.bloom++
    }
  }
  return aggs
}

export function annotationText(el) {
  const lt = el.logical_type
  if (lt) {
    switch (lt.type) {
      case 'DECIMAL': return `DECIMAL(${lt.precision}, ${lt.scale})`
      case 'TIMESTAMP': case 'TIME':
        return `${lt.type}(${UNIT_LABEL[TIME_UNITS[lt.unit]] ?? lt.unit}, ${lt.isAdjustedToUTC ? 'UTC' : 'sem fuso'})`
      case 'INTEGER': return `INT(${lt.bitWidth}, ${lt.isSigned ? 'com sinal' : 'sem sinal'})`
      case 'GEOMETRY': return lt.crs ? `GEOMETRY(${lt.crs})` : 'GEOMETRY'
      case 'GEOGRAPHY': return `GEOGRAPHY(${[lt.crs, lt.algorithm].filter(Boolean).join(', ')})`.replace('()', '')
      default: return lt.type
    }
  }
  if (el.converted_type === 'DECIMAL') return `DECIMAL(${el.precision}, ${el.scale})`
  return el.converted_type ?? ''
}

// Flattened schema tree for the schema view.
export function schemaRows(ctx) {
  const aggs = leafAggregates(ctx)
  const rows = []
  const visit = (node, depth, topDesc) => {
    const el = node.element
    const isLeaf = !node.children.length
    const agg = isLeaf ? aggs.get(node.path.join('\u0000')) : undefined
    rows.push({
      depth, name: el.name, path: node.path, isLeaf, physical: isLeaf ? (el.type === 'FIXED_LEN_BYTE_ARRAY' ? `FIXED_LEN_BYTE_ARRAY(${el.type_length})` : el.type) : 'group',
      annotation: annotationText(el), repetition: el.repetition_type, fieldId: el.field_id, desc: topDesc, agg,
    })
    for (const child of node.children) visit(child, depth + 1, null)
  }
  for (const c of ctx.columns) visit(c.node, 0, c.desc)
  return rows
}

// Leaf descriptor for a column chunk path (used to format statistics).
export function leafDescFor(ctx, path) {
  let node = ctx.tree
  for (const part of path) {
    node = node.children.find(c => c.element.name === part)
    if (!node) return null
  }
  return describeLeaf(node.element)
}

export function chunkStats(md, d) {
  const st = md.statistics
  if (!st || !d) return { min: '', max: '', nulls: st?.null_count, distinct: st?.distinct_count }
  const binaryLike = md.type === 'BYTE_ARRAY' || md.type === 'FIXED_LEN_BYTE_ARRAY'
  const min = st.min_value ?? (binaryLike ? undefined : st.min)
  const max = st.max_value ?? (binaryLike ? undefined : st.max)
  return { min: statText(min, d), max: statText(max, d), nulls: st.null_count, distinct: st.distinct_count }
}
