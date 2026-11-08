# Guias do Diário — operação e publicação

Publicado em produção em 06/11/2026, versão final **8443dfea**, sobre a versão **e4cf7373** de SEO, que já preservava o lançamento inicial dos Guias (**7e60e98c**). A migração 0053 foi instalada e registrada. As oito pautas foram importadas no CMS. O fluxo **Guias do Diário — pesquisa e revisão** está **ativo**, com revisão editorial obrigatória dos textos. A biblioteca pública permanece vazia até a primeira aprovação editorial.

## Jornada da redação

1. Acessar **Guias do Diário** no CMS (`/admin/guias`), com perfil editor ou diretor. O perfil antigo `admin` também é aceito.
2. Importar as oito pautas iniciais ou criar uma pauta. A importação é idempotente e não publica textos.
3. Conferir a pergunta do leitor, escopo, fontes de partida, termos de relacionamento e motivos de revisão. Escolher autoria e editoria reais. A URL e a intenção ficam fixas após a criação.
4. Enviar a pauta para pesquisa. O n8n reserva o trabalho, consulta fontes oficiais, monta um dossiê e solicita a redação. A fila inicial processa uma pauta por rodada; `BATCH_SIZE` é configurável de 1 a 5 no nó Configuração. As rodadas ocorrem a cada hora quando o fluxo estiver ativo.
5. Em **Revisões**, abrir a proposta, ler a prévia privada, conferir cada afirmação e sua evidência e editar o texto. A prévia exige autenticação, não é indexável e não é armazenada em cache público.
6. Salvar a revisão editorial e aprovar sua publicação. O aceite exige autoria/editoria ativas e fontes conferidas nos últimos sete dias. A opção de renovar conferência só deve ser marcada depois de reabrir e conferir as fontes.
7. O guia aparece em `/guias` e no endereço permanente `/guias/slug`. Atualizações mantêm esse endereço. Arquivar retira a página pública e interrompe o trabalho em andamento.

As abas são Pautas, Em produção, Publicados e Revisões. “Precisa de atenção” mostra o motivo de bloqueio e permite reenviar a pauta depois de resolver a fonte ou o escopo.

## Dados e proteções

Migração `0053_evergreen_guides.sql`: registro de pautas, revisões imutáveis, auditoria e relações com notícias. Os guias são uma entidade própria, separada de `posts`; não entram no RSS de notícias, na contagem de notícias do dashboard ou no gerador de matérias complementares como novas notícias. O formato das URLs atuais das matérias permanece igual.

Há unicidade de intenção e URL. Cada reserva tem token, versão e prazo de 30 minutos. Uma edição humana cancela a reserva; respostas antigas não sobrescrevem o trabalho editorial. Entrega repetida do mesmo texto reutiliza a revisão. Se o retorno muda mantendo o mesmo token, há conflito.

A revisão publicada e a proposta pendente têm referências separadas. Fonte bloqueada, erro de IA, atualização em andamento ou conflito não substituem o guia público. Conferência sem mudança no texto ou nas referências públicas mantém a data pública de atualização. Mudanças efetivas geram uma nova data. A apuração registra URLs abertas, fontes, afirmações, localização da evidência e aplicabilidade temporal.

O código verifica estrutura, URLs e domínio, não comprova sozinho a veracidade de uma afirmação. A revisão editorial é obrigatória nesta versão. Não existe endpoint n8n de publicação automática de guias.

As fontes são consultadas em nova pesquisa ao vencer o intervalo configurado (padrão de 90 dias), com proposta enviada à redação. Esta versão não contém vigilância contínua de cada página nem detecção instantânea de links quebrados. A redação pode solicitar uma pesquisa antecipada a qualquer momento.

## Relacionamento com notícias

`POST /api/n8n/guides/link-existing`, protegido pela chave n8n, recebe `{ "post_id": 123 }`. Procura até dois guias publicados pelos termos da pauta e grava vínculos com uma notícia existente, publicada e indexável. A redação pode fazer o vínculo manualmente no guia. Correspondência por termos é um indício de pertinência, não classificação semântica.

As matérias exibem “Entenda o contexto”; os guias exibem até quatro notícias vinculadas. A lista de vínculos é armazenada em cache por até dez minutos para evitar uma consulta D1 a cada leitura. A biblioteca e os guias públicos usam cache curto de um minuto. Apenas guias publicados com autoria/editoria ativas aparecem no sitemap próprio, vinculado ao índice de sitemaps.

O arquivo `artifacts/guias-evergreen/related-with-guides-sdk.ts` prepara a integração com o fluxo **Matérias complementares IA - Diário do Povo** (`tj04QRmB9WI752Xl`): consultar e vincular o guia existente antes de pesquisar outra complementar; quando houver guia, encerrar a geração para aquela notícia. Foi validado e publicado no fluxo ativo, versão `4298fc1d-63e5-4cec-9a35-37ee1778e8df`. Os parâmetros de todos os nós anteriores foram comparados e preservados. O teste simulado `5380810` confirmou que um guia encontrado encerra a geração antes da pesquisa e da criação de outra matéria.

## n8n e API

