# SEO automático do Diário — implementação de 06/11/2026

## Situação da entrega

O CMS está publicado na versão **`e4cf7373`**, sobre a versão `7e60e98c`, preservando a biblioteca de Guias e as demais entregas. Os dois workflows estão **ativos**. A primeira ativação ocorreu em **06/11/2026 às 11h38min57s, horário de Fortaleza**; após a revisão do piloto, a agenda foi reativada às **12h05min58s**. O piloto tem **30 tratadas aplicadas e 30 controles intactos**, e uma publicação nova também foi processada.

| Frente | Situação verificada |
|---|---|
| CMS, quatro campos e histórico | Implementados e publicados |
| Reservas, limites, versões e piloto | Ativos; 20 trabalhos por rodada, reserva de 15 minutos e teto de 300 gerações por dia |
| Simulação real de dez matérias | Execução integrada `5380797`: dez propostas válidas, IDs corretos e **zero gravação no CMS**, seguida de replay validado do filtro final de Trends |
| Search Console | OAuth2 conectado; API respondeu **HTTP 200** na execução `5380788` |
| Referência do piloto | Coleta somente de leitura `5380789`: **4.289 páginas**, das quais **107** passaram pelos filtros de métricas |
| Trends | Proxy protegido respondeu **HTTP 200**, RSS válido com **43 itens** e cache privado |
| Piloto preparado | Piloto **1**: **30 tratadas e 30 controles**, pares e semente persistidos; hashes e datas das 60 páginas guardados antes da aplicação |
| Aplicação final | **31 trabalhos aplicados**; piloto com 30/30 concluídas, sem pendência, conflito ou falha nos trabalhos registrados na conferência |
| Preservação verificada | Hashes das 60 páginas: nenhum conteúdo/data editorial alterado; nenhum metadado dos controles alterado; HTML público conferido |
| Resultado sobre posições, cliques ou receita | Ainda não existe janela posterior para avaliação |

Não há chaves, segredos OAuth ou URL privada de feed neste documento. O painel e `artifacts/seo-automation/production-status.json` registram o estado dos trabalhos; o histórico individual permite conferir e restaurar cada alteração.

A observação do piloto começou após a última correção aplicada, em `2026-11-06T15:02:13.223Z` (12h02min13s de Fortaleza). As janelas são **07–20/11**, com coleta elegível a partir de **23/11**, e **07/11–04/12**, com coleta elegível a partir de **07/12**. O acompanhamento verifica as janelas diariamente às 9h de Fortaleza. As datas incluem a espera de três dias para dados finalizados; não equivalem a uma promessa de recrawl ou melhora de CTR.

O otimizador ativo usa a versão `56f5e819-4df8-4de9-b39b-7663114572a9`; o acompanhamento, `30991c75-417f-493e-aac5-5f3240a70dd9`.

## Acesso e componentes

