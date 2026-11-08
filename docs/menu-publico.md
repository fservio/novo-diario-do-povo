# Menu público unificado

Publicado em 2026-11-06, implantação `99612da0`.

O menu hambúrguer agora usa as editorias ativas do CMS em todas as páginas públicas, independentemente dos links contextuais recebidos por cada página. A lista vem de `getActiveCategories`, com cache de dez minutos. A ordem respeita a configuração do CMS. Meu dia e Extra! Extra! aparecem uma única vez, antes das editorias; a página atual recebe `aria-current`.

`packages/core/middleware/public-menu.ts` usa HTMLRewriter para completar o menu do layout editorial e o menu móvel legado. No legado, preserva assinatura e acesso à conta. O middleware é registrado antes das rotas públicas, inclusive no empacotamento controlado de produção. Ele não reescreve CMS, APIs ou arquivos estáticos. A navegação contextual horizontal continua independente. Se a consulta de editorias falhar, a resposta original é preservada.

Comparação em produção: início, últimas notícias, Meu dia, jogo, formulário, categoria, matéria e evento retornaram as mesmas 13 editorias ativas, sem duplicar Meu dia ou o jogo. Relatórios em `artifacts/public-menu/before.json` e `after.json`. Navegador isolado a 1440 e 390 pixels confirmou abertura, acesso ao fim da lista, fechamento por Escape e ausência de rolagem horizontal nas páginas Meu dia, jogo e matéria.

Quatro testes em `tests/unit/public-menu.test.ts` cobrem consistência entre páginas, duplicatas/inativos, indicação da página atual, escape dos dados e paridade entre os dois layouts.
