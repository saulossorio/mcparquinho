# AGENTS.md

Guia para agentes de IA (e pessoas) que vão mudar o McParquinho. Comece por aqui: este arquivo tem o mapa do código, os comandos, as regras, as receitas de mudança e as decisões já tomadas, para que nenhuma mudança precise de uma releitura do projeto inteiro.

Se uma mudança deixar este arquivo desatualizado (arquivo novo, regra nova, decisão revista), atualize-o no mesmo commit.

## Resumo

- Página única que abre arquivos Parquet no navegador, com busca, filtros, ordem, marcação de linhas e exportação para Excel. O arquivo do usuário nunca sai do computador dele.
- Publicada no GitHub Pages a partir da raiz da branch `main`: https://saulossorio.github.io/mcparquinho/. Também roda como artefato no Claude (veja [Publicação](#publicação)).
- O código fica em `src/` (módulos ES). O `index.html` da raiz é **gerado** por `npm run build`: um arquivo só, com CSS, JS e o arquivo de exemplo embutidos.
- A biblioteca de leitura (hyparquet e os descompressores) não entra no bundle: a página importa do jsDelivr, na versão fixada em `package.json`.
- Interface em português do Brasil. Código, comentários e nomes em inglês.

## Regras

1. **Nunca edite `index.html` à mão.** Mude `src/`, rode `npm run build` e faça commit de `src/` e `index.html` juntos. O CI roda `npm run check` e falha se os dois não baterem.
2. **Camadas** (conferidas por `tests/unit/architecture.test.mjs`):
   - `src/core/`: leitura do Parquet, valores exatos, formatação, escrita do .xlsx e da cópia. Só importa de `core/` e não usa DOM nem globais do navegador. Roda no Node.
   - `src/query/`: busca, filtro e ordem, puros. Importa só de `core/`. Sem DOM.
   - `src/ui/`: tudo o que mexe na página. Pode importar de `core/`, `query/`, `ui/` e `data/`.
   - `src/main.js`: ponto de entrada. Ninguém importa `main.js`. Nenhum módulo importa pacotes do npm: bibliotecas vêm do CDN (`ui/libs.js`).
3. **Valores exatos.** Inteiros de 64 bits são `BigInt`, decimais são `PDec` (texto), timestamps são `PTime` (nanossegundos em `BigInt`), datas são `PDate`. Nunca converta para `Number` ou `Date` para mostrar, filtrar ou exportar.
4. **Versões fixas.** hyparquet, hyparquet-compressors e fzstd ficam em `devDependencies` com versão exata. O build monta as URLs do CDN com essas versões e os testes servem os mesmos arquivos de `node_modules`.
5. **Estado em um lugar só.** O único objeto mutável da página é `state`, em `src/ui/state.js`. Campo novo: declare lá, com comentário.
6. **Eventos em um lugar só.** Toda ligação de evento do DOM fica em `src/ui/events.js` (`wire()`).
7. **Cabeçalho em todo módulo.** A primeira linha de cada `.js` de `src/` é `// o que este arquivo faz` (o teste confere). Os CSS começam com um comentário `/* ... */` do mesmo tipo.
8. **Texto do arquivo em HTML passa por `esc()`** (`ui/dom.js`). Números na interface usam `fmt`/`nf` (pt-BR).
9. **Antes do commit:** `npm run verify` (build, testes unitários e testes no navegador). Mudou algo que o usuário vê: atualize `README.md` e `CHANGELOG.md`. Mudou arquivo, regra ou decisão: atualize este arquivo.

## Comandos

| Para | Rode |
| --- | --- |
| Instalar as dependências (Node 22+) | `npm ci` |
| Gerar `index.html` | `npm run build` |
| Conferir se `index.html` está em dia com `src/` | `npm run check` |
| Instalar o Python dos testes (3.12+) | `pip install -r requirements-dev.txt` e `python3 -m playwright install chromium` |
| Gerar os dados de teste em `testdata/` | `npm run testdata` (uns 15 s, 230 MB; `python3 scripts/gen_testdata.py` sem `--big` pula os arquivos de 3 milhões de linhas) |
| Testes unitários (Node) | `npm test` |
| Testes no navegador (Playwright) | `npm run test:browser` |
| Tudo o que precisa passar antes do commit | `npm run verify` |
| Usar um Chrome já instalado nos testes | `CHROME_PATH=/usr/bin/google-chrome python3 -m pytest tests/browser -q` |
| Rodar um teste do navegador | `python3 -m pytest tests/browser/test_query.py -q -k municipio -s` (`-s` mostra cada verificação) |
| Regerar o arquivo de exemplo | `python3 scripts/gen_sample.py` e depois `npm run build` |
| Ver a página localmente | `python3 -m http.server 8000` na raiz e abrir http://localhost:8000/ |

