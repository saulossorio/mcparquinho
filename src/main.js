// Entry point: binds events, detects downloads, loads hyparquet from the CDN and opens the example.
import { makeCompressorLoader } from './core/reader.js'
import { $ } from './ui/dom.js'
import { detectDownloads } from './ui/downloads.js'
import { wire } from './ui/events.js'
import { openSource, sampleSource } from './ui/files.js'
import { URLS } from './ui/libs.js'
import { state } from './ui/state.js'

export async function init() {
  wire()
  detectDownloads()
  try {
    const [hp, schema, wkb] = await Promise.all([import(URLS.hyparquet), import(URLS.schema), import(URLS.wkb)])
    state.lib = {
      parquetMetadataAsync: hp.parquetMetadataAsync, parquetReadObjects: hp.parquetReadObjects, parquetSchema: hp.parquetSchema,
      isListLike: schema.isListLike, isMapLike: schema.isMapLike, wkbToGeojson: wkb.wkbToGeojson,
      loadCompressor: makeCompressorLoader(URLS),
    }
  } catch {
    $('boot').innerHTML = '<h2>Não foi possível carregar o leitor de Parquet</h2><p>A página baixa a biblioteca hyparquet de cdn.jsdelivr.net. Verifique a conexão e recarregue a página.</p>'
    return
  }
  await openSource(sampleSource(), true)
}

init()
