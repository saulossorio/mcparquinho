// Small DOM and formatting helpers shared by the UI (pt-BR numbers, escaping, storage).
export const nf = new Intl.NumberFormat('pt-BR')

export const fmt = n => nf.format(n)

export const $ = id => document.getElementById(id)

export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

export const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`

export function bytesText(n) {
  if (!Number.isFinite(n)) return '—'
  if (n < 1024) return fmt(n) + ' B'
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 }) + ' ' + units[u]
}

export const sleep = ms => new Promise(r => setTimeout(r, ms))

export function storageGet(key) { try { return localStorage.getItem(key) } catch { return null } }

export function storageSet(key, value) { try { localStorage.setItem(key, value) } catch {} }