- [Guias do Diário — pesquisa e revisão](https://n8n.srv797269.hstgr.cloud/workflow/trKFqBXT0RGGHuW2), ID `trKFqBXT0RGGHuW2`; ativo, versão `376a6872-3af9-4f96-b07c-65af8ba8160b`.
- Credencial CMS: `Header Auth account`; IA: `OpenAi account`. São referências a credenciais existentes, sem segredos no código. A pesquisa usa Responses para inspecionar as ações de abertura das fontes. O redator recebe somente o dossiê e o documento anterior.
- `POST /api/n8n/guides/claim`: `{limit:1}`; fila vazia encerra a rodada sem item sintético.
- `POST /api/n8n/guides/draft`: `guide_id`, `version`, `lease_token`, `document`, `research`; salva proposta para revisão, sem publicar.
- `POST /api/n8n/guides/blocked`: reserva e `reason`; registra o motivo na auditoria.
- Todos os endpoints usam o middleware existente de `X-API-Key`. Todas as alterações do CMS exigem sessão, perfil permitido e CSRF. Conflitos retornam 409.

## Pacote e sequência de lançamento

1. O pacote publicado foi gerado com `node scripts/package-guides-release.mjs artifacts/seo-automation-release artifacts/guias-launch-v2`. A base de produção foi conferida por checksum e ID; somente `_worker.js` mudou. O empacotamento preserva o SEO já publicado e completa os quatro menus administrativos antigos que ainda não tinham o atalho. Não utilizar o pacote anterior `guias-release-final` sobre a produção atual.
2. Aplicar **somente** `migrations/0053_evergreen_guides.sql` em `webapp-prod-v2`, com o mecanismo normal de registro de migrações. Não aplicar em lote outras migrações locais não relacionadas.
3. A pasta publicada foi `artifacts/guias-launch-v2/site`, no projeto Pages `novo-diario-do-povo`, com `node scripts/deploy-guides.mjs artifacts/guias-launch-v2`. O script confere a versão atual de produção antes de enviar o pacote.
4. Conferir login, menu, biblioteca vazia, importação e pesquisa de uma pauta de teste pelo CMS.
5. Atualizar o fluxo complementar a partir da versão ativa atual e ativar o fluxo de guias. Conferir a primeira pesquisa real antes de liberar as demais pautas.
6. A redação publica o primeiro guia após a conferência. As oito propostas não recebem aprovação automática por fazer parte da biblioteca inicial.

Prévia: `node scripts/preview-guides.mjs`. Validação visual: `node scripts/check-guides-visual.mjs` em sessão isolada do Edge. Os HTMLs de demonstração identificam textos e fontes como fictícios e desativam envios.

## Conferência do lançamento

O CMS foi acessado com sessão administrativa real. A importação e a gravação da autoria passaram por CSRF. A chamada real `5380800` acessou a API autenticada e encerrou corretamente com fila vazia. A primeira pesquisa `5380808` citou um PDF sem abrir sua URL; o validador bloqueou a redação e registrou o motivo no CMS. A pauta de backup recebeu a URL direta do fascículo oficial e a instrução de pesquisa passou a exigir abertura explícita de cada fonte. A validação continua exigindo a evidência `open_page`. Referências extras sem uso em afirmações são descartadas. Quando falta abrir uma referência usada, uma segunda consulta automática tenta abri-la; a comprovação de abertura das duas etapas é acumulada. Persistindo a falha, o trabalho é bloqueado, sem redação ou publicação. O teste simulado `5380824` percorreu essa segunda consulta e chegou à entrega de rascunho.

Biblioteca, Meu dia, jogo e matéria real responderam HTTP 200, com Guias e as 13 editorias no menu. CMS sem sessão redireciona para login; API sem chave responde 401 e cache privado. Telas públicas verificadas em 390 e 1440 pixels, sem transbordamento. Testes finais: 53 verificações da implementação, segurança, cache e sitemaps aprovadas; checagem de tipos sem erros.

## Entrega verificada em produção

O guia de backup (ID 5) chegou à etapa **Revisão editorial**, revisão 1, versão 12, autoria Redação (ID 3). A execução de produção `5380827` apurou e redigiu o conteúdo. O banco retornou um limite temporário de recursos na entrega; o reenvio somente do nó que falhou, execução `5380845`, concluiu com sucesso. Há exatamente uma revisão salva e nenhuma publicação automática. A conferência abriu o PDF e o índice oficial; as duas fontes estão no dossiê.

O pacote final `artifacts/guias-delivery-fix-v2/` preserva o SEO da versão `e4cf7373`, as 333 rotas e todos os arquivos estáticos. Substitui apenas os handlers dos guias e o middleware público. A consulta do cache parte de no máximo 4.000 vínculos, com buscas das notícias por chave primária, evitando percorrer o acervo inteiro. A API responde 503 e Retry-After de 15 segundos para sobrecarga temporária do D1.

**Configuração operacional conferida no editor:** o nó “Entregar para o CMS” tenta quatro vezes, com cinco segundos entre tentativas. A atualização via SDK não persistiu `maxTries` e `waitBetweenTries`, embora aceitasse os campos; os valores foram aplicados no editor, lidos novamente pelo conector e publicados na versão acima. Após futuras atualizações do SDK, conferir e preservar esses dois campos antes de publicar o workflow. A entrega usa a mesma reserva e é idempotente.
