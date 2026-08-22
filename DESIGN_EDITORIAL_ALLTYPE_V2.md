# Diagnostico Editorial & Contexto

O Novo Diario do Povo opera como portal regional de hard news, opiniao e servico publico. O layout precisa suportar alta densidade de chamadas, atualizacao frequente e monetizacao por anuncios sem prejudicar leitura, especialmente no mobile.

O tema `alltype_v2` foi tratado como identidade editorial principal: visual impresso, serifas fortes, linhas de separacao e hierarquia direta. A decisao preserva marca e melhora usabilidade ao manter contraste alto, escaneabilidade por blocos e leitura longa com largura controlada.

# Arquitetura de Informacao & Escaneabilidade

Home: a estrutura favorece padrao Z no topo, com manchete principal, coluna secundaria e blocos de editoria abaixo. Isso reduz a carga de decisao inicial, alinhado a Lei de Hick: menos escolhas concorrentes no primeiro viewport.

Categoria: a pagina usa grade responsiva unica com cartoes consistentes. A grade agora usa `minmax(min(100%, 300px), 1fr)`, evitando estouro horizontal em celulares estreitos e mantendo previsibilidade conforme a Lei de Jakob, ja que leitores reconhecem o padrao de listagem editorial.

Artigo: o corpo passou a ter largura de leitura em `68ch`, hierarquia clara de titulo, subtitulo, metadados e texto. A leitura longa segue padrao F, com paragrafos ritmados, links sublinhados e subtitulos destacados.

# Sistema de Tipografia & UI Tokens

Pareamento tipografico: serifada de sistema para manchetes e texto longo (`Georgia`, `Times New Roman`) com sans-serif de sistema para navegacao, metadados, botoes e rotulos (`Arial`, `Helvetica`). A escolha evita dependencia externa e melhora performance.

Escala aplicada: titulo de artigo com 40px no desktop e 28px no mobile; texto de artigo com 19px e `line-height: 1.68` no desktop, 18px e `line-height: 1.65` no mobile. Esse intervalo fica dentro da faixa recomendada para leitura editorial digital.

Tokens relevantes: `--dp-reading-max: 68ch`, `--dp-focus: #005FCC`, `--dp-muted: #5F5F5F`, `--dp-bg: #FDF8F8`, `--dp-text: #1A1A1A`. O contraste de corpo e metadados permanece adequado para leitura em fundo claro.

# Estrategia de Monetizacao & Conversao (Ads/Paywall)

Anuncios: o container AllType agora usa `<aside aria-label="Publicidade">`, `contain: layout paint`, `overflow: hidden` e altura minima reservada. Isso melhora previsibilidade de slot programatico e reduz risco de CLS.

Mobile ads: em telas ate 768px, o slot reserva 280px, mais compativel com formatos mobile/in-feed. No desktop, a reserva minima e 128px para leaderboard e unidades horizontais.

Paywall: o bloqueio foi mantido como card editorial centralizado, sem depender de emoji ou icone decorativo. O teaser usa mascara visual e limite de altura, entregando contexto suficiente para conversao sem expor o artigo inteiro.

# Recomendacoes de Acessibilidade (WCAG)

Foco visivel: links, botoes e campos receberam `focus-visible` com contorno azul de 3px, ajudando navegacao por teclado.

Alvos de toque: botoes e links de assinatura/navegacao passam a respeitar altura minima de 44px, adequada para interacao mobile.

Leitura: corpo de artigo com largura maxima, `line-height` amplo, subtitulos com respiro e links sublinhados. Isso melhora redimensionamento de texto e reduz fadiga visual.

Movimento: o tema ja respeita `prefers-reduced-motion`, mantendo transicoes e animacoes desligadas para usuarios sensiveis.
