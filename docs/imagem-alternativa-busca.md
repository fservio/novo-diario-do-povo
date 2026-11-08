# Imagem alternativa para matérias sem destaque

Publicado em 2026-11-06, implantação `a4c8ae84`.

`/static/article-placeholder-v1.png` é uma composição quadrada de 1200×1200 com o arquivo original da logo, sem alteração da marca. Ela ocupa 70% da largura, centralizada nos dois eixos, sobre fundo claro opaco. A forma quadrada evita o recorte horizontal visto quando buscadores apresentam a logo panorâmica em miniaturas quadradas. SVG fonte e script de exportação em `public/static/article-placeholder-v1.svg` e `scripts/generate-article-placeholder.mjs`.

`resolveSocialImage` em `packages/core/web/social.ts` normaliza apenas o fallback `/static/logo-dp.png` para o novo arquivo, incluindo dimensões e MIME. Os três renderizadores de metadados presentes na base de produção recebem o mesmo normalizador pelo empacotamento. Fotografias e artes específicas de compartilhamento mantêm suas URLs. A logo do cabeçalho, do rodapé e da organização nos dados estruturados não é substituída. O construtor de metadados de artigos também retorna diretamente o novo fallback quando não existe foto.

Nove testes de compartilhamento, tipagem e compilação passaram. A página de uma matéria sem foto foi conferida em produção: Open Graph aponta para o PNG quadrado com dimensões 1200×1200; arquivo HTTP 200; logo do cabeçalho preservada.

A atualização de resultados já indexados depende do novo rastreamento e das decisões de apresentação do buscador. A implantação não garante atualização imediata nem impõe ao Google qual miniatura exibir.
