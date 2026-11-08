# Agenda cultural do Meu dia

Primeira cidade prioritária: **Teresina**. A prioridade é editorial, não uma inferência da localização do leitor.

## Experiência

- Bloco logo após “O essencial”, com acesso na navegação da edição.
- Seleção independente de cidade, categoria e período: Hoje, Fim de semana (sábado/domingo atual ou seguinte), Próximos dias (30 dias).
- A cidade escolhida é salva apenas no navegador. Links com `cidade` explícita têm prioridade naquela visita e não sobrescrevem a preferência salva.
- Teresina aparece primeiro no seletor; outras cidades aparecem conforme houver programação confirmada.
- Cartões informam categoria, cidade, data, local, horário conhecido e preço. Valores desconhecidos não viram gratuidade. Datas sem horário mostram “Horário a confirmar”.
- Seis cartões por etapa; “Mostrar mais” revela outros seis do mesmo snapshot, sem requisição ao servidor.
- Cada evento tem URL estável em `/agenda/:slug`, com informações completas, fonte e data de conferência. Cancelamentos permanecem acessíveis na página, identificados, e saem da listagem.
- Imagens vêm da biblioteca editorial por `image_media_id`. Sem imagem, o cartão usa uma composição gráfica de categoria, não uma fotografia inventada.
- Eventos encerrados saem automaticamente. Quando o término é um horário conhecido, usa esse instante; quando só o último dia é conhecido, permanece até o fim daquele dia no fuso do evento.
- Formulários GET mantêm cidade/categoria/período funcionando sem JavaScript. A preferência local e a paginação dependem de JavaScript.

## Dados e cache

Migração: `0050_cultural_events.sql`. Programação durável em D1; snapshot de até 200 registros em KV por seis horas; detalhes em KV por uma hora. Cada atualização renova a listagem e o cache dos eventos afetados. Imagens editoriais existentes são preservadas quando a coleta não envia uma imagem.

Integração protegida pela chave existente de `/api/n8n/*`:

- `GET /api/n8n/culture/events`: programação existente para reconferência.
- `POST /api/n8n/culture/events`: lote de até 30 registros, com atualização idempotente por `slug`.

```json
{"events":[{"slug":"identificador-estavel-do-evento","title":"Título confirmado","summary":"Descrição factual baseada na programação oficial.","category":"music","state":"PI","city":"Teresina","venue":"Local confirmado","address":null,"starts_on":"2026-11-07","ends_on":"2026-11-07","starts_at":null,"ends_at":null,"timezone":"America/Fortaleza","price_type":"unknown","price_text":null,"source_url":"https://organizador.example/evento","verified_at":"2026-11-05T15:00:00Z","image_media_id":null,"status":"scheduled"}]}
```

Categorias: `music`, `theater`, `exhibition`, `cinema`, `gastronomy`, `family`, `other`. Preço: `free`, `paid`, `unknown`. Situação: `scheduled`, `cancelled`. A fonte precisa de HTTPS, a conferência deve ter ocorrido nos últimos sete dias, e datas/horários devem ser compatíveis com o fuso declarado.

## Coleta inicial de Teresina

[Agenda cultural - Teresina](https://n8n.srv797269.hstgr.cloud/workflow/MDBs9wqUqpubQRzm), preparada para rodar a cada 12 horas. Permanece inativa até o lançamento da integração.

Fontes prioritárias identificadas: [Sesc Piauí / Sesc Cajuína](https://www.sescpiaui.com.br/unidades-operacionais/sesc-centro-cultural/) e [Secretaria de Estado da Cultura no portal oficial](https://www.pi.gov.br/orgao/secretaria-de-estado-da-cultura-secult/). Páginas institucionais não são eventos: uma página com horários de funcionamento ou atividades de anos anteriores não basta para criar programação atual.

O fluxo pesquisa páginas oficiais, exige evidência de abertura da página, confere datas/locais/preços e envia no máximo 12 eventos por coleta. Não reaproveita eventos de anos anteriores nem baixa imagens de terceiros. Horários desconhecidos permanecem nulos. SHA-256 cria identificadores estáveis; `existing_slug` permite atualizar um evento conhecido mesmo após remarcação. Cancelamentos exigem confirmação explícita da fonte.

Validação estrutural e fonte consultada não garantem isoladamente todas as afirmações; a primeira coleta real deve ser conferida antes da ativação recorrente. Ausência de resultado não cancela um evento existente.

## Prévia e publicação

`node scripts/preview-meu-dia.mjs` atualiza `artifacts/meu-dia/preview.html` e cria páginas locais de detalhes dos eventos ilustrativos. Nenhum exemplo é enviado ao banco.

Para lançar: aplicar a migração 0050, empacotar a versão atual do Meu dia (por exemplo `node scripts/package-meu-dia-release.mjs artifacts/meu-dia-culture-production-v2`), publicar o site, executar e conferir as primeiras coletas reais, então ativar os fluxos do Meu dia e da agenda.

Testes: `tests/unit/culture-agenda.test.ts` e `tests/unit/meu-dia.test.ts`. SDK exportado em `artifacts/culture-agenda/`.

## Participação dos organizadores e recursos do leitor

- `/agenda/sugerir`: formulário público com Teresina como cidade inicial; admite eventos de todo o Brasil. Recebe programação, fonte oficial e contato privado, com autorização para análise. O envio entra como pendente, sem publicação automática.
- `/admin/culture/suggestions`: fila restrita a editores e direção. Permite corrigir dados, conferir a fonte, publicar ou recusar com nota interna. A publicação exige confirmação de conferência; o contato nunca é copiado para o evento público.
- Aplicar também `migrations/0051_cultural_suggestions.sql` antes de disponibilizar o formulário. Proteções: token por cookie, origem, consentimento, limite de tamanho, campo antirrobô, duplicatas e até cinco novas sugestões por hora/IP (chave hash; sem IP bruto na tabela).
- Favoritos: até 50 links no navegador, sem cadastro. Não representam reserva nem inscrição.
- `/agenda/:slug/calendario.ics`: download de calendário com horário local convertido para UTC. Quando o horário é desconhecido, explica e gera lembrete de dia inteiro. O arquivo importado não recebe atualizações automáticas.
- Prévia local: `artifacts/meu-dia/preview.html`; formulário demonstrativo em `sugerir-evento.html`, sem envio real. Nenhum evento ilustrativo deve ser publicado.
- Esta etapa permanece local. Publicação exige migrações, implantação das rotas e arquivos estáticos, e validação em produção antes de ativar os fluxos de coleta.


## Publicacao em 2026-11-06

Implantacao `1909afa8` em producao. Migracoes 0050 e 0051 aplicadas. Coleta inicial da agenda: execucao n8n `5380462`, cinco eventos publicados; edicao Meu dia: `5380463`, dois itens. Ambos os fluxos ativos (12h e 6h respectivamente). Conferidos HTTP 200 nas paginas e arquivo de calendario, cache privado no formulario, redirecionamento de autenticacao da fila e bloqueio 403 de envio sem token. Exemplos da previa permanecem locais. Artefato: `artifacts/meu-dia-launch-production/site`.
