# Do Povo · Etapa 1

O sistema atual do Diário passa a atender também o portal Do Povo. A redação publica pelo editor principal do CMS. O domínio acessado define a capa, a navegação e o tema público. A mudança substitui a versão antiga hoje servida em dopovo.com.br.

| Endereço | Comportamento |
| --- | --- |
| `dopovo.com.br/` | Capa do portal com visual próprio e destaques escolhidos pelo workflow de curadoria. |
| `dopovo.com.br/noticia/<slug>/` | Endereço proposto para matérias próprias do portal. |
| `diario.dopovo.com.br/` | Capa do jornal e origem das matérias do Diário. Os endereços atuais do acervo continuam válidos. |
| `dopovo.com.br/casaejardim/` | Caminho reservado para a próxima etapa. A vertical terá capa e tema próprios no mesmo domínio. |

## Publicação no CMS

- Cadastrar **Publicação** como entidade com ID estável, nome, slug, hostname canônico, caminho inicial, tema, marca, status e configurações de SEO e publicidade. Cada matéria existente recebe a publicação Diário do Povo na migração. A capa guarda referências e posições, independentes da titularidade da matéria.
- Adicionar **Publicação de origem** ao editor principal e à API de criação de matérias usada pelos workflows. Nesta etapa, o campo aceita Diário do Povo ou Do Povo. Para fluxos existentes que omitem o campo, o destino é o Diário.
- Usar o cadastro e o fluxo de rascunho, revisão e publicação do CMS atual. A origem define o domínio público da matéria. A curadoria de capa guarda uma referência à matéria e sua posição.
- Aplicar a origem nas consultas de matérias, listagens, busca, metadados, sitemaps e cache. Verificar que a matéria apareça nas páginas da publicação certa e que o endereço do outro domínio não sirva uma cópia.
- Usar a identidade visual azul aprovada na prévia para a capa e as matérias do Do Povo. As matérias próprias aparecem sem etiqueta de origem e sem o título “Produção própria”. As chamadas do Diário identificam o jornal e apontam para a matéria original.
- Exigir `publicationId` nos novos endpoints de publicação. O padrão Diário aplica-se aos contratos legados. Depois de publicada, a origem só pode mudar por uma operação explícita que atualize a URL canônica e crie o redirecionamento permanente da URL anterior.

## RT-SEO-01 · Isolamento, indexação e monetização

A aplicação resolve a publicação antes de consultar dados, por hostname autorizado e pelo caminho cadastrado quando houver uma vertical. Hostnames desconhecidos recebem erro. Cabeçalhos de encaminhamento só podem influenciar essa resolução quando definidos pela infraestrutura confiável. Pedidos de matéria no domínio errado recebem 404 ou seguem um redirecionamento explícito. O Diário mantém suas URLs datadas. A distribuição cruzada contém título, resumo, imagem e link para a origem.

Consultas, busca, metadados, sitemaps, publicidade e cache usam o contexto da publicação. As chaves de cache incluem publicação, hostname e rota conforme a camada. Publicação, alteração de slug, edição e retirada invalidam os dados da matéria e as superfícies que a referenciam. A aplicação de uma nova capa invalida a capa afetada.

