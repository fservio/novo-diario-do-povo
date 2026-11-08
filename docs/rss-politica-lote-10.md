# RSS de Política — lote de até dez inéditas

Workflow atualizado: `XXifr4uBAa0N32lG` — Política | O GLOBO | Diário do Povo.

Ativado em 2026-11-06, versão `dca0fd17-3a2e-4838-bdbc-d9fba0273152`. Mantidos o feed, o modelo `gpt-5.6-luna`, a categoria 1, o autor 3 e o intervalo de quinze minutos. Nenhuma pesquisa web foi conectada.

## Comportamento

1. Normaliza o feed e elimina links repetidos na própria leitura. O texto entregue à IA prioriza `content:encoded`, depois `content` e por último `contentSnippet`.
2. Consulta duplicidade de cada candidata. O seletor agora retorna até dez inéditas, em vez de parar na primeira. Uma resposta inválida de duplicidade bloqueia a continuação.
3. O agente recebe cada notícia pelo `$json` atual e usa processamento nativo com `batchSize: 1` e intervalo de 250 ms. São chamadas individuais ao mesmo modelo dentro da rodada.
4. O parser valida cada resposta e recupera o RSS correspondente por `itemMatching(index)`, mantendo `pairedItem`. Título, conteúdo e `original_link` não são obtidos por `.first()` da seleção. A atribuição final à fonte é construída com o link real do RSS.
5. A segunda consulta de duplicidade continua antes de publicar. Cada resposta é associada à reescrita correta; as já publicadas são removidas.
6. POSTs ao CMS usam lotes HTTP de um item com intervalo de 250 ms. A confirmação verifica cada publicação e informa seu ID e fonte.

Todas as reescritas retornadas são validadas antes da etapa de publicação. Uma falha de redação/validação interrompe essa etapa do lote; não é convertida em publicação vazia. Se uma falha de API interromper publicações parciais, as conferências de duplicidade da rodada seguinte preservam as que já foram publicadas.

## Verificação

- Cinco testes unitários: conteúdo completo, seleção de dez, falha fechada na consulta, vínculo individual entre dez respostas e fontes, descarte na segunda consulta e confirmação individual.
- SDK validado sem avisos.
- Teste simulado n8n `5380554`: vinte candidatas, duas duplicadas inicialmente, dez selecionadas e reescritas; duas duplicadas na segunda conferência; oito confirmações simuladas, todas com fontes correspondentes. Serviços externos e publicação foram substituídos por dados de teste nessa execução.
- Execução real `5380555`: sucesso; cem candidatas, nenhuma inédita. Nenhuma matéria artificial foi criada para testar o fluxo.

Arquivos legíveis, SDK e estado anterior em `artifacts/rss-politica-batch/`. Testes em `tests/unit/rss-politica-batch.test.ts`. Somente este workflow foi alterado; os demais fluxos RSS e as integrações do site permanecem independentes.
