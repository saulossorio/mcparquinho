# McParquinho

Visualizador de arquivos Parquet que roda só no navegador: abra um `.parquet`, navegue, busque, filtre, ordene, marque linhas e exporte para o Excel. O arquivo não sai do seu computador.

**Abrir:** https://saulossorio.github.io/mcparquinho/

## O que faz

- **Abre qualquer Parquet** pelo botão "Abrir arquivo" ou arrastando para a página. Lê só as partes necessárias, então arquivos grandes abrem rápido. Ao carregar, mostra um arquivo de exemplo.
- **Valores exatos:** inteiros de 64 bits, decimais de até 38 dígitos, timestamps em nanossegundos, datas, horas, INT96, FLOAT16, UUID, JSON, BSON, INTERVAL, ENUM, geometrias (como GeoJSON), listas, mapas e structs.
- **Compressões:** Snappy, Gzip, Brotli, LZ4, LZ4_RAW e Zstd.
- **Navegação:** páginas de 50 a 500 linhas, barra de row groups para pular para qualquer parte do arquivo (clique, arraste ou teclado), escolha de colunas e detalhe da célula com clique ou Enter.
- **Busca, filtro e ordem por coluna**, como numa tabela do Excel: a busca procura em todas as colunas visíveis; o menu de cada cabeçalho ordena (crescente ou decrescente) e filtra por condição (igual, maior que, entre, contém, começa com, antes de...) ou por lista de valores.
- **Marcar linhas** para contar: caixa ao lado do número da linha, Shift para marcar um intervalo, caixa do cabeçalho para todas as linhas da lista (com busca e filtros aplicados).
- **Município de Mato Grosso:** quando uma coluna tem códigos de município de MT, a página mostra o nome ao lado. No seletor "Município" dá para escolher outra coluna ou desligar.
- **Esquema e Metadados:** tipos, anotações, nulos, tamanhos, codificações, estatísticas, row groups e column chunks.
- **Exportar para Excel (.xlsx):** página atual, todas as linhas ou um intervalo; colunas visíveis ou todas; com busca, filtros e ordem aplicados. Números com mais de 15 dígitos podem ficar como texto para não perder precisão. Também dá para "Copiar para colar no Excel" sem baixar arquivo.
- **Tema claro e escuro**, conforme o sistema.

## Teclado

Na tabela:

| Tecla | Ação |
| --- | --- |
| Setas | mover a célula ativa |
| Home, End | primeira ou última coluna |
| Page Up, Page Down | página anterior ou seguinte |
| Enter | detalhe da célula |
| Espaço | marcar ou desmarcar a linha (com Shift, o intervalo desde a última marcada) |

Na barra de row groups: setas, Page Up, Page Down, Home e End.

## Privacidade

O arquivo é lido no próprio navegador, sem upload para lugar nenhum. A página só baixa a biblioteca de leitura ([hyparquet](https://github.com/hyparam/hyparquet), de cdn.jsdelivr.net) e as fontes (Google Fonts).

## Limites

- Busca, filtro e ordem carregam na memória as colunas usadas, do arquivo inteiro: até 5 milhões de células (linhas × colunas). Acima disso, oculte colunas.
- Arquivos com mais de 200 colunas abrem com as 200 primeiras visíveis; as outras ficam no seletor "Colunas".
- Excel: até 1.048.575 linhas, 16.384 colunas e 32.767 caracteres por célula.
- "Copiar para colar no Excel": até 200 mil células.
- Arquivos Parquet criptografados não são suportados.

## No Claude

O McParquinho também roda como artefato no Claude. Lá, "Baixar .xlsx" usa a permissão de downloads do Claude. Se a visualização não permitir baixar arquivos, a página explica o motivo e "Copiar para colar no Excel" continua funcionando.

## Desenvolvimento

Requisitos: Node 22 ou mais novo; para os testes, Python 3.12 ou mais novo.

```bash
npm ci                                   # dependências: esbuild e as versões fixas do hyparquet
npm run build                            # src/ → index.html
pip install -r requirements-dev.txt      # Python dos testes
python3 -m playwright install chromium
npm run testdata                         # dados de teste em testdata/
npm test                                 # testes unitários
npm run test:browser                     # testes no navegador
npm run verify                           # build + todos os testes
```

O `index.html` da raiz é gerado: mude os arquivos de `src/` e rode `npm run build`. O mapa do código, as regras, as receitas de mudança e as decisões de projeto estão em [AGENTS.md](AGENTS.md).

```
src/          código: core (sem DOM), query, ui, styles e o modelo da página
data/         arquivo de exemplo e lista de municípios de MT
scripts/      build e geradores de dados
tests/        unit (Node) e browser (Playwright)
index.html    gerado pelo build; é o que o GitHub Pages serve
```

Cada push na `main` publica no GitHub Pages (raiz da branch). O CI (`.github/workflows/ci.yml`) confere o build e roda todos os testes. Histórico de mudanças em [CHANGELOG.md](CHANGELOG.md).

## Créditos

Leitura de Parquet com [hyparquet](https://github.com/hyparam/hyparquet) e [hyparquet-compressors](https://github.com/hyparam/hyparquet-compressors); Zstd com [fzstd](https://github.com/101arrowz/fzstd).
