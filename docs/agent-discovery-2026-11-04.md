# Descoberta para agentes de IA — 4/11/2026

## Diagnóstico

`/llms.txt`, `/.well-known/ard.json`, `/.well-known/ai-catalog.json` e `/ai-catalog.json` retornavam HTTP 200 com corpo vazio e sem Content-Type. Isso explica tanto os avisos de Markdown/H1/links/conteúdo curto quanto o erro de carregar o JSON no Lighthouse.

## Arquivos publicados

- `public/llms.txt`: H1, resumo do jornal, cobertura do Piauí/Brasil/mundo, links de notícias e editorias, RSS, sitemaps e recursos de descoberta. Não altera direitos de reprodução, regras de rastreamento ou acesso restrito.
- `public/.well-known/ard.json`: manifesto atual de descoberta ARD.
- `public/.well-known/ai-catalog.json` e `public/ai-catalog.json`: cópias idênticas para compatibilidade com consumidores anteriores.
- `public/_routes.json`: mantém as rotas existentes e exclui somente os quatro arquivos da execução do Worker, permitindo sua entrega pelo serviço estático do Pages.
- `public/_headers`: Content-Type correto, nosniff e cache de cinco minutos para esses arquivos.

O catálogo descreve apenas recursos que existem: RSS de notícias (`application/rss+xml`) e índice de sitemaps (`application/xml`), com identificadores vinculados ao domínio e duas consultas representativas por recurso. Não anuncia MCP, WebMCP, autenticação ou serviços de execução inexistentes.

## Validação

O empacotador valida H1/resumo/seções/links em Markdown, igualdade dos três catálogos, regras de roteamento e os esquemas oficiais legado e atual (`ArdManifest`). A instalação local de Ajv 6 valida o subconjunto de palavras-chave compatível com draft-07 usado pelos dois esquemas; a meta-validação draft-2020-12 é desativada, e os schemas baixados e seus hashes ficam registrados em `artifacts/agent-discovery-validation` e no manifesto do release.

RSS, sitemap, editoria Piauí e assinatura retornaram conteúdo público válido. O link `/contato`, embora constasse na navegação do site, também retornava resposta vazia e por isso foi omitido do guia.

Pacote: `artifacts/agent-discovery-release/site`. Base: produção `8bff8e70`. O hash do Worker foi preservado; apenas os quatro documentos estáticos e os dois arquivos de configuração mudaram. Publicação: `0e5c6213.novo-diario-do-povo.pages.dev`.

Após a publicação, os quatro documentos retornaram HTTP 200 e corpo válido no domínio oficial. Markdown entregue como `text/plain; charset=utf-8`; catálogos como `application/json; charset=utf-8`. Os JSON publicados tinham duas entradas.

## Referências

- https://developer.chrome.com/docs/lighthouse/agentic-browsing/llms-txt
- https://llmstxt.org/
- https://github.com/ards-project/ard-spec/blob/main/spec/ard.md
- https://raw.githubusercontent.com/ards-project/ard-spec/main/spec/schemas/ai-catalog.schema.json
- https://raw.githubusercontent.com/ards-project/ard-spec/main/spec/schemas/ard-entry.schema.json

Essa categoria é experimental. A descoberta dos recursos não cria uma integração WebMCP nem representa uma autorização de uso para treinamento.

## Auditoria real após a publicação

PageSpeed Insights móvel confirmou **4/4 em Navegação agêntica**, incluindo “O arquivo llms.txt segue as recomendações” e “O esquema ai-catalog.json é válido”. Nesta execução: desempenho 96, SEO 100, LCP 1,0 s e CLS 0,001. Isso valida os dois avisos solicitados no site publicado; as variações laboratoriais não representam alteração do Worker, que foi preservado byte a byte.

Relatório: https://pagespeed.web.dev/analysis/https-diario-dopovo-com-br-2026-10-14-mudanca-no-tse-reforca-ala-lulista-e-isola-kassio-e-mendonca/mte84tcegt?form_factor=mobile

Evidência: `artifacts/agent-discovery-release/pagespeed-agentic.jpg`.

`npm run build` passou, e uma verificação dos arquivos resultantes confirmou conteúdo idêntico ao de `public/` e roteamento estático correto para os quatro endpoints.
