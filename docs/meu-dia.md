# Meu dia

## Jornada

- `/meu-dia` abre uma edição nacional pronta para leitura, sem cadastro, geolocalização ou inferência por IP.
- Depois do primeiro bloco, um formulário permite acrescentar um dos 27 estados. O conteúdo nacional permanece visível.
- A seleção explícita é salva em `diario.meu-dia.region.v1` no navegador.
- Um link `?estado=CE` abre aquela edição sem substituir a preferência salva. Valor inválido abre Brasil.
- Sem JavaScript, a edição nacional e a escolha por formulário GET continuam funcionando; a preferência não persiste.
- Estados sem cobertura confirmada mostram uma mensagem clara, sem preencher com conteúdo antigo ou aleatório.
- Matérias abertas e IDs já apresentados são registrados localmente para as marcações “Você já abriu” e “Novo desde sua última visita”. Isso não comprova leitura integral.
- A seleção termina com uma mensagem de conclusão e acesso às últimas notícias.

## Edição e cache

`POST /api/n8n/meu-dia` usa a autenticação existente de chave da API n8n. Exemplo:

```json
{"date":"2026-11-05","items":[{"post_id":123,"section":"essential","scope":"BR","summary":"Uma explicação curta sobre a utilidade desta informação para o leitor.","source_url":"https://fonte-oficial.example/documento","expires_at":null}]}
```

- Seções: `essential`, `changes`, `opportunities`, `follow`.
- Abrangência: `BR` ou UF válida. A UF identifica o público afetado; o município, quando relevante, deve constar no resumo.
- O endpoint valida a data atual em America/Fortaleza, IDs únicos, matérias publicadas e indexáveis, resumos de 20 a 320 caracteres e fontes HTTPS.
- A edição deve incluir pelo menos um item nacional essencial. Oportunidades exigem validade explícita com horário e fuso; itens vencidos são recusados.
- Títulos e URLs das matérias vêm do CMS, não da IA.
- Snapshot em `CACHE`, chave `meu-dia:edition:v1:YYYY-MM-DD`, TTL de dois dias. A página só aceita o snapshot do dia editorial atual.
- Renderização usa uma leitura de KV; a filtragem de região acontece no navegador. Não há consultas à IA por visitante nem criação de perfil no servidor.
- Itens vencidos são retirados no servidor e no navegador. Uma aba aberta é reavaliada a cada minuto. Ao mudar o dia, itens anteriores são ocultados e o leitor é orientado a atualizar.
- Um erro de preparação não deve sobrescrever uma edição válida com uma lista vazia. Na ausência de edição do dia, a página mostra preparação e encaminha para as últimas notícias.

## Automação

[Meu dia - Edição nacional e regional](https://n8n.srv797269.hstgr.cloud/workflow/WjWHCUOd4WUTXwbm).

Rotina diária (alterada de seis em seis horas para 24 horas a pedido do usuário): consulta as 100 matérias publicadas mais recentes; mantém até 80 notícias dos últimos três dias; pesquisa fontes web; seleciona até 32 itens; valida IDs, abrangência, limites, URLs consultadas e validade; publica o snapshot. O gatilho diário foi configurado às 09h no fuso UTC usado pelo n8n, equivalente às 06h em Fortaleza. Apenas o agendamento e seu nome foram alterados; os parâmetros das seis etapas de processamento foram preservados. Artefato: artifacts/meu-dia/workflow-daily-24h.ts.

Limites por seleção: cinco itens nacionais essenciais, três por cada outra seção nacional e dois por estado. Conteúdo insuficiente não é preenchido por suposição. A verificação de estrutura e de URLs consultadas não demonstra isoladamente a veracidade de cada afirmação.

O workflow foi criado e testado com dados simulados. Permanece inativo até a publicação do site; depois deve ser executado uma vez com dados reais, conferido e ativado. Credenciais referenciam as contas já cadastradas, sem chaves no código.

## Entrega

- Fontes: `packages/core/meu-dia.ts`, `packages/core/web/meu-dia.ts`, `public/static/meu-dia.js`, `public/static/meu-dia.css`.
- Testes: `tests/unit/meu-dia.test.ts`.
- SDK e nós do workflow: `artifacts/meu-dia/`.
- Pacote de produção: `node scripts/package-meu-dia-release.mjs`; base `51c68ae7`, preserva o site e adiciona página, API, convite, navegação e JavaScript.
- Não é necessária migração de banco.

## Limites da primeira versão

Sem cidade, IP, cadastro, assinatura de notificações ou envio de mensagens. A cobertura depende do acervo recente; não é garantida uma edição para cada estado. O bloco de oportunidades pode ficar vazio quando não houver prazo vigente confirmado. Retirada posterior de uma matéria do CMS requer atualizar o snapshot para removê-la da seleção.

## Correção da seleção automática — 2026-11-06

A execução manual `5380504` recebeu 80 candidatas, mas a pesquisa propôs apenas um item regional (RJ). A regra de conteúdo nacional essencial interrompeu o fluxo com zero itens e status de sucesso, sem alcançar a publicação.

O workflow `WjWHCUOd4WUTXwbm` foi atualizado e ativado: a pesquisa deve conferir candidatos nacionais antes dos regionais, recebe até oito URLs de fontes extraídas de cada matéria e um texto mais curto (2.200 caracteres). Links enviados são pistas, não substituem conferência. Não se promove assunto local artificialmente a nacional. Ausência de matéria nacional essencial agora gera erro explicativo, preservando a edição anterior. O nó de validação mostra contagens de candidatas, propostas, descartadas, nacionais e regionais.

Nova execução real `5380505`: sucesso, quatro itens validados e publicação confirmada pelo site; quatro cartões conferidos na página pública. Quatro testes em `tests/unit/daily-workflow.test.ts` cobrem fontes, bloqueio regional explícito, descarte e prazo vencido. SDK atualizado em `artifacts/meu-dia/workflow-sdk.ts`; códigos legíveis em `prepare-edition.js` e `validate-edition.js`.

Esta correção altera somente o fluxo n8n. A persistência e a proteção editorial da central continuam conforme `docs/gestao-meu-dia-agenda.md`, com a migração 0052 já implantada.
