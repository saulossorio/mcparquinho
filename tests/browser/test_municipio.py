"""Optional município column: detection, unknown codes, selector, detail, export and copy, zero-padded text codes."""
import openpyxl

from helpers import ROOT, Checks, column, headers, need, open_file, saved_xlsx, wait_rows

NAMES = dict(line.rstrip('\n').split('\t', 1) for line in open(ROOT / 'data' / 'municipios-mt.tsv', encoding='utf-8')
             if line.strip() and not line.startswith('#'))


def has_muni(page):
    page.wait_for_function('() => [...document.querySelectorAll("#grid thead .cn")].some(e => e.textContent === "município")', timeout=30000)


def test_coluna_de_municipio(open_page, tmp_path):
    need('vendas_mt.parquet', 'cadastro_mt.parquet')
    check = Checks()
    page = open_page(permissions=['clipboard-read', 'clipboard-write'])
    wait_rows(page, 100)
    check(page.is_visible('#muni-field') and page.input_value('#muni-col') == '' and 'município' not in headers(page),
          'exemplo sem códigos: seletor em "não mostrar"')

    open_file(page, 'vendas_mt.parquet', 'id')
    has_muni(page)
    h = headers(page)
    codes, names = column(page, 'cod_municipio'), column(page, 'município')
    ok = all((n == NAMES.get(c) if c in NAMES else (n == 'null' if c == 'null' else n == '—')) for c, n in zip(codes, names))
    check(h.index('município') == h.index('cod_municipio') + 1 and page.input_value('#muni-col') == 'cod_municipio', 'detecta a coluna e põe o nome ao lado')
    check(ok and '—' in names and 'null' in names, 'nomes conferem; código fora da lista vira —')
    page.click('#grid tbody tr:nth-child(1) td.virt')
    page.wait_for_selector('#cell-dialog[open]')
    check(page.inner_text('#cell-title') == 'município' and codes[0] in page.inner_text('#cell-body'), 'detalhe mostra nome e código')
    page.click('#cell-close')

    page.select_option('#muni-col', '')
    page.wait_for_function('() => ![...document.querySelectorAll("#grid thead .cn")].some(e => e.textContent === "município")')
    page.click('#cols-btn')
    page.uncheck('#col-list input[data-name="cod_municipio"]')
    page.keyboard.press('Escape')
    page.wait_for_function('() => ![...document.querySelectorAll("#grid thead .cn")].some(e => e.textContent === "cod_municipio")')
    page.select_option('#muni-col', 'cod_municipio')
    has_muni(page)
    check('cod_municipio' in headers(page), 'escolher a coluna no seletor volta a mostrá-la')

    page.click('#export-btn')
    page.wait_for_selector('#export-dialog[open]')
    page.check('input[name="exp-rows"][value="all"]')
    check('1.000 linhas × 5 colunas' in page.inner_text('#exp-estimate') and '+ município' in page.inner_text('#exp-vis-label'),
          'município conta como coluna na exportação')
    page.click('#exp-go')
    saved_xlsx(page, tmp_path / 'muni.xlsx')
    ws = openpyxl.load_workbook(tmp_path / 'muni.xlsx').active
    hdr = [c.value for c in ws[1]]
    j = hdr.index('cod_municipio (município)')
    good = all((r[j] == NAMES.get(str(r[j - 1])) if r[j - 1] is not None and str(r[j - 1]) in NAMES else r[j] is None)
               for r in ws.iter_rows(min_row=2, values_only=True))
    check(hdr[j - 1] == 'cod_municipio' and good and ws.max_row == 1001, 'xlsx tem o nome ao lado do código')
    page.click('#exp-cancel')

    page.click('#export-btn')
    page.wait_for_selector('#export-dialog[open]')
    page.click('#exp-copy')
    page.wait_for_function('() => document.getElementById("exp-result").textContent.includes("Pronto para copiar")', timeout=30000)
    page.click('#exp-go')
    page.wait_for_function('() => document.getElementById("exp-result").textContent.startsWith("Copiado")', timeout=10000)
    text = page.evaluate('navigator.clipboard.readText()')
    check(text.split('\r\n')[0].split('\t')[3] == 'cod_municipio (município)', 'cópia inclui a coluna de município')
    page.click('#exp-cancel')

    open_file(page, 'cadastro_mt.parquet', 'nome')
    has_muni(page)
    codes, names = column(page, 'codigo'), column(page, 'município')
    check(all(NAMES[c.lstrip('0')] == n for c, n in zip(codes, names)), 'códigos em texto com zeros à esquerda')
    check(not page.errors, f'sem erros ({page.errors[:2]})')
    check.done()