Testes que dependem de `testdata/` são pulados, com uma mensagem, quando os arquivos não existem.

## Mapa do repositório

```
index.html                  GERADO por npm run build. É o que o GitHub Pages serve.
src/
  index.html                modelo da página (marcação); o build troca /*__CSS__*/ e /*__JS__*/
  main.js                   ponto de entrada: init()
  core/                     sem DOM; roda no navegador e no Node
  query/engine.js           busca, filtro e ordem, sem DOM
  ui/                       a página: estado, eventos, telas
  styles/                   CSS, concatenado na ordem de STYLES em scripts/build.mjs
data/
  exemplo-vendas.parquet    exemplo aberto ao carregar (o build embute em base64)
  municipios-mt.tsv         código<TAB>NOME dos 142 municípios de MT
scripts/
  build.mjs                 esbuild + CSS + modelo → index.html; --check só compara
  gen_testdata.py           gera testdata/ e os .expected.json (valores lidos pelo pyarrow)
  gen_sample.py             gera data/exemplo-vendas.parquet (determinístico)
tests/
  unit/                     node:test (npm test)
  browser/                  pytest + Playwright (npm run test:browser)
.github/workflows/ci.yml    CI: build conferido, dados de teste, testes unitários e no navegador
package.json                scripts npm; versões exatas de esbuild, hyparquet, hyparquet-compressors e fzstd
requirements-dev.txt        Python dos testes, versões exatas
README.md                   para quem usa a página e para começar a desenvolver
AGENTS.md                   este guia (CLAUDE.md só aponta para ele)
CHANGELOG.md                histórico de mudanças
.nojekyll                   o Pages serve os arquivos como estão
.editorconfig, .gitattributes, .gitignore
```

### `src/core/` (sem DOM)

| Arquivo | Responsabilidade | Exports principais |
| --- | --- | --- |
| `values.js` | Tipos de valor exatos e utilitários de bytes | `PTime`, `PDate`, `PTimeOfDay`, `PDec`, `PInterval`, `PMap`, `Bin`, `strictUtf8`, `toBytes` |
| `types.js` | Descreve cada coluna: categoria da folha (`cat`), rótulo, forma (lista, mapa, struct) | `describe`, `describeLeaf`, `family`, `TIME_UNITS` |
| `convert.js` | Parsers do hyparquet e normalização dos valores crus para os tipos de `values.js` | `makeParsers`, `readMetadataFor`, `normalize`, `toDecimal`, `decimalText` |
| `format.js` | Texto dos valores (datas, timestamps, números, binário, aninhados) e das estatísticas | `cellText`, `scalarText`, `serialize`, `formatDate`, `formatTimestamp`, `statText` |
| `reader.js` | Abre o arquivo, carrega descompressores sob demanda, lê linhas das colunas escolhidas | `openParquet`, `readRows`, `lruBuffer`, `makeCompressorLoader`, `ParquetError`, `exportChunks` |
| `metadata.js` | Resumos das abas Esquema e Metadados (tamanhos, nulos, codificações, estatísticas) | `schemaRows`, `leafAggregates`, `chunkStats`, `annotationText` |
| `xlsx.js` | Escritor de .xlsx em streaming (OOXML + ZIP com deflate nativo) e as regras de célula do Excel | `writeXlsx`, `excelCell`, `outputColumns`, `xmlText`, `EXCEL_MAX_*` |
| `clipboard.js` | Tabela HTML + TSV de "Copiar para colar no Excel" | `clipboardTable`, `COPY_MAX_CELLS` |
| `index.js` | Reexporta tudo, para testes e ferramentas (a página importa os módulos direto) | |

### `src/query/`

