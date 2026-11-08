# Central Meu dia e Agenda

## Acesso e operação

Disponível para edição e direção em `/admin/meu-dia`, pelo menu **Meu dia e Agenda**. As três abas compartilham navegação e usam autenticação administrativa, CSRF nos formulários e cache privado.

- **Edição do dia**: mostra a edição atual, permite adicionar matérias publicadas, editar resumos/fontes/validade, trocar abrangência/seção, definir ordem e retirar itens. A publicação manual protege a edição inteira do dia. É obrigatório manter conteúdo nacional essencial. A ação de voltar ao automático usa a última seleção automática disponível e exige que ela exista. Um novo dia editorial em America/Fortaleza começa sem proteção herdada.
- **Eventos**: pesquisa por título/cidade; filtros de programação atual, protegidos, cancelados e arquivo completo; cadastro, edição, destaque e cancelamento. Salvar exige conferência da fonte e protege o registro contra atualizações automáticas. Liberar a coleta exige confirmação explícita. A origem inicial é preservada ao editar um evento de outra origem.
- **Sugestões**: mantém a fila de organizadores e os contatos privados, com publicação/recusa editorial. Um evento aprovado passa a ter origem de organizador e proteção editorial. A sugestão revisada identifica o responsável e oferece acesso à gestão do evento.

## Persistência e automação

Aplicar `migrations/0052_daily_editorial_management.sql` **antes** da implantação desta versão. Não executar a migração novamente: ela adiciona colunas às tabelas existentes.

`daily_editorial_editions` conserva a última seleção automática e a publicação editorial em campos separados. A automação atualiza somente `automatic_json` e o cache automático já existente. A edição pública consulta primeiro `meu-dia:editorial:v1:DATA`; depois o cache automático, com fallback para o banco. Uma atualização automática não escreve na chave editorial. Edições e revisões são organizadas pelo dia de Brasília.

`cultural_events` ganha origem, proteção editorial, responsável, revisão e destaque. O upsert automático só altera registros com `editorial_locked=0`. A conferência de versão impede salvar um formulário de evento obsoleto. Eventos cancelados deixam a listagem pública, mas preservam a página de detalhes. Destaques têm prioridade na consulta em cache, respeitando os filtros públicos.

`daily_management_audit` registra ações humanas, responsáveis, instantes e snapshots. A coleta continua registrando sua atualização e conferência no próprio evento; execuções e erros de integração continuam disponíveis no n8n. A central não é um monitor em tempo real do n8n.

As seleções antigas que já estavam somente no KV são lidas pela central sem migração destrutiva. A primeira coleta ou publicação editorial grava o registro correspondente no banco. Registros existentes de organizadores são identificados e protegidos na migração.

## Verificação e prévia

- `tests/unit/daily-management.test.ts`: proteção contra coleta, cancelamento, destaque, liberação explícita, concorrência de edição, ordem/retirada, retorno ao automático, validação de matérias e restrição por perfil.
- Regressão: testes de Meu dia, agenda e participação de organizadores.
- `node scripts/preview-admin-meu-dia.mjs`: gera seis páginas ilustrativas em `artifacts/admin-meu-dia/`, com envios desativados e dados fictícios.
- `node scripts/package-meu-dia-release.mjs artifacts/meu-dia-management-production`: empacota somente esta evolução sobre a base controlada, preservando os ajustes visuais anteriores. Nenhuma publicação ou ativação adicional do n8n é feita por esse script.

Publicado em 2026-11-06: migração 0052 aplicada e implantação `f7e4f060` concluída. Artefato `artifacts/meu-dia-management-spacing-v2-production/site`. Rotas administrativas verificadas com redirecionamento para login e cache privado; páginas públicas com HTTP 200, cinco eventos preservados e ajustes anteriores de contraste e recuo mantidos.
