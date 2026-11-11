// Node-side setup shared by the unit tests: hyparquet from node_modules (same versions the page loads
// from the CDN) and file sources over testdata/.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as hp from 'hyparquet'
import { isListLike, isMapLike } from 'hyparquet/src/schema.js'
import { wkbToGeojson } from 'hyparquet/src/wkb.js'
import { makeCompressorLoader } from '../../src/core/reader.js'

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const TESTDATA = path.join(ROOT, 'testdata')
const nm = p => new URL(`../../node_modules/${p}`, import.meta.url).href

export const lib = {
  parquetMetadataAsync: hp.parquetMetadataAsync,
  parquetReadObjects: hp.parquetReadObjects,
  parquetSchema: hp.parquetSchema,
  isListLike,
  isMapLike,
  wkbToGeojson,
  loadCompressor: makeCompressorLoader({
    gzip: nm('hyparquet-compressors/src/gzip.js'),
    brotli: nm('hyparquet-compressors/src/brotli.js'),
    lz4: nm('hyparquet-compressors/src/lz4.js'),
    zstd: nm('fzstd/esm/index.mjs'),
  }),
}

/** Same interface as a browser File source: { name, size, slice(start, end) → ArrayBuffer }. */
export function fileSource(file) {
  const fd = fs.openSync(file, 'r')
  const size = fs.fstatSync(fd).size
  return {
    name: path.basename(file),
    size,
    async slice(s, e) {
      const buf = Buffer.alloc(e - s)
      fs.readSync(fd, buf, 0, e - s, s)
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)
    },
  }
}

export const hasTestdata = name => fs.existsSync(path.join(TESTDATA, name))
export const NO_TESTDATA = 'testdata/ ausente: rode `python3 scripts/gen_testdata.py` (e `--big` para os arquivos grandes)'