| Arquivo | Responsabilidade | Exports principais |
| --- | --- | --- |
| `engine.js` | Busca, filtros e ordem sobre colunas em memória: chaves de comparação, texto sem acento, condições, listas de valores, leitura de números e datas digitados em pt-BR | `MAX_TABLE_CELLS`, `fold`, `keyOf`, `sortIndices`, `distinctValues`, `makeCondition`, `OPS`, `parseNumber`, `parseMoment` |

### `src/ui/`

| Arquivo | Responsabilidade |
| --- | --- |
| `state.js` | Limites da interface e o objeto `state`, com cada campo comentado |
| `dom.js` | `$` (por id), `esc`, números pt-BR (`fmt`, `nf`), `plural`, `bytesText`, `storageGet`/`storageSet` |
| `libs.js` | URLs do CDN montadas com as versões do `package.json` (`__LIB_VERSIONS__`, trocado pelo build) |
| `events.js` | `wire()`: todas as ligações de eventos |
| `files.js` | Abrir arquivo (botão, arrastar e soltar, exemplo embutido), zerar a tela, faixa de erro |
| `layout.js` | Chip do arquivo, resumo recolhível, linha compacta de informações, abas |
| `grid.js` | Tabela: leitura da página (do arquivo ou do resultado da busca), desenho, paginação, teclado |
| `slider.js` | Barra de row groups: segmentos, marcador da página, arrastar, clicar, teclado |
| `columns.js` | Seletor de colunas visíveis |
| `municipio.js` | Coluna opcional "município": lista código → nome, detecção da coluna de códigos, seletor |
| `query-state.js` | Liga busca, filtros e ordem à página: carrega colunas inteiras na memória e calcula a lista de resultado |
| `column-menu.js` | Menu do cabeçalho (ordem, condição, lista de valores com busca), sempre dentro da janela (`placeMenu`) |
| `marks.js` | Marcação de linhas (caixa ao lado do número, Shift para intervalo, todas da lista) e contador |
| `detail.js` | Diálogo de detalhe da célula e cópia do valor |
| `schema-view.js` | Aba Esquema |
| `meta-view.js` | Aba Metadados (fatos do arquivo, metadados chave-valor, row groups, column chunks) |
| `export-dialog.js` | Diálogo de exportação: baixar .xlsx e copiar para o Excel em dois passos |
| `downloads.js` | Onde salvar: capacidade `downloads` do Claude, link comum num site normal, ou aviso com o motivo |

### `src/styles/` (na ordem do build)

| Arquivo | Conteúdo |
| --- | --- |
| `tokens.css` | Variáveis de cor, fonte e espaço; paleta clara em `:root`, escura por `prefers-color-scheme` e `data-theme`. Estilize tudo por elas |
| `layout.css` | Elementos base e a moldura: barra do topo, avisos, resumo, abas |
| `data.css` | Aba Dados: barra de row groups, ferramentas, busca, menus de coluna, seletor, tabela, linhas marcadas |
| `views.css` | Abas Esquema e Metadados |
| `dialogs.css` | Diálogos (detalhe, exportação), área de soltar arquivo, mensagem de carregamento ou falha |
| `responsive.css` | Celular e movimento reduzido. Sempre por último |

## Como a página funciona

1. **Início.** `main.js` chama `wire()` e `detectDownloads()`, importa o hyparquet do CDN para `state.lib` e abre o exemplo (`openSource(sampleSource(), true)`).
2. **Abrir arquivo.** `files.js openSource()` chama `core/reader.js openParquet()`, que lê só o rodapé e devolve `ctx` (colunas descritas, `byName`, row groups, `numRows`). Busca, filtros, marcas e município são zerados e cada parte se desenha (`layout`, `columns`, `schema-view`, `meta-view`, `slider`, `grid`).
3. **Página de dados.** `grid.js loadPage()` chama `readRows()`, que lê só as colunas visíveis dos row groups da página (`File.slice`, com o cache `lruBuffer`). `renderGrid()` desenha com `cellText()` e acrescenta a coluna de município (`viewColumns()`).
4. **Busca, filtro e ordem.** `query-state.js applyQuery()` chama `ensureTable()`, que carrega na memória as colunas usadas, do arquivo inteiro (`state.table`, até `MAX_TABLE_CELLS`). `query/engine.js` calcula `state.result` (`Uint32Array` com as linhas na ordem) e `loadQueryPage()` pagina a partir da memória.
5. **Exportar.** `export-dialog.js` chama `core/xlsx.js writeXlsx()`, que lê as linhas em blocos e grava o ZIP em streaming; `downloads.js` salva pelo Claude ou baixa pelo navegador. A cópia é feita em dois cliques: `prepareCopy()` monta HTML + TSV com `clipboardTable()` e `copyNow()` copia no segundo clique.

