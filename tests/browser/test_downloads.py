"""Where the export can save: Claude's downloads capability (window.claude or a global `claude`), a normal
website (plain link), a view that refuses downloads (explains, copy still works) and a frame with no API."""
import openpyxl

from helpers import PAGE_URL, ROOT, Checks, serve_page, wait_rows

GLOBAL_BINDING = """const claude = { use: async n => n === 'downloads' ? Object.freeze({ save: async ({ filename, data }) => {
  window.__ok = filename + ':' + data.size; return { status: 'saved' } } }) : null }"""


def test_visualizacao_sem_downloads_copia_para_o_excel(open_page):
    check = Checks()
    page = open_page(init_script='window.claude = { use: async () => null }', permissions=['clipboard-read', 'clipboard-write'])
    wait_rows(page, 100)
    check(page.is_visible('#export-btn'), 'botão Exportar continua visível')
    page.click('#export-btn')
    page.wait_for_selector('#export-dialog[open]')
    page.wait_for_function('() => document.getElementById("exp-avail").textContent.includes("não permite")', timeout=15000)
    check(page.is_disabled('#exp-go') and 'Detalhe' in page.inner_text('#exp-avail'), 'avisa, diz o motivo e desativa Baixar .xlsx')
    page.click('#exp-copy')
    page.wait_for_function('() => document.getElementById("exp-result").textContent.includes("Pronto para copiar")', timeout=30000)
    page.click('#exp-go')
    page.wait_for_function('() => document.getElementById("exp-result").textContent.startsWith("Copiado")', timeout=10000)
    clip = page.evaluate("""async () => {
      const items = await navigator.clipboard.read(); const out = {}
      for (const t of items[0].types) out[t] = await (await items[0].getType(t)).text()
      return out }""")
    html, text = clip.get('text/html', ''), clip.get('text/plain', '')
    check('x:num="193.05"' in html and "mso-number-format:'0\\.00'" in html, 'HTML com x:num e formato 0.00 para o Excel')
    lines = text.strip().split('\r\n')
    check(lines[1].split('\t')[8] == '193.05' and len(lines) == 101, 'TSV com cabeçalho e 100 linhas')
    check(not page.errors, f'sem erros ({page.errors[:2]})')
    check.done()


def test_api_do_claude_como_variavel_global(open_page):
    check = Checks()
    page = open_page(init_script=None, goto=False)
    page.unroute(PAGE_URL)
    html = (ROOT / 'index.html').read_text().replace('<head>', f'<head><script>{GLOBAL_BINDING}</script>', 1)
    page.route(PAGE_URL, lambda r: r.fulfill(status=200, body=html.encode(), headers={'content-type': 'text/html; charset=utf-8'}))
    page.goto(PAGE_URL)
    wait_rows(page, 100)
    page.click('#export-btn')
    page.wait_for_selector('#export-dialog[open]')
    page.wait_for_function('() => !document.getElementById("exp-go").disabled && document.getElementById("exp-avail").hidden', timeout=15000)
    page.click('#exp-go')
    page.wait_for_function('() => window.__ok', timeout=15000)
    check(page.evaluate('window.__ok').startswith('exemplo-vendas_linhas_1-100.xlsx:'), 'downloads via `claude` global')
    check.done()


def test_site_normal_baixa_direto(open_page, tmp_path):
    check = Checks()
    page = open_page(init_script=None, accept_downloads=True)
    wait_rows(page, 100)
    page.click('#export-btn')
    page.wait_for_selector('#export-dialog[open]')
    page.wait_for_timeout(300)
    check(page.is_hidden('#exp-avail') and not page.is_disabled('#exp-go'), 'fora do Claude o download fica disponível')
    page.check('input[name="exp-rows"][value="all"]')
    with page.expect_download(timeout=30000) as dl:
        page.click('#exp-go')
    dl.value.save_as(tmp_path / 'site.xlsx')
    ws = openpyxl.load_workbook(tmp_path / 'site.xlsx').active
    check(dl.value.suggested_filename == 'exemplo-vendas.xlsx' and ws.max_row == 481, 'download direto pelo navegador')
    page.wait_for_selector('#exp-result:not([hidden])')
    check('Se não baixou' in page.inner_text('#exp-result'), 'oferece o link "Se não baixou, clique aqui"')
    check.done()


def test_moldura_sem_api_explica(browser):
    check = Checks()
    ctx = browser.new_context(viewport={'width': 1366, 'height': 820})
    page = ctx.new_page()
    serve_page(page)
    page.route('https://moldura.test/', lambda r: r.fulfill(status=200, headers={'content-type': 'text/html'},
               body=f'<iframe src="{PAGE_URL}" style="width:1300px;height:780px;border:0"></iframe>'))
    page.goto('https://moldura.test/')
    frame = page.frame_locator('iframe')
    frame.locator('#grid tbody tr').first.wait_for(timeout=60000)
    frame.locator('#export-btn').click()
    frame.locator('#exp-avail').filter(has_text='Detalhe').wait_for(timeout=20000)
    check('não recebeu a API do Claude' in frame.locator('#exp-avail').inner_text(), 'dentro de uma moldura sem a API, explica o motivo')
    ctx.close()
    check.done()
