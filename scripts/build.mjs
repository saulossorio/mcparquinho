// Builds index.html (the page GitHub Pages serves) from src/.
//   node scripts/build.mjs           write index.html
//   node scripts/build.mjs --check   fail if index.html is not what src/ builds to
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8')

// Order matters: later files override earlier ones.
const STYLES = ['tokens.css', 'layout.css', 'data.css', 'views.css', 'dialogs.css', 'responsive.css']
// Libraries loaded from jsDelivr at runtime, pinned to the versions installed for tests.
const CDN_LIBS = ['hyparquet', 'hyparquet-compressors', 'fzstd']

const pkg = JSON.parse(read('package.json'))
const versions = Object.fromEntries(CDN_LIBS.map(name => {
  const v = pkg.devDependencies[name]
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`package.json: pin ${name} to an exact version (found ${v})`)
  return [name, v]
}))

const bundle = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  charset: 'utf8',
  write: false,
  legalComments: 'none',
  loader: { '.tsv': 'text', '.parquet': 'base64' },
  define: { __LIB_VERSIONS__: JSON.stringify(versions) },
  logLevel: 'warning',
})
// esbuild (charset utf8) writes some control characters raw, such as the OUT_KEY marker of query/engine.js.
// Write them as escapes so index.html stays plain text.
const escapeControls = text => Array.from(text, c => {
  const n = c.charCodeAt(0)
  return (n < 32 && n !== 9 && n !== 10 && n !== 13) || n === 127 ? '\\u' + n.toString(16).padStart(4, '0') : c
}).join('')
const js = escapeControls(bundle.outputFiles[0].text).replace(/<\/script/gi, '<\\/script')
const css = STYLES.map(f => read(`src/styles/${f}`)).join('\n')
const template = read('src/index.html')
for (const mark of ['/*__CSS__*/', '/*__JS__*/']) if (!template.includes(mark)) throw new Error(`src/index.html: missing ${mark}`)
const html = template.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js)

const out = path.join(root, 'index.html')
if (process.argv.includes('--check')) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : ''
  if (current !== html) {
    console.error('index.html is out of date: run `npm run build` and commit it.')
    process.exit(1)
  }
  console.log('index.html is up to date.')
} else {
  fs.writeFileSync(out, html)
  console.log(`index.html: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB (${Object.entries(versions).map(([k, v]) => `${k}@${v}`).join(', ')})`)
}
