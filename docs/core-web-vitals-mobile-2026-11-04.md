# Core Web Vitals móvel — 4/11/2026

## Evidências anteriores à correção

Search Console: propriedade `sc-domain:dopovo.com.br`, relatório Celular atualizado em 1/11/2026. 4.501 URLs no grupo, zero boas e zero ruins; melhorias necessárias em LCP (3,0 s) e CLS (0,23). Validação ainda não iniciada.

Amostra com dados reais: `/2026/10/14/mudanca-no-tse-reforca-ala-lulista-e-isola-kassio-e-mendonca/`. Dados CrUX dos últimos 28 dias: LCP 3,1 s, CLS 0,23, TTFB 2,9 s.

PageSpeed móvel antes: desempenho 70, FCP 2,7 s, LCP 3,6 s, TBT 190 ms, CLS 0,231. O elemento de LCP foi `h1#articleTitle`; o deslocamento foi atribuído a `article.ed-article`. A inspeção do DOM confirmou que `article_top` reservava 90 px, mas seu AdSense horizontal responsivo crescia para 397 px no celular, deslocando o artigo inteiro. Três folhas CSS bloqueavam a renderização (editorial, engagement e chamada do WhatsApp).

Relatório anterior: https://pagespeed.web.dev/analysis/https-diario-dopovo-com-br-2026-10-14-mudanca-no-tse-reforca-ala-lulista-e-isola-kassio-e-mendonca/ew29dc9fb5?form_factor=mobile

## Correções

- Banners AdSense com formato `horizontal` usam os tamanhos de `sizes_json`, em vez de expansão automática de largura/altura. Espaço reservado considera a maior altura configurada; consultas de contêiner escolhem o tamanho que cabe no espaço disponível. O banner da matéria usa 320×100 no celular e 728×90 no desktop. Anúncios in-article continuam fluidos.
- O carregador preserva as dimensões desses banners e desabilita `full-width-responsive` somente nesses slots.
- CSS editorial e de engagement seguem embutidos no HTML do tema editorial; a chamada de WhatsApp também tem CSS embutido no artigo. Isso retira três requisições do caminho crítico sem aplicar estilos tardiamente.

## Validação e publicação

Typecheck passou; 35 testes passaram em cinco arquivos, incluindo execução do carregador de anúncios, banner fixo, layout, chamada do WhatsApp e liveblog. O Vitest passa a carregar os três CSS reais para verificar o HTML entregue, em vez de substituí-los por strings vazias.

Pacote isolado em `artifacts/cwv-mobile-release/site`, baseado na produção `4de35b13-13ca-4ed6-916e-087a022b433a`. O script `scripts/package-cwv-mobile-release.mjs` verifica o hash da base, substitui apenas as três funções afetadas e o link de CSS do WhatsApp, recompila e exige que somente `_worker.js` tenha mudado. Demais arquivos estáticos e funcionalidades da produção preservados.

Preview `3b360b03`: PageSpeed móvel 94, FCP/LCP 0,9 s, CLS 0, TBT 290 ms. Medição em domínio de preview não substitui a medição final no domínio oficial, pois a entrega de anúncios pode variar.

Publicado em produção: `8bff8e70.novo-diario-do-povo.pages.dev`. No domínio oficial, os três CSS embutidos e os tamanhos do banner foram confirmados. Nenhum erro de console observado no navegador de validação.

## Limites

As métricas laboratoriais medem uma navegação e variam com rede e anúncios. O Search Console/CrUX resume 28 dias de visitas reais e não muda imediatamente após o deploy. O TTFB de campo anterior (2,9 s) ainda requer acompanhamento; a correção atual se concentra no layout e na renderização inicial.

## Resultado no domínio oficial após a publicação

PageSpeed móvel da mesma URL, após o deploy: desempenho **97**, FCP **0,9 s**, LCP **0,9 s**, TBT **190 ms**, CLS **0,014**, Speed Index **2,7 s**. Antes: 70 pontos, LCP 3,6 s e CLS 0,231. SEO permaneceu em 100. Resultado de uma medição laboratorial, não aprovação imediata do grupo CrUX.

Relatório final: https://pagespeed.web.dev/analysis/https-diario-dopovo-com-br-2026-10-14-mudanca-no-tse-reforca-ala-lulista-e-isola-kassio-e-mendonca/gr7xd0v722?form_factor=mobile

Evidência: `artifacts/cwv-mobile-release/pagespeed-production.jpg`.

Uma segunda matéria (Mega-Sena, 1/11/2026) também recebeu CSS embutido e banner móvel 320×100. Nessa matéria, a imagem tem dimensões naturais diferentes do fallback 1200×675 do HTML: revisar preenchimento de largura/altura do acervo em uma próxima etapa, além de acompanhar TTFB de campo. A validação do Search Console não foi iniciada nesta intervenção; o resultado laboratorial da amostra não comprova que todas as 4.501 URLs já passaram nos dados de campo.
