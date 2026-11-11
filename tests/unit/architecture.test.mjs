// Structural rules of src/ (see AGENTS.md): layer boundaries, file headers, clean characters, municipality list.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = path.join(ROOT, 'src')

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
}

const files = walk(SRC).filter(f => f.endsWith('.js')).map(f => ({
  rel: path.relative(ROOT, f).split(path.sep).join('/'),
  text: fs.readFileSync(f, 'utf8'),
}))
const layer = rel => rel.split('/')[1].replace(/\.js$/, '') // core | query | ui | main

function imports(text) {
  const out = []
  for (const re of [/^\s*(?:import|export)\s[^'"]*?\sfrom\s*['"]([^'"]+)['"]/gm, /^\s*import\s*['"]([^'"]+)['"]/gm, /import\(\s*['"]([^'"]+)['"]\s*\)/g]) {
    for (const m of text.matchAll(re)) out.push(m[1])
  }
  return out
}

const withoutComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

test('every module starts with a one-line comment saying what it does', () => {
  const bad = files.filter(f => !/^\/\/ \S.*\n/.test(f.text)).map(f => f.rel)
  assert.deepEqual(bad, [])
})

test('layers: core imports only core; query imports core; nothing imports main', () => {
  const allowed = { core: ['core'], query: ['core', 'query'], ui: ['core', 'query', 'ui', 'data'], main: ['core', 'query', 'ui'] }
  const bad = []
  for (const f of files) {
    for (const spec of imports(f.text)) {
      if (!spec.startsWith('.')) { bad.push(`${f.rel}: imports package "${spec}" (libraries come from the CDN, see ui/libs.js)`); continue }
      const target = path.relative(ROOT, path.join(ROOT, path.dirname(f.rel), spec)).split(path.sep).join('/')
      if (!fs.existsSync(path.join(ROOT, target))) { bad.push(`${f.rel}: "${spec}" does not exist`); continue }
      const to = target.startsWith('data/') ? 'data' : target === 'src/main.js' ? 'main' : layer(target)
      if (!allowed[layer(f.rel)].includes(to)) bad.push(`${f.rel} → ${target}`)
    }
  }
  assert.deepEqual(bad, [])
})

test('core and query do not touch the DOM or browser globals', () => {
  const globals = /\b(document|window|navigator|localStorage|sessionStorage|location|HTMLElement|requestAnimationFrame)\b/
  const bad = files.filter(f => ['core', 'query'].includes(layer(f.rel)))
    .flatMap(f => withoutComments(f.text).split('\n').map((line, i) => [f.rel, i + 1, line]))
    .filter(([, , line]) => globals.test(line))
    .map(([rel, n, line]) => `${rel}:${n}: ${line.trim()}`)
  assert.deepEqual(bad, [])
})

test('sources and the built page have no stray combining marks or control characters (escape them as \\uXXXX)', () => {
  const bad = []
  const others = [...walk(path.join(SRC, 'styles')), path.join(SRC, 'index.html'), path.join(ROOT, 'index.html')]
    .map(p => ({ rel: path.relative(ROOT, p), text: fs.readFileSync(p, 'utf8') }))
  for (const f of [...files, ...others]) {
    f.text.split('\n').forEach((line, i) => {
      if (/[\p{Mn}\p{Cf}]|[^\P{Cc}\t\r]/u.test(line)) bad.push(`${f.rel}:${i + 1}`)
    })
  }
  assert.deepEqual(bad, [])
})

test('data/municipios-mt.tsv: one "code<TAB>NAME" per line, codes unique', () => {
  const lines = fs.readFileSync(path.join(ROOT, 'data', 'municipios-mt.tsv'), 'utf8').split(/\r?\n/)
    .filter(l => l.trim() && !l.startsWith('#'))
  const bad = lines.filter(l => !/^\d+\t[^\t]*\S[^\t]*$/.test(l))
  assert.deepEqual(bad, [])
  const codes = lines.map(l => l.split('\t')[0])
  assert.equal(new Set(codes).size, codes.length, 'duplicate code')
  assert.ok(codes.every(c => !/^0\d/.test(c)), 'write codes without leading zeros (the page strips them before looking up)')
  assert.equal(lines.length, 142, 'Mato Grosso has 142 municipalities: change this number only when the list changes on purpose')
})
