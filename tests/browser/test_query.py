"""Search, column menus (sort, condition, value list), filtered export, município filter, memory limit."""
import time
import unicodedata

import openpyxl
import pyarrow.parquet as pq
import pytest

from helpers import ROOT, Checks, column, need, open_file, open_menu, saved_xlsx, settle, total, wait_rows


def fold(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').lower()


@pytest.fixture(scope='module')
def expected():
    rows = pq.read_table(ROOT / 'data' / 'exemplo-vendas.parquet').to_pylist()
    return {
        'silva': sum('silva' in fold(r['cliente']) for r in rows),
        'sp': sum(r['uf'] == 'SP' for r in rows),
        'sp_gt500': sum(r['uf'] == 'SP' and float(r['valor_total']) > 500 for r in rows),
        'sao': sum('sao' in fold(r['cidade']) for r in rows),
        'top5': [str(v) for v in sorted((r['valor_total'] for r in rows), reverse=True)[:5]],
        'dates': sum('2026-08-01' <= r['data_pedido'].isoformat() <= '2026-08-03' for r in rows),
        'cities_sao': sorted({r['cidade'] for r in rows if 'sao' in fold(r['cidade'])}),
    }


def clear_all(page):
    page.click('#qbar-clear')
    page.wait_for_function('() => document.getElementById("qbar").hidden', timeout=30000)
    wait_rows(page)


def test_busca_filtros_ordem_no_exemplo(open_page, expected, tmp_path):
    check = Checks()
    page = open_page()
    wait_rows(page, 100)

    page.fill('#q', 'SILVA')
    page.wait_for_function('() => document.getElementById("pg-range").textContent.includes("no resultado")', timeout=30000)
    settle(page)
    check(total(page) == expected['silva'] and all('silva' in c.lower() for c in column(page, 'cliente')), 'busca geral sem diferenciar maiúsculas')
    check(f"Mostrando {expected['silva']} de 480 linhas" in page.inner_text('#qbar-text'), 'faixa de resumo da busca')
    clear_all(page)
    check(total(page) == 480, 'Limpar volta às 480 linhas')

    open_menu(page, 'valor_total')
    page.click('#hm-desc')
    settle(page)
    check(column(page, 'valor_total')[:5] == expected['top5'], 'ordem decrescente exata de valor_total')
    check(page.eval_on_selector('#grid tbody tr:first-child .rn', 'e => e.textContent').strip() != '1', '# mostra a linha original')

    open_menu(page, 'uf')
    page.uncheck('#hm-all')
    page.check('#hm-list li:has(.v:text-is("SP")) input')
    page.click('#hm-ok')
    settle(page)
    check(total(page) == expected['sp'] and set(column(page, 'uf')) == {'SP'}, 'filtro por lista de valores (uf = SP)')
    check(page.eval_on_selector('#grid thead th:has(.cn:text-is("uf")) .hbtn', 'b => b.classList.contains("on")'), 'cabeçalho marca o filtro')

    open_menu(page, 'valor_total')
    page.select_option('#hm-op', 'gt')
    page.fill('#hm-a', '500')
    page.click('#hm-ok')
    settle(page)
    check(total(page) == expected['sp_gt500'] and all(float(v) > 500 for v in column(page, 'valor_total')), 'condição combinada com a lista')
    open_menu(page, 'valor_total')
    page.select_option('#hm-op', 'gt')
    page.fill('#hm-a', 'abc')
    page.click('#hm-ok')
    check(page.is_visible('#hm-error') and 'número' in page.inner_text('#hm-error'), 'condição inválida avisa e não aplica')
    page.keyboard.press('Escape')

    open_menu(page, 'cidade')
    cities = page.eval_on_selector_all('#hm-list .v', 'v => v.map(e => e.textContent)')
    check('Belo Horizonte' not in cities and 'São Paulo' in cities, 'lista de valores respeita os outros filtros')
    page.keyboard.press('Escape')

    clear_all(page)
    open_menu(page, 'cidade')
    page.fill('#hm-search', 'sao')
    shown = page.eval_on_selector_all('#hm-list .v', 'v => v.map(e => e.textContent)')
    page.click('#hm-ok')
    settle(page)
    check(shown == expected['cities_sao'] and total(page) == expected['sao'], 'busca dentro da lista aplica só os valores achados')

    clear_all(page)
    open_menu(page, 'data_pedido')
    page.select_option('#hm-op', 'between')
    page.fill('#hm-a', '01/08/2026')
    page.fill('#hm-b', '2026-08-03')
    page.click('#hm-ok')
    settle(page)
    check(total(page) == expected['dates'], 'datas entre 01/08/2026 e 2026-08-03')

    open_menu(page, 'valor_total')
    page.click('#hm-asc')
    settle(page)
    page.click('#export-btn')
    page.wait_for_selector('#export-dialog[open]')
    check(not page.is_visible('#exp-range-opt') and f"resultado ({expected['dates']})" in page.inner_text('#exp-all-label'), 'diálogo oferece o resultado filtrado')
    page.check('input[name="exp-rows"][value="all"]')
    page.click('#exp-go')
    name, _ = saved_xlsx(page, tmp_path / 'filtrado.xlsx')
    ws = openpyxl.load_workbook(tmp_path / 'filtrado.xlsx').active
    j = [c.value for c in ws[1]].index('valor_total')
    values = [r[j] for r in ws.iter_rows(min_row=2, values_only=True)]
    check(name == 'exemplo-vendas_filtrado.xlsx' and len(values) == expected['dates'] and values == sorted(values), 'xlsx com as linhas filtradas, na ordem da tabela')
    page.click('#exp-cancel')
    check(not page.errors, f'sem erros ({page.errors[:2]})')
    check.done()


def test_filtro_por_municipio(open_page):
    need('vendas_mt.parquet')
    check = Checks()
    page = open_page()
    wait_rows(page, 100)
    open_file(page, 'vendas_mt.parquet', 'id')
    page.wait_for_function('() => [...document.querySelectorAll("#grid thead .cn")].some(e => e.textContent === "município")', timeout=30000)
    check(page.is_hidden('#qbar') and page.input_value('#q') == '', 'arquivo novo começa sem busca nem filtros')
    open_menu(page, 'município')
    page.uncheck('#hm-all')
    page.check('#hm-list li:has(.v:text-is("CUIABA")) input')
    page.click('#hm-ok')
    settle(page)
    check(set(column(page, 'cod_municipio')) == {'9067'} and set(column(page, 'município')) == {'CUIABA'}, 'filtro pelo nome do município')
    check.done()


def test_limite_de_memoria_e_arquivo_grande(open_page):
    need('big_noidx.parquet')
    check = Checks()
    page = open_page()
    wait_rows(page, 100)
    open_file(page, 'big_noidx.parquet', 'id')
    page.fill('#q', 'bebidas')
    page.wait_for_function('() => document.getElementById("qbar").classList.contains("error")', timeout=60000)
    check('limite' in page.inner_text('#qbar-text') and page.input_value('#q') == '', '24 milhões de células: explica o limite e desfaz a busca')
    page.click('#cols-btn')
    page.click('#col-none')
    page.check('#col-list input[data-name="cat"]')
    page.keyboard.press('Escape')
    page.wait_for_function('() => document.querySelectorAll("#grid thead .cn").length === 1', timeout=60000)
    wait_rows(page)
    t0 = time.time()
    open_menu(page, 'cat')
    page.uncheck('#hm-all')
    page.check('#hm-list li:has(.v:text-is("bebidas")) input')
    page.click('#hm-ok')
    settle(page)
    n = total(page)
    check(300000 < n < 450000 and set(column(page, 'cat')) == {'bebidas'}, f'só a coluna cat: filtro em 3 milhões de linhas ({time.time() - t0:.1f}s)')
    check(not page.errors, f'sem erros ({page.errors[:2]})')
    check.done()