- [AI SEO Automation — otimizador principal](https://n8n.srv797269.hstgr.cloud/workflow/F6nDS1iTxVrQXB1pWD8Vz).
- [SEO — piloto e acompanhamento](https://n8n.srv797269.hstgr.cloud/workflow/KioFx58mNcAp0KZw), responsável pela preparação do piloto e coleta das janelas posteriores.
- [Google Trends - Pesquisa e redacao v2](https://n8n.srv797269.hstgr.cloud/workflow/kzGfdd8KDNxnB1fi), cuja fonte RSS é reutilizada somente para leitura. O otimizador SEO não executa sua redação nem republica suas matérias.
- [Fila e resultados no CMS](https://diario.dopovo.com.br/admin/posts/seo/automation), com sessão administrativa.
- Histórico individual: `/admin/posts/{id}/seo/history`, também acessível pela seção **SEO & Metadados** da matéria.

Código do serviço em `packages/core/seo-automation/`; interface em `packages/core/admin/seo-automation.ts`; migração `0054_seo_automation.sql`. Os SDKs e registros de validação ficam em `artifacts/seo-automation/`. O pacote final está em **`artifacts/seo-backend-fix-release/`**. Seu manifesto registra a base `7e60e98c`, a única substituição da fábrica do router SEO, 333 rotas preservadas e 88 arquivos estáticos idênticos. Não reaplicar o pacote inicial `seo-automation-release` sobre a produção atual, pois ele antecede os Guias.

O modelo antigo, `gpt-4.1-nano`, bloqueou o primeiro ensaio real porque estava descontinuado. Após autorização do usuário, o otimizador passou a utilizar **`gpt-6-luna`**, preservando a integração OpenAI existente. A troca não deve ser confundida com uma prova de melhora de SEO.

## Metadados e interface editorial

| Campo | Contrato |
|---|---|
| `seo_title` | Texto, até 200 caracteres |
| `seo_description` | Texto, até 500 caracteres |
| `seo_primary_keyword` | Texto, até 120 caracteres |
| `seo_secondary_keywords` | Até cinco expressões distintas, até 120 caracteres cada; array na API e armazenamento JSON no banco |

O formulário recebe palavras secundárias em linhas separadas e as converte para array, aplicando a validação compartilhada. Os campos são distintos das tags da matéria. A geração busca concisão, mas as faixas sugeridas de tamanho não garantem que o Google exiba o texto integral.

A prévia é identificada como **estimativa** e acrescenta a marca do jornal ao título. Quando título e descrição SEO ficam vazios, a renderização pública conserva as alternativas existentes: manchete; resumo e, na ausência deste, manchete. Campos sociais preenchidos continuam com precedência própria. Não foi criada uma tag `meta keywords`.

O histórico mostra antes/depois dos quatro campos, justificativa, responsável, data, fontes usadas e os dados disponíveis. **Somente `evidence.used_sources` declara uso de uma fonte**: um objeto `not_configured`, `unavailable` ou um contexto disponível que a IA não utilizou não aparece como fonte usada.

As consultas do Search Console são apresentadas com período, cliques, impressões, CTR e posição; tendências com termo e data; os trechos do conteúdo que sustentam os termos também podem ser consultados. Toda essa informação é escapada antes de entrar no HTML. Configurações privadas não são exibidas por uma impressão indiscriminada do JSON de evidências.

## Persistência, concorrência e restauração

Cada aplicação registra uma revisão própria em `post_seo_revisions`: valores anteriores e posteriores, retrato do conteúdo usado, evidências, justificativa, identificação da operação e data. `seo_version` e `seo_updated_at` são independentes das datas e versões editoriais.

O commit compara atomicamente o retrato de origem — incluindo título, resumo, corpo, versão, situação e os metadados existentes — e a reserva do trabalho. Uma alteração concorrente provoca conflito e impede aplicar uma proposta gerada sobre conteúdo antigo. A validade da reserva também é conferida no momento da gravação. Repetir uma operação já concluída devolve sua confirmação anterior.

Uma alteração idêntica é tratada como **sem mudança** e não cria revisão ou atualiza datas. Alterações exclusivamente SEO preservam manchete, corpo, endereço, canônica, `noindex`, situação de publicação, datas editoriais e atualidade dos sitemaps. A recuperação de uma revisão restaura apenas os quatro campos e cria outra revisão, sem apagar o histórico.

O formulário envia `expected_seo_version`, evitando que uma aba aberta antes de uma otimização sobrescreva silenciosamente o resultado novo. Na revisão foi corrigido um problema adicional: o formulário antigo convertia HTML inalterado em Markdown ao salvar, alterando formato, versão e data do corpo mesmo numa edição exclusivamente SEO. O construtor de payload agora preserva conteúdo inalterado, inclusive quando um texto legado é aberto no editor visual sem mudança do HTML resultante. Edições reais do corpo continuam sendo salvas normalmente.

As rotas administrativas utilizam a sessão e a proteção CSRF existentes. As operações n8n utilizam a autenticação de API já adotada pelo CMS. **Todas as respostas de `/api/n8n/seo` e subcaminhos recebem `Cache-Control: private, no-store, max-age=0`**, inclusive erros. A correção foi aplicada também ao middleware da base compilada do pacote isolado, com verificação exata da expressão substituída.

## Fluxo de processamento e limites

O otimizador está preparado para executar a cada **cinco minutos**, reservar no máximo **20 trabalhos por rodada** e respeitar o teto de **300 reservas de geração por dia editorial de Fortaleza**. O teto é conservador: uma tentativa reservada conta mesmo que uma falha posterior impeça a chamada ao modelo. O excedente permanece pendente.

As reservas são exclusivas por **15 minutos**. Há no máximo três tentativas para falhas transitórias. Respostas inválidas ou sem sustentação ficam para revisão; não são convertidas em campos vazios. O vínculo entre entrada, saída e ID é individual, sem recuperar a primeira resposta da IA para todas as matérias.

A seleção prioriza matérias novas desde a primeira ativação. Exige publicação vigente, indexável, não futura, notícia sem cobertura ao vivo e canônica própria ou ausente. Um retrato de conteúdo já concluído não é reaberto apenas pela passagem de sete dias. Se o conteúdo mudar, uma nova otimização automática só pode entrar após o intervalo mínimo de sete dias da conclusão anterior, inclusive quando esta terminou sem mudança. A fila filtra trabalhos já concluídos antes do limite de seleção para evitar bloquear novas matérias atrás das primeiras 200 concluídas. Conflitos renovam o retrato numa tentativa posterior, respeitando o limite de tentativas.

O texto completo é a base factual. O fluxo não repete a limitação antiga aos primeiros mil caracteres. Se o conteúdo não puder ser processado com segurança, o resultado exige revisão. Termos e trechos de sustentação devem corresponder literalmente ao material, sem usar popularidade para introduzir informações ausentes.

## Fontes e conexão Google

### Search Console

A conexão OAuth2 usa o escopo **`https://www.googleapis.com/auth/webmasters.readonly`** e consulta a propriedade exata `https://diario.dopovo.com.br/`. O filtro de propriedade pertence às chamadas da aplicação; o escopo OAuth não é, por si só, uma limitação técnica de credencial a uma única propriedade.

O fluxo solicita Pesquisa Web, país `bra`, dados finalizados e uma janela de 28 dias encerrada três dias antes da consulta. A referência temporal da API é `America/Los_Angeles`, distinta do dia de quota editorial de Fortaleza. A consulta por matéria usa sua URL exata.

Na execução de leitura `5380788`, a API respondeu HTTP 200. A coleta `5380789` obteve 4.289 páginas para **07/10 a 03/11/2026**, com 107 candidatas após filtros de impressões, CTR e posição. Os arquivos `pilot-baseline-read-only.json` e `pilot-baseline-payload.json` registram essa coleta. O CMS aplicou depois os filtros de elegibilidade e formou os 30 pares do piloto 1, registrados em `production-pilot.json`.

### Trends

A fonte é a já utilizada pelo fluxo de Trends do Diário, sem contratar fornecedor adicional ou depender da API alpha restrita. O CMS fornece um proxy autenticado, com origem e caminho permitidos, tamanho e tempo de resposta limitados, verificação de XML e cache de **30 minutos**. A URL privada e seu token não são devolvidos ao consumidor nem incluídos nos diagnósticos.

O contexto de Trends só pode contribuir quando há sinais recentes, de até 24 horas, e correspondência com o assunto e as entidades da matéria. O filtro final exige correspondência no título/resumo e descarta nomes próprios comuns isolados. Ausência no feed não significa ausência de demanda. Falhas são registradas como indisponibilidade, nunca como tendência ou métrica inventada.

A falha inicial foi reproduzida: Cloudflare Workers rejeita `redirect: 'error'` antes de enviar a requisição. O proxy usa agora `manual` e recusa respostas 3xx sem seguir outro destino. A leitura pública da fonte e a leitura autenticada pelo CMS responderam 200 após a correção; nenhuma flag global de rede foi alterada. [Contrato de Request do Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/request/#constructor).

## Contratos de integração

Todos os caminhos abaixo têm prefixo `/api/n8n/seo` e exigem a autenticação existente do CMS:

| Método e caminho | Uso |
|---|---|
| `POST /claim` | Reserva até 20 trabalhos, retornando ID do trabalho, ID e conteúdo da matéria, URL, metadados, versão, retrato de origem e identificador exclusivo da reserva |
| `GET /dry-run?limit=10` | Obtém candidatas sem criar trabalhos, revisões ou aplicações |
| `POST /jobs/{id}/result` | Recebe resultado individual com reserva e chave de idempotência |
| `POST /jobs/{id}/correct` | Correção explícita do operador, somente com fila pausada; exige versão, quatro campos, justificativa e operação idempotente, e usa o mesmo serviço de reserva/CAS/histórico |
| `GET /stats` | Contagens operacionais, quota do dia, configuração e situação dos pilotos |
| `GET /trends` | Fonte RSS permitida, validada e sem revelar a URL privada |
| `GET /posts/{id}/history` | Histórico SEO individual |
| `POST /config` | Habilita/desabilita o processamento; teto diário entre 1 e 300 |
| `POST /pilot` | Prepara pares a partir de referência finalizada de 28 dias e semente persistida |
| `GET /pilot/status` | Mostra aplicações e pendências das páginas tratadas |
| `GET /pilot/due` | Informa janelas finalizadas que já podem ser coletadas |
| `POST /pilot/{id}/followup` | Registra resultados dos integrantes fixos na janela exata de 14 ou 28 dias |

O resultado individual aceita `status` igual a `apply`, `no_change`, `needs_review` ou `error`, além de justificativa e evidências. `apply` exige os quatro campos dentro de `metadata`. Campos não previstos são rejeitados; o contrato não permite alterar corpo, manchete, slug, canônica ou indexação. Conflitos retornam 409; entradas inválidas, 422; identificadores inexistentes, 404.

## Piloto: critérios e início real da observação

O CMS seleciona até **60 páginas**, com publicação nos últimos 90 dias, canônica própria e elegibilidade editorial. A referência precisa ter pelo menos 100 impressões por página, posição média entre 4 e 20 e CTR abaixo de 3%. Publicações novas desde a ativação e páginas já otimizadas automaticamente não entram como acervo inicial.

As páginas são pareadas dentro da editoria, considerando posição, idade e impressões. A atribuição de até 30 tratadas e 30 controles é determinada pela semente persistida; as métricas anteriores são guardadas. Os controles ficam fora da fila de novas publicações, evitando contaminação pela automação.

**Preparar o piloto não inicia sua observação.** Ela aguarda todas as páginas tratadas receberem uma aplicação real, confirmada por revisão n8n e recibo do trabalho. `no_change`, falha ou revisão pendente não são tratados como exposição ao novo SEO. O painel mostra essas pendências.

A referência de início é a **última aplicação real** entre as tratadas. As janelas posteriores começam no dia seguinte, no calendário da API do Search Console, e abrangem 14 ou 28 dias completos. A coleta só é liberada após o período de finalização de três dias. A submissão confere o conjunto exato de URLs dos integrantes, impedindo trocar membros ou registrar uma amostra incompleta.

Uma resposta Google bem-sucedida e sem linhas pode representar zero. Uma falha de API aborta a coleta; não vira resultado zero. Acompanhamento do piloto não autoriza ampliar automaticamente a otimização para o restante do acervo nem comprova causalidade a partir de uma pequena amostra.

### Revisão da aplicação inicial

As duas primeiras rodadas (`5380798` e `5380799`) aplicaram automaticamente 27 páginas do piloto e retiveram três por sustentação literal insuficiente. A execução agendada `5380803` aplicou também a publicação nova **419821**, confirmando o processamento de novas matérias.

A revisão identificou dois problemas temporais claros no acervo — divulgação futura marcada para uma data já passada e um intervalo móvel — e três expectativas que foram ancoradas ao relato original. A agenda foi pausada durante a correção. **Oito intervenções operacionais** (as três retidas e cinco revisões dos já aplicados) passaram pelo endpoint auditável, com versão, fonte original inalterada e reserva exclusiva. Elas geraram as revisões **29–36**, sem consumir novas reservas de geração nem alterar conteúdo editorial. Os recibos estão em `production-corrections.json`; as propostas e evidências, em `operator-correction-drafts.json`.

O workflow recebe agora `current_date` em Fortaleza e valida datas vencidas, disponibilidade com prazo passado e intervalos relativos. Mantém construções normativas legítimas, como “não deve”, quando não representam uma previsão temporal. O ensaio real posterior **`5380813`** gerou dez propostas válidas, com IDs corretos e zero reserva/gravação no CMS; o replay final preservou seus quatro campos. A agenda foi reativada somente após essas verificações e as correções do piloto.

## Validação realizada

- SDK dos workflows validado sem avisos; testes simulados exercitaram dez entradas distintas, erros de Google, saídas inválidas e associação individual entre proposta e matéria.
- O primeiro ensaio real foi bloqueado pelo modelo antigo. Um ensaio seguinte identificou divergências entre termos e trechos; o prompt foi ajustado para exigir expressões efetivamente presentes, sem enfraquecer a validação.
- Ensaio real **`5380772`**: dez propostas válidas, sustentação literal validada e zero escrita; à época, apenas conteúdo estava disponível. O ensaio integrado **`5380797`** repetiu as dez matérias com Google e Trends conectados: dez respostas Google 200 sem consultas relevantes para essas notícias novas, 43 sinais recentes de Trends, dez propostas válidas e zero escrita. O modelo utilizou somente conteúdo, sem forçar origens. O replay do filtro final manteve os quatro campos das dez propostas e removeu uma coincidência ambígua de nome próprio do contexto de Trends.
- Persistência testada com SQLite real: histórico, restauração, ausência de mudança, idempotência, edição concorrente, reserva expirada e validade da reserva no commit.
- Fila testada contra sobreposição, limite diário, três tentativas, bloqueio de inválidas, renovação de conflito e ausência de bloqueio das candidatas novas por trabalhos antigos.
- Piloto testado com pares determinísticos, controles preservados, espera por todas as aplicações reais e janelas posteriores ancoradas na última aplicação.
- Interface testada para os quatro campos, conversão de linhas para array, limites e duplicidade, alternativas de título/descrição, escape de metadados/evidências e restauração com versão.
- Doze testes executam o renderizador público real nos temas editorial e AllType: precedência de SEO próprio, campos nulos e vazios, descrição alternativa pela manchete, caracteres especiais, ausência de `meta keywords`, preservação da manchete/corpo e dos campos sociais explícitos. Somente consultas externas de dados e anúncios são simuladas.
- Quatro regressões reproduziram o payload administrativo com HTML legado, Markdown exibido como HTML, legado aberto no visual e alteração real de corpo, comprovando preservação das datas e do formato nas edições apenas SEO.
- Quinze cenários verificaram cache privado nas rotas SEO e erros 401/403/422/500, mantendo as políticas anteriores de outras APIs, arquivos estáticos e sitemaps.
- Typecheck passou. O empacotador isolado verifica a base de produção e admite somente `_worker.js`, `static/admin-seo.js` e `static/admin-seo.css` como mudanças do pacote.

Na versão final, **152 testes de CMS, persistência, renderização, cache e sitemaps**, mais **18 testes de workflow/piloto**, passaram. `npm run typecheck` e o build isolado passaram. A publicação final alterou apenas `_worker.js` sobre a base dos Guias. `production-pilot-after.json` comprova 30 metadados tratados diferentes, zero controle alterado e zero mudança editorial nas 60 páginas; `production-public-html.json` registra quatro verificações públicas aprovadas de título, descrição, canônica, manchete e ausência de `meta keywords`. Home, Guias e os dois sitemaps responderam 200; a API sem chave respondeu 401 com cache privado.

As execuções simuladas e reais estão descritas em `artifacts/seo-automation/validation-summary.json`. Elas verificam funcionamento e segurança de aplicação, não ganho de cliques ou de receita.

## Desativação e recuperação

1. Despublicar/desativar a agenda do **AI SEO Automation** e a do companion **SEO — piloto e acompanhamento** no n8n.
2. Desabilitar as reservas no CMS com `POST /api/n8n/seo/config`, enviando `{"enabled":false,"daily_limit":300}` com a autenticação existente. Isso interrompe novas reservas; não deve ser interpretado como cancelamento retroativo de reservas já emitidas. Aguardar ou verificar os trabalhos em andamento antes de restaurar valores.
3. No histórico da matéria, conferir a revisão desejada e usar **Restaurar os valores anteriores a esta alteração**. Cada restauração cria uma nova revisão e exige a versão SEO corrente. Se houver conflito, recarregar o histórico antes de tentar novamente.
4. Verificar o HTML público após expirar o cache. A restauração deve alterar somente os quatro campos; a desativação não requer excluir matérias ou apagar o histórico.

Não inserir chaves da API em URLs, relatórios, exemplos de comandos ou arquivos versionados. A recuperação do código, se necessária, deve usar os identificadores e hashes do manifesto do pacote, sem reverter indiscriminadamente outras funcionalidades do projeto.
