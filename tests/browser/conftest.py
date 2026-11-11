import os

import pytest
from playwright.sync_api import sync_playwright

from helpers import MOCK_DOWNLOADS, PAGE_URL, ROOT, serve_page


@pytest.fixture(scope='session')
def browser():
    """Chromium from Playwright, or the browser in CHROME_PATH (for machines where Playwright cannot download one)."""
    if not (ROOT / 'index.html').exists():
        pytest.exit('index.html ausente: rode npm run build')
    with sync_playwright() as p:
        exe = os.environ.get('CHROME_PATH')
        b = p.chromium.launch(executable_path=exe, args=['--no-sandbox']) if exe else p.chromium.launch()
        yield b
        b.close()


@pytest.fixture
def open_page(browser):
    """open_page(init_script=MOCK_DOWNLOADS, viewport=(w, h), url=..., **context_options) → page with index.html loaded."""
    contexts = []

    def make(init_script=MOCK_DOWNLOADS, viewport=(1366, 820), url=PAGE_URL, goto=True, **context_options):
        ctx = browser.new_context(viewport={'width': viewport[0], 'height': viewport[1]}, **context_options)
        contexts.append(ctx)
        page = ctx.new_page()
        page.errors = []
        page.on('pageerror', lambda e: page.errors.append(str(e)))
        serve_page(page, url)
        if init_script:
            page.add_init_script(init_script)
        if goto:
            page.goto(url)
        return page

    yield make
    for ctx in contexts:
        ctx.close()
