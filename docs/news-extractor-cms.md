# NewsExtractor no CMS

Publicado em 06/11/2026 (Fortaleza), implantação `2fc6744b`, em https://diario.dopovo.com.br/admin/news-extractor. Migração 0055 aplicada, extrator atualizado na VPS e ponte n8n ativa. A publicação preservou as 333 rotas da versão de produção 2d8871f0 e acrescentou sete registros de rotas/middlewares; apenas o worker foi alterado no pacote estático.

## Jornada administrativa

O menu de publicação passa a ter **NewsExtractor**, em `/admin/news-extractor`, também acessível por Integrações. Direção e edição podem cadastrar RSS convencionais ou de Trends, enviar uma URL de artigo, solicitar sincronização de uma fonte, consultar até cem itens, excluir uma fonte RSS e repetir solicitações que falharam. O painel mostra conexão, última comunicação, quantidades coletadas, pendências, revisões e últimas trinta solicitações. Não há rastreamento de páginas de últimas notícias nem controle separado de pausa nesta versão.

Cada cartão RSS oferece **Excluir fonte**, que abre a explicação e exige marcar **Confirmo a exclusão desta fonte** antes de enviar. A operação retira a fonte da lista ativa, da coleta recorrente e do RSS agregado. O histórico interno e as matérias já publicadas são preservados. A caixa especial articles não é removível. A marca de remoção persiste após reiniciar a VPS, inclusive para o Trends registrado pelo ambiente; cadastrar explicitamente a mesma fonte pode reativá-la. Uma requisição de extração já iniciada pode terminar, mas o material continua excluído do RSS.

O cadastro é assíncrono. Confirmar um comando significa que o extrator recebeu a solicitação, não que o texto foi extraído nem que uma matéria foi publicada. A publicação segue os workflows editoriais existentes. O n8n consulta comandos e atualiza os relatórios a cada cinco minutos; os feeds continuam sendo coletados pelo serviço a cada quinze minutos. A interface permite atualizar o painel manualmente, sem polling contínuo no navegador.

## Caminho privado

CMS → fila de comandos D1 → ponte n8n → API Docker privada `http://news-extractor:8080` → confirmação e relatório no CMS. O extrator continua sem porta pública. Não existe endereço interno configurável pelo navegador e não foi criado novo segredo. A ponte usa a referência de credencial HTTP existente do n8n para o CMS. URLs de origem são enviadas no corpo; não aparecem na lista de solicitações nem em mensagens de erro da ponte.

Migração `0055_news_extractor.sql`: uma tabela com comandos, identificação de duplicidade, estado, até quatro tentativas e reserva de dez minutos. Índices restringem reservas e consultas recentes; duas solicitações ativas com a mesma origem não criam duas tarefas. O n8n reserva no máximo três por rodada. Erros voltam à fila com espera crescente; a quarta falha encerra a tentativa, inclusive quando o processo cai sem confirmar. Confirmações antigas não encerram reservas novas; confirmações bem-sucedidas são idempotentes. Cadastro e sincronização no extrator são idempotentes para uma repetição após falha de transporte.

Relatórios de fontes e detalhes dos itens ficam no KV CACHE por até sete dias, com horário explícito. Relatórios sem comunicação por quinze minutos aparecem desatualizados. O banco guarda apenas o resumo da consulta, não os detalhes de todos os itens. Os corpos extraídos continuam na VPS. Itens expirados e revisões permanecem distintos de textos prontos.

## Contrato da ponte

Todas as rotas estão sob o middleware `X-API-Key` de `/api/n8n/*` e respondem com `Cache-Control: private, no-store`.

- `POST /api/n8n/news-extractor/claim`: `{limit:3}` → `{success:true,jobs:[{id,kind,payload,lease_token,attempts}]}`.
- `POST /api/n8n/news-extractor/ack`: `{id,lease_token,success,result?}`. Os resultados aceitos correspondem aos endpoints reais de cadastro de RSS, artigo, sincronização ou consulta de itens; falha de transporte usa `success:false` sem copiar mensagens ou URLs privadas.
- `POST /api/n8n/news-extractor/report`: `{checked_at,feeds}` conforme `GET /feeds` do extrator. Campos extras são descartados. Relatórios com mais de dez minutos ou no futuro são rejeitados.

