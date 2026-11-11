"""Shared pieces for the browser tests: paths, CDN served from node_modules, the downloads mock, waits."""
import base64
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
NODE_MODULES = ROOT / 'node_modules'
TESTDATA = ROOT / 'testdata'
PAGE_URL = 'https://mcparquinho.test/'

# window.claude with a downloads capability that keeps what the page saves (inside Claude the real one asks the viewer).
MOCK_DOWNLOADS = """
window.__saves = []
window.claude = { use: async (name) => name !== 'downloads' ? null : Object.freeze({
  save: async ({ filename, data }) => {
    const bytes = new Uint8Array(data instanceof Blob ? await data.arrayBuffer() : data)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    window.__saves.push({ filename, b64: btoa(bin), size: bytes.length })
    return { status: 'saved' }
  } }) }
"""


def route_cdn(route):
    """Serves https://cdn.jsdelivr.net/npm/<pkg>@<version>/<path> from node_modules, refusing other versions."""
    m = re.match(r'https://cdn\.jsdelivr\.net/npm/([^@/]+)@([^/]+)/(.+)$', route.request.url)
    if not m:
        return route.fulfill(status=404, body='')
    name, version, rest = m.groups()
    pkg = json.loads((NODE_MODULES / name / 'package.json').read_text())
    path = NODE_MODULES / name / rest
    if pkg['version'] != version or not path.exists():
        return route.fulfill(status=404, body='not found')
    route.fulfill(status=200, body=path.read_bytes(), headers={
        'content-type': 'application/javascript; charset=utf-8', 'access-control-allow-origin': '*'})


def serve_page(page, url=PAGE_URL):
    page.route('https://cdn.jsdelivr.net/**', route_cdn)
    page.route(re.compile(r'https://fonts\.(googleapis|gstatic)\.com/.*'),
               lambda r: r.fulfill(status=200, body='', headers={'content-type': 'text/css'}))
    page.route(url, lambda r: r.fulfill(status=200, body=(ROOT / 'index.html').read_bytes(),
                                        headers={'content-type': 'text/html; charset=utf-8'}))


class Checks:
    """Collects named checks so one run reports every failure, then fails the test if any failed."""

    def __init__(self):
        self.failures = []

    def __call__(self, ok, message):
        print(('ok     ' if ok else 'FALHOU ') + message)
        if not ok:
            self.failures.append(message)

    def done(self):
        assert not self.failures, '; '.join(self.failures)


def need(*names):
    missing = [n for n in names if not (TESTDATA / n).exists()]
    if missing:
        pytest.skip(f'testdata ausente ({", ".join(missing)}): rode python3 scripts/gen_testdata.py' +
                    (' --big' if any(n.startswith('big_') for n in missing) else ''))


def wait_rows(page, n=None, timeout=60000):
    page.wait_for_function('() => document.querySelectorAll("#grid tbody tr").length > 0 && '
                           '!document.getElementById("grid-wrap").classList.contains("busy")', timeout=timeout)
    if n is not None:
        page.wait_for_function(f'() => document.querySelectorAll("#grid tbody tr").length === {n}', timeout=timeout)


def wait_file(page, name, first_column, timeout=60000):
    page.wait_for_function(
        f'() => document.getElementById("fname").textContent === {json.dumps(name)} && '
        f'document.querySelector("#grid thead .cn")?.textContent === {json.dumps(first_column)}', timeout=timeout)
    wait_rows(page, timeout=timeout)


def open_file(page, name, first_column):
    page.set_input_files('#file-input', str(TESTDATA / name))
    wait_file(page, name, first_column)


def settle(page, timeout=120000):
    page.wait_for_function('() => !document.getElementById("grid-wrap").classList.contains("busy") && '
                           'document.getElementById("hmenu").hidden', timeout=timeout)
    page.wait_for_timeout(150)


def headers(page):
    return page.eval_on_selector_all('#grid thead th .cn', 'els => els.map(e => e.textContent)')


def column(page, name):
    j = headers(page).index(name)
    return page.eval_on_selector_all('#grid tbody tr', f'trs => trs.map(tr => tr.cells[{j + 1}].textContent)')


def cell(page, row, name):
    return column(page, name)[row]


def range_text(page):
    return page.inner_text('#pg-range')


def total(page):
    m = re.search(r'de ([\d.]+)', range_text(page))
    return int(m.group(1).replace('.', '')) if m else 0


def open_menu(page, name):
    page.click(f'#grid thead th:has(.cn:text-is("{name}")) .hbtn')
    page.wait_for_selector('#hmenu:not([hidden])')
    page.wait_for_function('() => document.querySelectorAll("#hm-list li").length > 0 || '
                           '!document.getElementById("hm-error").hidden', timeout=120000)


def saved_xlsx(page, out):
    page.wait_for_function('() => window.__saves.length > 0', timeout=300000)
    saved = page.evaluate('() => window.__saves.pop()')
    Path(out).write_bytes(base64.b64decode(saved['b64']))
    return saved['filename'], saved['size']
