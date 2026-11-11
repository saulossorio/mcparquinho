// Opens a Parquet source, loads decompressors on demand and reads rows of selected columns.
import { makeParsers, normalize, readMetadataFor } from './convert.js'
import { describe } from './types.js'

// Decompressors load only when a file uses them. SNAPPY is built into hyparquet.
export function makeCompressorLoader(urls) {
  // An empty page compresses to a bare token that hyparquet-compressors 1.1.2 rejects for LZ4.
  const guard = fn => (input, length) => (length === 0 ? new Uint8Array(0) : fn(input, length))
  return async codec => guard(await load(codec))
  async function load(codec) {
    switch (codec) {
      case 'GZIP': {
        const { gunzip } = await import(urls.gzip)
        return (input, length) => gunzip(input, new Uint8Array(length))
      }
      case 'BROTLI': return (await import(urls.brotli)).decompressBrotli
      case 'LZ4': return (await import(urls.lz4)).decompressLz4
      case 'LZ4_RAW': return (await import(urls.lz4)).decompressLz4Raw
      case 'ZSTD': {
        const { decompress } = await import(urls.zstd)
        return input => decompress(input)
      }
      default: throw new Error(`codec ${codec} não suportado`)
    }
  }
}

export const MAGIC = 0x31524150 // 'PAR1' little endian

export const MAGIC_ENCRYPTED = 0x45524150 // 'PARE'

export class ParquetError extends Error {}

export async function openParquet(lib, source) {
  if (source.size < 12) throw new ParquetError('O arquivo é pequeno demais para ser Parquet.')
  const [head, tail] = await Promise.all([source.slice(0, 4), source.slice(source.size - 4, source.size)])
  const headMagic = new DataView(head).getUint32(0, true)
  const tailMagic = new DataView(tail).getUint32(0, true)
  if (tailMagic === MAGIC_ENCRYPTED) {
    throw new ParquetError('Este Parquet tem o rodapé criptografado (modular encryption) e não pode ser lido aqui.')
  }
  if (headMagic !== MAGIC && tailMagic !== MAGIC) {
    throw new ParquetError('Este arquivo não é Parquet: faltam as marcas PAR1 do início e do fim.')
  }
  if (tailMagic !== MAGIC) {
    throw new ParquetError('O arquivo parece cortado: começa como Parquet, mas falta o rodapé com os metadados.')
  }
  const file = { byteLength: source.size, slice: (s, e) => source.slice(s, e ?? source.size) }
  const parsers = makeParsers(lib)
  let meta
  try {
    meta = await lib.parquetMetadataAsync(file, { parsers })
  } catch (e) {
    throw new ParquetError('Não foi possível ler os metadados do arquivo: ' + (e?.message || e))
  }
  const tree = lib.parquetSchema(meta)
  const columns = tree.children.map(node => ({ name: node.element.name, node, desc: describe(node, lib) }))
  const numRows = Number(meta.num_rows)
  let start = 0
  const rowGroups = meta.row_groups.map((rg, index) => {
    let compressed = 0
    let uncompressed = 0
    for (const cc of rg.columns) {
      compressed += Number(cc.meta_data?.total_compressed_size ?? 0)
      uncompressed += Number(cc.meta_data?.total_uncompressed_size ?? 0)
    }
    const g = { index, start, rows: Number(rg.num_rows), compressed, uncompressed, rg }
    start += g.rows
    return g
  })
  const codecs = [...new Set(meta.row_groups.flatMap(rg => rg.columns.map(cc => cc.meta_data?.codec).filter(Boolean)))]
  const compressors = {}
  const unsupported = []
  for (const codec of codecs) {
    if (codec === 'UNCOMPRESSED' || codec === 'SNAPPY') continue
    try {
      compressors[codec] = await lib.loadCompressor(codec)
    } catch {
      unsupported.push(codec)
    }
  }
  return {
    lib, name: source.name, size: source.size, file, meta, readMeta: readMetadataFor(meta), tree, columns,
    byName: new Map(columns.map(c => [c.name, c])), numRows, rowGroups, codecs, compressors, unsupported, parsers,
  }
}

// Keeps recently read byte ranges (column chunks) so paging inside a row group skips the disk.
export function lruBuffer(file, maxBytes = 96 << 20) {
  const cache = new Map()
  let used = 0
  return {
    byteLength: file.byteLength,
    slice(s, e) {
      const key = s + ':' + e
      const hit = cache.get(key)
      if (hit) {
        cache.delete(key)
        cache.set(key, hit)
        return hit.p
      }
      const p = Promise.resolve(file.slice(s, e))
      const size = (e ?? file.byteLength) - s
      if (size <= maxBytes / 2) {
        const entry = { p, size }
        cache.set(key, entry)
        used += size
        while (used > maxBytes) {
          const [k, v] = cache.entries().next().value
          cache.delete(k)
          used -= v.size
        }
        p.catch(() => { if (cache.get(key) === entry) { cache.delete(key); used -= size } })
      }
      return p
    },
  }
}

// Reads rows [start, end) of the named top-level columns; returns arrays of normalized values.
export async function readRows(ctx, start, end, names, file = ctx.file) {
  if (end <= start || !names.length) return []
  if (ctx.unsupported.length) {
    throw new ParquetError(`Compressão não suportada neste visualizador: ${ctx.unsupported.join(', ')}.`)
  }
  const raw = await ctx.lib.parquetReadObjects({
    file, metadata: ctx.readMeta, columns: names, rowStart: start, rowEnd: end,
    parsers: ctx.parsers, compressors: ctx.compressors, useOffsetIndex: true,
  })
  const descs = names.map(n => ctx.byName.get(n).desc)
  return raw.map(r => names.map((n, j) => normalize(r[n], descs[j])))
}

// Chunks that follow row group boundaries, so a group's bytes are cached while it is read in pieces.
export function exportChunks(ctx, start, end, size = 50000) {
  const chunks = []
  for (const g of ctx.rowGroups) {
    const a = Math.max(start, g.start)
    const b = Math.min(end, g.start + g.rows)
    for (let s = a; s < b; s += size) chunks.push([s, Math.min(b, s + size), g.index])
  }
  return chunks
}

export function groupCache(file) {
  let group = -1
  let cache = new Map()
  return {
    setGroup(g) { if (g !== group) { group = g; cache = new Map() } },
    buffer: {
      byteLength: file.byteLength,
      slice(s, e) {
        const key = s + ':' + e
        let p = cache.get(key)
        if (!p) { p = Promise.resolve(file.slice(s, e)); cache.set(key, p) }
        return p
      },
    },
  }
}

// Chunks over [start, end) for a reader that returns rows by position (a filtered or sorted list in memory).
export function plainChunks(start, end, size = 50000) {
  const out = []
  for (let s = start; s < end; s += size) out.push([s, Math.min(end, s + size), -1])
  return out
}