Comandos aceitos: `rss {url,name,mode}`, `article {url}`, `sync {source_id}`, `inspect {source_id}` e `remove {source_id,confirm_remove:"yes"}`. A API privada executa respectivamente `POST /feeds`, `POST /articles`, `POST /feeds/:id/sync`, `GET /feeds/:id/status` e `POST /feeds/:id/remove`. O coletor mantém a validação de DNS/IP público, TLS, robots e limites; a validação inicial no CMS não substitui esses controles. Escritas no painel exigem sessão, papel de editor/diretor e CSRF.

## Procedimento de implantação

1. Aplicar somente a migração 0055 em produção.
2. Publicar o CMS incluindo as novas rotas, serviço, CSS e atalhos. Preservar as outras alterações em andamento; não substituir o worker por um artefato antigo.
3. Atualizar o extrator na VPS com os novos feeds.py e server.py antes de habilitar o comando de exclusão. A inicialização cria automaticamente a tabela local feed_removed no volume SQLite existente. Atualização implantada; chave SSH temporária revogada e arquivo privado local excluído ao concluir. Imagem anterior preservada como diario-news-extractor:pre-cms-removal-v1 e fontes anteriores em /opt/diario-news-extractor/backups/cms-removal-v1.
4. Ativar [NewsExtractor — ponte com CMS](https://n8n.srv797269.hstgr.cloud/workflow/ssZQQfsLpnKeyqiV), ID `ssZQQfsLpnKeyqiV`, 12 nós. Não ativar antes das rotas e do novo endpoint privado existirem. Não requer OpenAI, nova pesquisa web ou porta pública.
5. Conferir o primeiro relatório, testar uma solicitação de consulta de itens e confirmar o estado na fila. Depois testar cadastro/coleta com uma fonte escolhida para uso real.

O cadastro pelas Data tables existente continua operando. A ponte não altera a entrada RSS enriquecida usada pelo jornalista nem as complementares. Falhas no CMS não interrompem as fontes já cadastradas no extrator.

## Validação e prévia

Vinte e dois testes locais passaram, cobrindo normalização e bloqueio de URLs inválidas, deduplicação, exclusividade das reservas, idempotência, expiração, limitação de tentativas, relatórios compactos, ausência de corpos no cache de detalhes, autorização, chave de API, CSRF, roteamento privado da ponte e regressões do layout administrativo. Typecheck e validação SDK também passaram. Na preparação, os testes foram locais; a confirmação posterior em produção está registrada na seção final.

Prévia: `node scripts/preview-news-extractor.mjs`. Arquivos `artifacts/news-extractor-cms/dashboard.html` e `source.html` usam dados fictícios e bloqueiam os envios. Interface conferida no navegador em desktop e celular, sem rolagem horizontal dos formulários.

Gerador da ponte: `scripts/build-news-extractor-bridge.mjs`; artefato `artifacts/news-extractor-cms/bridge-workflow.ts`.

Após incluir exclusão, passaram 23 testes do CMS/ponte/autorização/navegação, treze testes Python locais e na imagem da VPS, e typecheck. Os testes adicionais verificam confirmação obrigatória, proteção da caixa de artigos, exclusão idempotente, remoção do RSS agregado, interrupção de novas coletas e preservação da exclusão após reinicialização. Não houve exclusão de fonte real em produção.

## Confirmação em produção

Ponte ativa na versão 6a748a5b-5e2b-45c0-9845-eb8be5388fee. Execução 5381342 confirmou fila vazia e gravou o primeiro relatório de duas fontes. Uma solicitação de consulta enviada pela sessão real do CMS percorreu a fila, a API privada e a confirmação na execução 5381343: 67 itens retornados e comando concluído. O painel autenticado exibiu os itens e a confirmação, com o controle de exclusão apenas no cartão RSS. Captura: artifacts/news-extractor-cms/production.jpg.

O pacote de produção é gerado por scripts/package-news-extractor-cms.mjs e publicado por scripts/deploy-news-extractor-cms.mjs, com conferência de versão e hashes. A implantação foi precedida pela prévia 5720d99f, que confirmou login, redirecionamento do painel sem sessão e rejeição de requisições sem chave. O estado final está em artifacts/news-extractor-cms/release.json e artifacts/news-extractor-cms-production/release.json.