- **Canonical e metadados.** Derivar uma única URL oficial da origem, com canonical, Open Graph, título, descrição, favicon, breadcrumbs e JSON-LD gerados no servidor. Autoria, organização editora, datas e imagem devem corresponder à matéria. Alinhar URLs de links internos, canonical, redirecionamentos e sitemaps. [Consolidação de URLs e canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- **Sitemaps.** Cada hostname publica seu `/sitemap.xml` com URLs oficiais e indexáveis, e seu `/sitemap-news.xml` com matérias jornalísticas elegíveis dos últimos dois dias pela data original de publicação. Preservar o caminho que o Diário já usa. O `lastmod` reflete mudanças reais. Retiradas saem dos sitemaps e das listagens. Validar `robots.txt` e isolar a homologação por controle de acesso e `noindex`. [Sitemap do Google Notícias](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap)
- **Discover.** Para matérias destinadas à distribuição visual, oferecer imagem editorial relevante com pelo menos 1.200 px de largura. Adotar 1600 × 900 como formato editorial preferencial, com `og:image` válido e `max-image-preview:large`. Evitar imagens genéricas ou com texto excessivo. Esses requisitos preparam a apresentação sem garantir distribuição. [Diretrizes do Discover](https://developers.google.com/search/docs/appearance/google-discover)
- **Casa e Jardim.** Reservar `/casaejardim/` para a próxima etapa. O caminho reservado fica fora de menus e sitemaps até existir uma vertical publicada. A identidade visual pode ser própria. O nome de site exibido na Pesquisa do Google é definido em nível de domínio ou subdomínio. [Nomes de sites na Pesquisa](https://developers.google.com/search/docs/appearance/site-names)

## Publicidade, desempenho e métricas

- Configurar por publicação a ativação, a conta de anúncios, o modo automático ou manual, as posições, as exclusões e o consentimento. Excluir login, conta, pagamento e homologação da configuração inicial. Validar a conta habilitada para o domínio registrável e distinguir o inventário de cada hostname na integração publicitária.
- Antes da troca, registrar e preservar as entradas autorizadas de `dopovo.com.br/ads.txt`. Verificar resposta HTTP 200 e conteúdo servido após a troca. Avaliar a declaração `subdomain=` se a configuração de vendedores do Diário for distinta. [Rastreamento do ads.txt](https://support.google.com/adsense/answer/7679060)
- Carregar anúncios de forma assíncrona e reservar espaço para evitar deslocamentos. Medir LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1 como metas no percentil 75 quando houver dados de campo. Em homologação, registrar a medição de laboratório, a configuração testada e os desvios.
- Segmentar audiência, cliques entre publicações, impressões, RPM e receita por hostname e publicação. Preparar a propriedade de domínio e propriedades por prefixo de URL no Search Console. Validar a atribuição entre portal e jornal no GA4 e conferir a separação dos relatórios comerciais.

## Curadoria da capa

O n8n lê candidatas já publicadas, recebe a composição vigente e pede à IA a ordem dos destaques. O mesmo workflow envia a decisão à API autenticada do CMS. A redação pode indicar uma candidata ou fixar a manchete temporariamente. O CMS valida os IDs e a revisão da capa antes de aplicar a seleção. Em caso de falha, mantém a última seleção válida e deixa de exibir matérias retiradas de publicação.

A API usa credenciais de serviço limitadas à curadoria. A gravação da composição, do registro de auditoria e da chave de idempotência é atômica. Cada composição gera uma revisão imutável com horário, ator ou workflow e justificativa. Uma repetição da mesma operação com a mesma chave devolve o resultado original. Outra gravação sobre revisão superada ou a reutilização da chave com conteúdo diferente recebe HTTP 409. A resposta distingue erro de validação, conflito e falha temporária.

A manchete fixada tem prazo de expiração e só é exibida enquanto a matéria estiver publicada. A decisão da IA considera impacto, atualidade, utilidade, diversidade, qualidade jornalística e equilíbrio entre notícias recentes e evergreen. Sinais de busca e audiência servem como apoio à curadoria.

## Ordem de entrega

1. Implementar a origem no editor e na API principal. Ligar a capa e as páginas do Do Povo ao cadastro de matérias do CMS.
2. Em homologação, servir os dois sites com a aplicação atual. Criar uma matéria pelo editor e outra pelo workflow com destino Do Povo. Conferir que o workflow legado continua publicando no Diário.
3. Executar o workflow de curadoria em homologação e verificar que ele aplica a capa sem intervenção. Conferir os dois destinos de clique e testar a fixação, a retirada de uma matéria e a rejeição de uma decisão desatualizada.
4. Preparar a troca dos domínios do portal para a aplicação atual. Antes da troca, conferir as rotas do portal antigo que precisam ser atendidas, incluindo páginas institucionais, conta, assinatura e `ads.txt`. Registrar a configuração anterior para reversão e validar os dois sites após a troca.

## Migração e aceite

Inventariar URLs antigas com o tráfego, a indexação e os serviços associados. Preservar os endereços compatíveis, usar 301 para equivalentes que mudem de caminho e devolver 404 ou 410 quando não houver substituto. Validar HTTPS, cookies, autenticação, pagamentos, callbacks e webhooks. A troca mantém o hostname público do Do Povo. Usar migração de banco retrocompatível e ensaiar o retorno da aplicação e das rotas anteriores sem perder novas gravações.

| Prioridade | Cenário | Resultado esperado |
| --- | --- | --- |
| P0 | Publicação pelo editor e pela API, incluindo workflow legado | URL e canonical corretos para cada destino. O legado publica no Diário. |
| P0 | Domínio errado, cache aquecido e busca | Sem cópia com HTTP 200. Conteúdo, tema, metadados e consulta ficam no contexto correto. |
| P0 | Sitemaps, retirada e indexação | Cada sitemap contém só suas URLs elegíveis. A retirada some da capa, inclusive se fixada, e das listagens. Homologação protegida e produção indexável. |
| P0 | Curadoria autenticada, concorrência e repetição | IDs inválidos são rejeitados. Uma decisão válida é gravada uma vez. Uma revisão superada recebe 409. A fixação editorial prevalece até expirar ou ser liberada. |
| P0 | Troca do domínio, serviços e reversão | `ads.txt` mantém as entradas autorizadas. Rotas antigas recebem a resposta mapeada. Auth, pagamentos e reversão são testados. |
| P1 | Metadados, imagem e desempenho | JSON-LD e Open Graph coerentes. Imagem adequada e resultados de desempenho registrados. |
| P1 | Mensuração, publicidade e vertical reservada | Segmentação e atribuição conferidas. Search Console preparado. `/casaejardim/` fica fora da indexação enquanto reservado. |

Automatizar os testes P0 reproduzíveis e registrar a evidência dos testes de integração operacional. P0 bloqueia a troca. P1 exige tratamento ou desvio documentado antes de ampliar a operação.

## Estado de partida

O Do Povo não tem acervo de matérias publicadas a migrar, conforme informado pela redação. A homologação isolada já demonstrou o visual, o clique para o Diário, a escolha real da IA e a fixação manual. Nela, a decisão da IA foi aplicada ao CMS após a execução.

O CMS compartilhado está no Worker privado `do-povo-cms-hml`, com D1, KV e R2 próprios. O Diário é servido na raiz e o caminho `/portal/` encaminha internamente para o roteamento do domínio Do Povo. O ambiente exige credenciais e sinaliza `noindex, nofollow`. A configuração local fica em `artifacts/do-povo-cms-hml/`, fora do controle de versão.

O teste HTTP autenticado criou um rascunho Do Povo pelo editor e outro pela API. Uma requisição no formato legado publicou no Diário. O endereço do Diário e o rascunho Do Povo retornaram 404 na superfície do portal e ficaram fora do sitemap do Do Povo. A API de capa gravou uma edição simulada com a manchete do Diário, preservou o link de origem e rejeitou o reenvio da mesma decisão com 409.

A tela `/admin/do-povo` usa as candidatas e a edição do catálogo compartilhado. Em homologação, a fixação pôs uma manchete fictícia do Diário no topo da capa e a desfixação foi confirmada pela API. Em teste local com dados fictícios já publicados, a prévia abriu a matéria do portal, a API retornou a indicação manual e a retirada removeu a matéria da capa e fez sua página retornar 404.

O editor principal e `POST /api/n8n/posts` aceitam rascunhos com origem Do Povo. A migração 0064 cadastra as publicações e atribui o acervo existente ao Diário. Em homologação, a migração 0065 manteve a trava por padrão e permitiu autorizar um rascunho fictício por tempo limitado. O CMS publicou o rascunho nº 6. A matéria retornou HTTP 200 no portal e apareceu na API de candidatas junto com as do Diário.

O [workflow de homologação](https://n8n.srv797269.hstgr.cloud/workflow/WjgxsxVkbzqj62d0) executou com as credenciais do CMS e da OpenAI. Na [execução 5423994](https://n8n.srv797269.hstgr.cloud/workflow/WjgxsxVkbzqj62d0/executions/5423994), a IA recebeu candidatas dos dois veículos e escolheu uma manchete fictícia do Diário. O nó Aplicar capa gravou a revisão `15d4e2a3-522d-4ca1-a181-9d9c3b94cd40`. A capa da homologação apresentou a manchete com o endereço original do Diário e a matéria fictícia do Do Povo com endereço interno.

## Preparação da troca em produção

| Projeto Pages | Domínios vinculados | Deploy canônico na conferência |
| --- | --- | --- |
| `do-povo` | `dopovo.com.br`, `www.dopovo.com.br`, `do-povo.pages.dev` | `83719f73-42f3-4135-be38-ac1cc64bd348` (`da7aecc`) |
| `novo-diario-do-povo` | `diario.dopovo.com.br`, `novo-diario-do-povo.pages.dev` | `fd6fcd81-9169-4359-9f9f-d8d6e99cf621` (`f759f81`) |

A API de Pages confirmou os vínculos. O painel DNS confirmou três registros CNAME com proxy ativo e TTL automático. `dopovo.com.br` e `www.dopovo.com.br` apontam para `do-povo.pages.dev`. `diario.dopovo.com.br` aponta para `novo-diario-do-povo.pages.dev`. Conferir novamente o deploy canônico e esses registros na janela de implantação. [Painel DNS do Do Povo](https://dash.cloudflare.com/76f7ba3c1a37c9fc5a630148f0cb0843/dopovo.com.br/dns/records)

- `/ads.txt` responde 200 no portal atual com a entrada `google.com, pub-3839974827280107, DIRECT, f08c47fec0942fa0`. Configurar esse conteúdo em `do_povo.ads_txt`, de escopo público, e verificar o conteúdo exato no novo portal.
- `/sitemap-index.xml` lista os dois sitemaps. `/sitemap.xml` atualmente lista somente a capa. O código do portal preserva o índice e gera os sitemaps a partir do catálogo.
- `/login` e `/admin/login` exibem o mesmo formulário administrativo no portal antigo. O portal novo encaminha ambos ao login do CMS do Diário. Um POST de formulário antigo volta à tela de login no Diário por 303.
- O acesso de leitores usa o cadastro existente em `diario.dopovo.com.br`, conforme decisão do titular. A capa do portal oferece o atalho Minha conta. `/conta`, `/portal` e `/portal/account` encaminham para `/conta` do Diário. `/portal/login` e `/portal/register` encaminham às páginas de login e cadastro de leitor do Diário. `/assinar` e `/assinatura` encaminham para os planos do Diário. As três contas identificadas apenas no banco histórico do Do Povo exigem um cadastro no Diário para acesso à nova versão.

### Sequência de implantação

1. Testar a versão candidata com as migrações `0063` a `0065` aplicadas em ambiente isolado. Comparar a versão candidata com o deploy canônico do Diário e incluir apenas alterações aprovadas. Conferir a continuidade das rotas antigas registradas acima.
2. Configurar o `ads.txt` do Do Povo. Preparar uma chave exclusiva `N8N_DO_POVO_COVER_KEY` no projeto atual e uma credencial Header Auth no n8n restrita ao hostname `diario.dopovo.com.br`. Os dois nós de CMS usam essa credencial. O nó de IA usa a credencial OpenAI.
3. Gerar o workflow inativo com `node scripts/build-do-povo-cover-workflow.mjs https://diario.dopovo.com.br gpt-6-luna prod`. O arquivo gerado é `artifacts/do-povo-cover/workflow-production.json`. A cadência inicial proposta é de 15 minutos, com execução manual disponível para conferência.
4. Na janela de publicação, aplicar as migrações e publicar a versão candidata no projeto atual. Conferir CMS, capa, matéria e sitemap do Diário. A primeira publicação do Do Povo pode usar a autorização temporária por rascunho da migração 0065. A liberação geral de publicação e agendamento precisa de uma alteração própria e de teste pelo editor e pela API.
5. Rodar a curadoria manualmente contra produção e conferir a revisão gravada. Mover os dois domínios do portal para `novo-diario-do-povo` usando os vínculos de domínio do Pages e confirmar que ambos estão ativos com HTTPS. Conferir o 301 do `www`, capa, links dos dois veículos, sitemap, `ads.txt` e rotas mapeadas. Ativar a execução periódica e confirmar que a primeira execução agendada grava uma revisão válida.

### Retorno

Desativar o workflow do portal. Se a regressão estiver no domínio do portal, transferir `dopovo.com.br` e `www.dopovo.com.br` de volta ao projeto `do-povo`, restaurar os registros DNS capturados e verificar HTTPS, capa e `ads.txt`. Se a regressão afetar o Diário, restaurar o deploy canônico registrado imediatamente antes da implantação no projeto atual. A reversão do aplicativo conserva as migrações aditivas e as gravações feitas no banco. Ensaiar o procedimento com um domínio de teste antes da janela. [Domínios personalizados em Pages](https://developers.cloudflare.com/pages/configuration/custom-domains/) · [Reversão de deploy em Pages](https://developers.cloudflare.com/pages/configuration/rollbacks/)

### Lançamento

A versão de retorno do Diário registrada na janela foi `1383be52-c9c5-41a2-9004-1ed62384d159` (`7938d70`). O deploy inicial do portal foi `3e53bfeb-c93f-4f0c-8a7f-a36d713eb6e2` e a branch de produção recebeu o commit `8a457b2`. O domínio principal e o `www` foram vinculados a `novo-diario-do-povo` e seus CNAMEs passaram a apontar para `novo-diario-do-povo.pages.dev`, com proxy ativo e TTL automático.

A execução manual `5424239` gravou a primeira capa de produção com quatro chamadas do Diário. O agendamento de 15 minutos está ativo. O teste HTTPS confirmou a capa, o 301 do `www`, uma matéria do Diário, o `ads.txt`, o índice de sitemaps e os redirecionamentos de conta e login. [Workflow de produção](https://n8n.srv797269.hstgr.cloud/workflow/IDYJGRVfUbTywy4K)
