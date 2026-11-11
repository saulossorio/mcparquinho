"""Row marks (one, Shift ranges, all in the list, with filters, keyboard) and menus kept inside the window."""
from helpers import Checks, need, open_file, open_menu, settle, wait_rows


def sel_text(page):
    return '' if page.is_hidden('#selbar') else page.inner_text('#sel-text')


def box(r):
    return f'#grid tbody tr:nth-child({r}) .selrow'


def test_marcar_linhas(open_page):
    check = Checks()
    page = open_page(viewport=(1366, 768))
    wait_rows(page, 100)
    page.click(box(1))
    check(sel_text(page) == '1 linha marcada' and 'sel' in page.get_attribute('#grid tbody tr:nth-child(1)', 'class'), 'marcar uma linha')
    page.click(box(5), modifiers=['Shift'])
    check(sel_text(page) == '5 linhas marcadas', 'Shift+clique marca o intervalo')
    page.click('#grid tbody tr:nth-child(10) .rn span:last-child')
    check(sel_text(page) == '6 linhas marcadas', 'clicar no número da linha também marca')
    check(page.evaluate('document.getElementById("sel-all").indeterminate'), 'cabeçalho parcial')
    page.click('#pg-next')
    wait_rows(page)
    check(sel_text(page) == '6 linhas marcadas' and not page.is_checked(box(1)), 'marcas continuam ao trocar de página')
    page.click('#pg-prev')
    wait_rows(page)
    check(page.is_checked(box(3)) and page.is_checked(box(10)) and not page.is_checked(box(7)), 'linhas marcadas aparecem ao voltar')
    page.click(box(100))
    page.click('#pg-next')
    wait_rows(page)
    page.click(box(3), modifiers=['Shift'])
    check(sel_text(page) == '10 linhas marcadas', 'Shift+clique de uma página para outra')
    page.click('#sel-all')
    check(sel_text(page) == '480 linhas marcadas' and page.is_checked('#sel-all'), 'cabeçalho marca todas')
    page.click('#sel-all')
    check(page.is_hidden('#selbar'), 'clicar de novo desmarca todas')

    open_menu(page, 'uf')
    page.uncheck('#hm-all')
    page.check('#hm-list li:has(.v:text-is("SP")) input')
    page.click('#hm-ok')
    settle(page)
    page.click('#sel-all')
    check(sel_text(page) == '146 linhas marcadas', 'com filtro, marcar todas pega só o resultado')
    page.click('#qbar-clear')
    page.wait_for_function('() => document.getElementById("qbar").hidden', timeout=30000)
    wait_rows(page)
    check(sel_text(page) == '146 linhas marcadas' and page.evaluate('document.getElementById("sel-all").indeterminate'), 'sem filtro as marcas continuam')
    page.fill('#q', 'silva')
    page.wait_for_function('() => document.getElementById("pg-range").textContent.includes("no resultado")', timeout=30000)
    settle(page)
    check('fora dele' in sel_text(page), 'contador separa o que está fora do resultado')
    page.click('#sel-clear')
    check(page.is_hidden('#selbar'), 'Desmarcar todas')

    page.focus('#grid-wrap')
    page.keyboard.press('ArrowDown')
    page.keyboard.press(' ')
    check(sel_text(page) == '1 linha marcada', 'Espaço marca a linha ativa')
    page.keyboard.press('Enter')
    page.wait_for_selector('#cell-dialog[open]')
    page.keyboard.press('Escape')
    check(not page.errors, f'sem erros ({page.errors[:2]})')
    check.done()


def test_menus_dentro_da_janela(open_page):
    need('types.parquet')
    check = Checks()
    page = open_page()
    wait_rows(page, 100)
    open_file(page, 'types.parquet', 'i8')
    for w, h in [(1366, 820), (1100, 640), (900, 560), (390, 740)]:
        page.set_viewport_size({'width': w, 'height': h})
        page.wait_for_timeout(200)
        open_menu(page, 'i16')
        r = page.evaluate("""() => { const m = document.getElementById('hmenu').getBoundingClientRect();
          const ok = document.getElementById('hm-ok').getBoundingClientRect();
          return [m.top, m.bottom, ok.bottom, m.right, innerHeight, innerWidth] }""")
        check(r[0] >= 0 and r[1] <= r[4] and r[2] <= r[4] and r[3] <= r[5], f'menu inteiro na tela em {w}x{h}')
        page.keyboard.press('Escape')
    check.done()


def test_tabela_ocupa_a_maior_parte(open_page):
    check = Checks()
    page = open_page(viewport=(1366, 768))
    wait_rows(page, 100)
    page.click('#sample-close')
    page.wait_for_timeout(100)
    h = page.evaluate("document.getElementById('grid-wrap').getBoundingClientRect().height / innerHeight")
    check(h > 0.7, f'tabela com {h:.0%} da altura numa tela de 1366×768')
    page.click('#summary-toggle')
    check(page.is_visible('#summary'), 'Resumo abre os detalhes do arquivo')
    check.done()