## Receitas

### Mudar um texto, rótulo ou mensagem

Texto fixo fica em `src/index.html`. Texto montado em código: `grep -rn "trecho da frase" src/`. Depois `npm run build`. Se a frase aparece num teste do navegador, ajuste o teste.

### Adicionar um controle na interface

1. Marcação com `id` em `src/index.html`.
2. Estilo no CSS da área, com as variáveis de `tokens.css`.
3. Comportamento no módulo da área em `src/ui/` (ou num módulo novo, com a linha de cabeçalho).
4. Ligação do evento em `src/ui/events.js`.
5. Estado novo declarado e comentado em `src/ui/state.js`.
6. Teste em `tests/browser/` (veja [Testes](#testes)).

### Suportar um tipo ou anotação do Parquet

1. `core/types.js` (`describeLeaf`): categoria e rótulo.
2. `core/convert.js`: parser ou normalização para um tipo de `values.js` (crie o tipo lá se nenhum servir).
3. `core/format.js` (`scalarText`, `cellText`): como aparece na tabela.
4. `core/xlsx.js` (`excelCell`): como vai para o Excel (número, data ou texto).
5. `query/engine.js` (`keyOf`, `sortFamily`, `condFamily`): como ordena e filtra.
6. `core/metadata.js` (`annotationText`): nome na aba Esquema.
7. Uma coluna com o tipo em `scripts/gen_testdata.py` (`small_files()`): o `.expected.json` vem do pyarrow e `tests/unit/core.test.mjs` compara sozinho.

### Atualizar a lista de municípios

Edite `data/municipios-mt.tsv`: uma linha `código<TAB>NOME`, código sem zeros à esquerda; linhas que começam com `#` são comentário. Se o total deixar de ser 142, ajuste o número em `tests/unit/architecture.test.mjs`. Depois `npm run build`. Os testes do navegador e `gen_testdata.py` leem o próprio TSV (o código `77777` é usado nos testes como código fora da lista).

### Atualizar o hyparquet, hyparquet-compressors ou fzstd

1. `npm install --save-dev --save-exact hyparquet@X.Y.Z` (versão exata; o build recusa faixas).
2. `npm run build`: as URLs do CDN mudam sozinhas.
3. `npm test` e os testes do navegador (servem o CDN a partir de `node_modules` e recusam outra versão).
4. Veja se a proteção contra página LZ4 vazia em `core/reader.js makeCompressorLoader` ainda é necessária.
5. Commit de `package.json`, `package-lock.json` e `index.html`.

Biblioteca nova do CDN: `devDependencies` com versão exata, nome em `CDN_LIBS` (`scripts/build.mjs`), URL em `ui/libs.js`, e o caminho em `node_modules` para os testes unitários (`tests/unit/helpers.mjs`).

### Mudar a aparência

Cores, fontes, raios e espaços são variáveis em `src/styles/tokens.css`, com as duas paletas (clara e escura). As regras de cada área ficam no arquivo da área. `test_marks.py` confere que a tabela ocupa mais de 70% da altura em 1366×768 e que os menus ficam dentro da janela em quatro tamanhos de tela.

### Adicionar um módulo

Escolha a camada pela regra 2, comece com a linha de cabeçalho, use exports nomeados e imports relativos terminados em `.js`, e acrescente o arquivo ao mapa acima. Módulos de `ui/` se importam em ciclo (por exemplo `grid.js` e `municipio.js`): isso funciona porque só usam os imports dentro de funções. Não chame nada importado no nível do módulo (é por isso que `state.query` é um objeto literal em `state.js`).

## Testes

`tests/unit/` (Node, `npm test`):

| Arquivo | Confere |
| --- | --- |
| `core.test.mjs` | Cada arquivo de `testdata/` lido inteiro e em páginas, comparado com o `.expected.json`; arquivos grandes por faixas; arquivos com erro dão a mensagem certa. `KNOWN` lista as diferenças aceitas (valores INT96 nos extremos do calendário, que o pyarrow não representa) |
| `query.test.mjs` | Ordem, condições e listas de valores |
| `xlsx.test.mjs` | Abre o ZIP gerado (com CRC) e confere partes, células, escapes e coluna derivada |
| `architecture.test.mjs` | Camadas, linha de cabeçalho, caracteres invisíveis e de controle, formato do TSV de municípios |

`tests/browser/` (pytest + Playwright, sem rede: a página vem do `index.html` e o CDN de `node_modules`):

| Arquivo | Confere |
| --- | --- |
| `test_viewer.py` | Exemplo, navegação, slider, teclado e exportação; tipos e erros; arquivos especiais; arquivo de 3 milhões de linhas |
| `test_query.py` | Busca, filtros, ordem e exportação filtrada conferidos com o pyarrow; filtro por município; limite de memória |
| `test_marks.py` | Marcação de linhas; menus dentro da janela; espaço da tabela e resumo recolhível |
| `test_municipio.py` | Detecção, nomes, detalhe, seletor, coluna no .xlsx e na cópia, códigos com zeros à esquerda |
| `test_downloads.py` | Claude sem downloads (aviso e cópia), API como variável global `claude`, site normal (download do navegador), moldura sem API |

Peças de `tests/browser/helpers.py` e `conftest.py`:

- `open_page(...)` (fixture): abre a página; por padrão injeta `MOCK_DOWNLOADS`, que guarda o que a página salva em `window.__saves`. Aceita `init_script=None`, `viewport=(w, h)`, `goto=False` e opções de contexto do Playwright (`permissions`, `accept_downloads`).
- `open_file(page, nome, primeira_coluna)`: abre um arquivo de `testdata/` e espera ele aparecer. Use sempre, porque a tabela anterior continua na tela até a nova ficar pronta.
- `Checks`: junta as verificações com nome, imprime cada uma e falha no fim listando todas as que falharam.
- `saved_xlsx`, `open_menu`, `settle`, `column`, `cell`, `headers`, `total`, `need` (pula o teste sem os dados).

## Decisões (não desfazer sem um motivo novo)

| Decisão | Por quê |
| --- | --- |
| hyparquet do CDN, não embutido | Mantém `index.html` em uns 220 KB e igual no Pages e no Claude. A versão fixa evita mudança de comportamento sem aviso |
| `index.html` gerado e versionado | O Pages serve a raiz da `main` sem etapa de build e o artefato do Claude é um arquivo só. `npm run check` no CI garante que bate com `src/` |
| Escritor .xlsx próprio | SheetJS montava a planilha inteira na memória e travava a aba em exportações grandes. O nosso grava em streaming com `CompressionStream('deflate-raw')` |
| Valores exatos (`BigInt`, `PDec`, `PTime`) | `Number` e `Date` perdem dígitos e nanossegundos. As anotações DECIMAL, INTERVAL e BSON são retiradas antes da leitura (`readMetadataFor`) para o hyparquet entregar os bytes crus |
| No .xlsx, números com mais de 15 dígitos significativos viram texto (opção marcada por padrão) | O Excel guarda só 15 dígitos |
| UTF-8 estrito | Bytes inválidos aparecem como binário (`Bin`) em vez de virar `�` sem aviso |
| Escapes do Excel | Texto que já parece `_xHHHH_` ganha `_x005F_`; caracteres de controle viram `_xHHHH_` |
| Busca, filtro e ordem na memória | O Parquet não tem índice para isso; carregar só as colunas usadas é simples e rápido até `MAX_TABLE_CELLS`. Acima disso a página pede para ocultar colunas |
| Coluna de município com nome interno `MUNI_COL` (`String.fromCharCode(2) + 'municipio'`) | Nunca colide com o nome de uma coluna real |
| Detecção do município: coluna visível com 60% ou mais dos códigos na lista, nas linhas já carregadas | Não lê o arquivo de novo; o usuário escolhe outra coluna ou desliga no seletor |
| Copiar para o Excel em dois cliques | Preparar pode demorar e o navegador só deixa copiar dentro de um clique. O HTML com `x:num` e `mso-number-format` mantém números e formatos ao colar |
| Downloads: `claude.use('downloads')` (em `window.claude` ou na variável global `claude`); senão `<a download>` quando a página é a janela principal; senão um aviso com o motivo | No Claude o artefato roda numa moldura que bloqueia downloads comuns; fora dele o link comum funciona |
| Menus posicionados por `placeMenu` (abaixo, acima ou centralizado), com rodapé fixo e `flex-shrink: 0` nos filhos | Menus abriam escondidos atrás da interface em telas baixas |
| Resumo recolhível, fechado por padrão, lembrado no `localStorage` | A tabela precisa da maior parte da tela |

## Armadilhas conhecidas

- Algumas ferramentas de edição transformam um `\u0300` escrito no código no próprio caractere (invisível). Para caracteres especiais em strings e regex, gere com `String.fromCharCode` ou confira com `npm test`: o teste de arquitetura acusa marcas combinantes, caracteres de formato e de controle.
- `node --test tests/unit/` não funciona no Node 22. Use `npm test`, que passa o glob entre aspas.
- O bundle vai dentro de `<script type="module">`: o build troca `</script` por `<\/script` e reescreve como escape os caracteres de controle que o esbuild deixa crus. Os marcadores `/*__CSS__*/` e `/*__JS__*/` só podem aparecer uma vez em `src/index.html`.
- hyparquet-compressors 1.1.2 rejeita página LZ4 vazia; `makeCompressorLoader` devolve bytes vazios sem chamar o descompressor.
- Leituras de página são assíncronas: `state.token` descarta respostas antigas. Ao criar outra leitura, siga o mesmo padrão (incrementar o token e comparar na volta).

## Publicação

- **GitHub Pages:** Settings → Pages → "Deploy from a branch", `main`, `/ (root)`. Cada push na `main` publica em cerca de um minuto. `.nojekyll` faz o Pages servir os arquivos como estão.
- **Artefato no Claude:** "McParquinho", slug `831b85d5-2dc1-4614-aaae-5b5406e3d94a`, um arquivo só (`index.html` gerado), com a capacidade `downloads` declarada (sem ela, "Baixar .xlsx" fica desativado lá dentro). Atualize numa sessão do Claude com as ferramentas de artefato, publicando o `index.html` nesse slug a partir da versão atual.
- **CI:** `.github/workflows/ci.yml`, em push na `main`, em pull request e manualmente.

## Dados guardados no navegador

| Chave do `localStorage` | Valor |
| --- | --- |
| `mcparquinho.resumo` | `'1'` resumo aberto, `'0'` fechado (sem a chave: fechado) |
| `mcparquinho.aviso` | `'0'` depois que o usuário fecha o aviso do arquivo de exemplo |

Use sempre `storageGet`/`storageSet` (`ui/dom.js`), que funcionam mesmo sem `localStorage`.

## Limites

| Limite | Valor | Onde |
| --- | --- | --- |
| Colunas visíveis ao abrir | 200 | `MAX_DEFAULT_COLUMNS` (`ui/state.js`) |
| Segmentos na barra de row groups | 300 (acima disso, uma barra lisa) | `MAX_RG_SEGMENTS` (`ui/state.js`) |
| Row groups listados em Metadados | 1.000 | `MAX_RG_DETAILS` (`ui/state.js`) |
| Linhas por página | 50, 100 (padrão), 250, 500 | `src/index.html` e `state.pageSize` |
| Células na memória para busca, filtro e ordem | 5.000.000 | `MAX_TABLE_CELLS` (`query/engine.js`) |
| Células em "Copiar para colar no Excel" | 200.000 | `COPY_MAX_CELLS` (`core/clipboard.js`) |
| Excel: linhas de dados, colunas, caracteres por célula | 1.048.575, 16.384, 32.767 | `EXCEL_MAX_*` (`core/xlsx.js`) |
| Cache de leitura | 96 MB | `lruBuffer` (`core/reader.js`) |

## Convenções

- JavaScript: módulos ES, 2 espaços, sem ponto e vírgula, aspas simples, exports nomeados, `target` ES2022.
- Python (scripts e testes): 4 espaços; dependências só as de `requirements-dev.txt`.
- Commits em português, no imperativo ou descrevendo o resultado ("Coluna opcional com o nome do município").
- `.editorconfig` e `.gitattributes` definem codificação, fim de linha e indentação.
