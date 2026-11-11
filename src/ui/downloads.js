// Where files can be saved: Claude's downloads capability, or a plain link on a normal website.
import { sleep } from './dom.js'
import { updateAvailability } from './export-dialog.js'
import { state } from './state.js'

// Outside Claude (a normal website such as GitHub Pages) the page is not framed and can download with a plain link.
export const TOP_LEVEL = (() => { try { return window.top === window.self } catch { return false } })()

export const browserDownloads = {
  browser: true,
  async save({ filename, data }) {
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.append(a)
    a.click()
    a.remove()
    return { status: 'saved', url }
  },
}

// Inside Claude the runtime may expose the API as window.claude or as a global binding named claude.
export function claudeApi() {
  // eslint-disable-next-line no-undef
  const g = typeof claude !== 'undefined' ? claude : undefined
  if (g && typeof g.use === 'function') return g
  return window.claude && typeof window.claude.use === 'function' ? window.claude : null
}

export function detectDownloads() {
  state.downloadsReady = (async () => {
    if (TOP_LEVEL && !claudeApi()) return browserDownloads
    for (let i = 0; i < 100 && !claudeApi(); i++) await sleep(100)
    const api = claudeApi()
    if (!api) { state.downloadsWhy = 'a página não recebeu a API do Claude'; return null }
    try {
      const ns = await api.use('downloads')
      if (!ns) state.downloadsWhy = 'o visualizador respondeu que downloads não estão disponíveis aqui'
      else if (typeof ns.save !== 'function') state.downloadsWhy = 'a API de downloads veio sem a função save'
      return ns ?? null
    } catch (e) {
      state.downloadsWhy = `erro ao pedir downloads: ${e?.message || e}`
      return null
    }
  })().then(ns => {
    state.downloads = ns && typeof ns.save === 'function' ? ns : null
    state.downloadsChecked = true
    updateAvailability()
    return state.downloads
  })
}
