# Matérias complementares por IA

Workflow: [Matérias complementares IA - Diário do Povo](https://n8n.srv797269.hstgr.cloud/workflow/tj04QRmB9WI752Xl).

## Funcionamento

- Agenda a cada 30 minutos. Busca as 100 matérias publicadas mais recentes.
- Considera notícias com origem registrada (`original_link`), publicadas nas últimas 24 horas. Abrange formulário, RSS e Trends sem alterar os fluxos existentes.
- Exclui conteúdos ocultos, opinião, coberturas ao vivo e matérias complementares geradas por esta rotina.
- Consulta duplicidade de até dez candidatas e redige até duas ainda não atendidas por execução. Tentativas concluídas ficam em histórico local do workflow por seis horas.
- Primeiro redige usando a matéria original. Se ela não sustentar um ângulo complementar, procura pesquisas salvas compatíveis e matérias relacionadas do acervo recente. Só realiza uma segunda tentativa de redação quando encontra material adicional. Se continuar insuficiente, grava uma pendência. Não há novas chamadas de pesquisa web neste workflow.
- A extensão é proporcional ao material, com piso técnico de 120 palavras. Exige um trecho literal de apoio por parágrafo, URLs restritas aos materiais recebidos, HTML permitido e metadados temporais compatíveis. As verificações estruturais não comprovam isoladamente a veracidade ou originalidade de todas as afirmações.
- Publica na editoria da matéria original, com autor configurado no `Config1`. Não herda a autoria pessoal do texto original.
- Usa `https://diario.dopovo.com.br/ia/relacionada/v1/{parent_id}` como identificador estável em `original_link`, impedindo repetição em reexecuções sequenciais e a geração recursiva.
- Acrescenta ao texto complementar um link para a notícia original e grava o vínculo bidirecional para priorização no “Leia também”.

## Integração do site

Migração: `0049_post_related_articles.sql`. O par é normalizado e único; uma segunda chamada não duplica o vínculo.

`POST /api/n8n/posts/:id/related`, protegido pelo middleware existente de chave da API n8n:

```json
{"related_post_id": 123}
```

As duas matérias devem estar publicadas e visíveis. A relação não reescreve nenhum conteúdo. `findRelatedPosts` prioriza as relações explícitas, completa com notícias recentes da editoria e continua filtrando conteúdos retirados do ar.

## Publicação e manutenção

- SDK validado e testes simulados no n8n até `Confirmar vínculo`.
- Testes locais: `tests/unit/related-articles.test.ts` e `tests/unit/related-workflow.test.ts`.
- Pacote do site: `scripts/package-related-articles-release.mjs`, a partir da versão `839c8379`.
- Primeira execução real: `5380410`; original `419666`, complementar `419668`.
- Credenciais são referências às já cadastradas no n8n; não há chaves no código.
- Configuração exportada: `artifacts/related-articles/workflow-sdk.ts` e `nodes.json`.

## Atualização sem pesquisa web — 06/11/2026

Versão ativa: `722f1f10-e3c2-4b2b-b17b-ea2fa9f1d09e`, 30 nós. Removidos `Prepare Research Request`, `Research Topic` e `Validate Research`; o modelo não tem ferramentas de pesquisa. A geração e vinculação automáticas das aprovadas foram preservadas. Nenhum lote real foi disparado nesta atualização.

Duas tabelas privadas do n8n, acessíveis por [Data tables](https://n8n.srv797269.hstgr.cloud/home/datatables):

- **Complementares — pesquisas reutilizáveis** (`zQh4rHtLQ4a9OHfB`): recebeu 18 dossiês validados das 16 execuções mais recentes do fluxo, preservando o instante original da pesquisa. Não é uma importação de todo o histórico da conta. TTL máximo de 24 horas; fatos de situação vigente ou agenda só entram no material reutilizado por até duas horas. Correspondência por mesma matéria ou pelo menos três termos relevantes do título com sobreposição mínima de 40%. A tabela é lida uma vez por execução, até 200 registros mais recentes. Não captura automaticamente novas pesquisas dos outros workflows; elas podem ser importadas para a tabela. O reaproveitamento contínuo também consulta o acervo recente, sem criar novas pesquisas.
- **Complementares — pendências** (`3zMEDC0UbywA5HZs`): upsert por matéria original, com título, motivo, etapa, situação e horário. Aprovadas recebem situação publicada após confirmação da publicação e do vínculo. Tentativas futuras respeitam o intervalo de seis horas e a janela de 24 horas da seleção; não há atendimento retroativo garantido.

O acervo adicional exclui opiniões, conteúdos ocultos, coberturas ao vivo, complementares automáticas e matérias com mais de 24 horas. Cada material conserva data e origem; reutilização não equivale a nova conferência da vigência. Conhecimento memorizado do modelo não é fonte para fatos adicionais.

Testes: 17 verificações locais e typecheck. Execução isolada `5381303` reteve uma explicação curta sem publicá-la. Execução `5381304` leu os 18 dossiês reais, reteve a primeira tentativa por falta de conteúdo adicional, selecionou cinco fontes salvas e aprovou a segunda redação: “O que a investigação do Cenipa busca esclarecer após uma ocorrência aérea”. Nesse teste, publicação, vínculo e gravação de situação foram simulados. Não houve pesquisa web nem escrita no CMS. Os dois workflows temporários foram arquivados. As evidências literais não constituem verificação independente de todas as afirmações.

Gerador atual: `scripts/build-complement-no-search.mjs`; runtime: `scripts/complement-no-search-runtime.mjs`. Os artefatos `workflow-sdk.ts` e `nodes.json` refletem o desenho atual. A versão anterior está em `no-search-baseline.json` para revisão e recuperação.

## Limites operacionais

A seleção é limitada a duas matérias por rodada e às 100 mais recentes, não garante atendimento de todo o acervo. Não é um importador retroativo. Uma falha após a publicação e antes da vinculação pode exigir repetir a chamada do endpoint; a publicação não deve ser repetida com um identificador de origem diferente.
