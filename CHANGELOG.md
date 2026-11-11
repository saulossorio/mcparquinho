# Histórico de mudanças

Mudanças que o usuário percebe e mudanças de estrutura do projeto, da mais nova para a mais antiga. Ao mudar algo, acrescente uma linha em "Próxima versão".

## Próxima versão

- Nada ainda.

## 2026-11-11: estrutura do projeto

Sem mudança de comportamento para quem usa a página.

- Código dividido em módulos em `src/` (`core`, `query`, `ui`, `styles`); `index.html` passa a ser gerado por `npm run build` (esbuild) e conferido no CI.
- Versões do hyparquet, hyparquet-compressors e fzstd fixadas em `package.json`; as URLs do CDN saem delas no build.
- Lista de municípios em `data/municipios-mt.tsv` e arquivo de exemplo em `data/exemplo-vendas.parquet`, com o script que o gera.
- Testes unitários (Node) e no navegador (Playwright), dados de teste gerados por script e CI no GitHub Actions.
- Documentação: `README.md`, `AGENTS.md` (guia para agentes de IA), `CLAUDE.md` e este histórico.

## 2026-11-11: marcar linhas, menus sempre visíveis e mais espaço para a tabela (`c4e72b4`)

- Caixa de marcação ao lado do número da linha: uma a uma, Shift+clique para intervalos, caixa do cabeçalho para todas as linhas da lista (só as filtradas quando há filtro), Espaço no teclado. Um contador mostra quantas estão marcadas.
- Menus de filtro abrem para cima ou centralizados quando falta espaço e nunca saem da janela; Aplicar e Cancelar ficam sempre visíveis.
- Resumo do arquivo numa linha compacta, com o botão Resumo para abrir os detalhes; a barra de row groups foi para dentro da aba Dados. A tabela passou de 59% para 77% da altura numa tela de 1366×768.

## 2026-11-10: busca, filtro e ordem por coluna (`c018b1d`)

- Menu em cada cabeçalho para ordenar, filtrar por condição (números, datas, texto) e escolher valores numa lista com busca, como numa tabela do Excel.
- Busca em todas as colunas visíveis.
- Exportação e cópia levam as linhas filtradas, na ordem da tabela. A coluna de município também pode ser filtrada.

## 2026-11-10: coluna opcional com o nome do município (`59e3429`)

- Quando o arquivo tem uma coluna com códigos de município de MT (142 códigos), a tabela mostra o nome ao lado.
- O seletor Município troca a coluna de origem ou desliga a tradução. A coluna também entra no .xlsx e na cópia para o Excel.

## 2026-11-10: exportar para Excel fora do Claude (`669cbd0`)

- No GitHub Pages, "Baixar .xlsx" usa o download normal do navegador; dentro do Claude, a permissão de downloads do visualizador.
- Opção "Copiar para colar no Excel" e barra de row groups arrastável.

## 2026-11-10: primeira versão no GitHub Pages (`e9fdc78`)

- Visualizador de Parquet numa página só: abas Dados, Esquema e Metadados, valores exatos, barra de row groups, detalhe de célula e exportação para .xlsx.
