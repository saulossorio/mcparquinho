// Library URLs. Versions come from package.json (devDependencies) through the build,
// which replaces __LIB_VERSIONS__; tests serve the same versions from node_modules.
/* global __LIB_VERSIONS__ */
const V = __LIB_VERSIONS__

export const CDN = 'https://cdn.jsdelivr.net/npm/'

export const URLS = {
  hyparquet: `${CDN}hyparquet@${V.hyparquet}/src/index.js`,
  schema: `${CDN}hyparquet@${V.hyparquet}/src/schema.js`,
  wkb: `${CDN}hyparquet@${V.hyparquet}/src/wkb.js`,
  gzip: `${CDN}hyparquet-compressors@${V['hyparquet-compressors']}/src/gzip.js`,
  brotli: `${CDN}hyparquet-compressors@${V['hyparquet-compressors']}/src/brotli.js`,
  lz4: `${CDN}hyparquet-compressors@${V['hyparquet-compressors']}/src/lz4.js`,
  zstd: `${CDN}fzstd@${V.fzstd}/esm/index.mjs`,
}
