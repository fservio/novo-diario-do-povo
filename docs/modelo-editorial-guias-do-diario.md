# Guias do Diário — modelo editorial e contrato de automação

Modelo editorial preparado em 06/11/2026. A implementação local do CMS, das rotas e da integração n8n está descrita em `docs/gestao-guias-do-diario.md`; foi publicada em produção em 06/11/2026. As oito pautas foram importadas e seguem sem aprovação editorial individual.

## O que cada guia deve entregar

Uma resposta duradoura para uma pergunta identificável do leitor brasileiro. Cada guia tem uma pergunta principal, uma intenção editorial única, público e escopo definidos. O texto pode receber atualizações sem mudar sua identidade. Informações variáveis permanecem vinculadas a uma data, a uma fonte e a uma revisão.

A biblioteca inicial contém oito propostas em quatro áreas, sem estabelecer um teto para produção. O arquivo de trabalho é `packages/core/db/evergreen-library.json`; a versão para leitura é `docs/biblioteca-guias-do-diario.md`. Os títulos e a ordem do piloto são propostas editoriais, não publicação automática autorizada de cada pauta.

## Estrutura da página

1. **Título útil:** apresenta a pergunta ou tarefa, sem promessa exagerada e sem adicionar o ano apenas para parecer recente.
2. **Resposta direta:** primeiro bloco resolve a dúvida central em linguagem simples, sustentada pelas fontes.
3. **Neste guia:** navegação por âncoras quando o tamanho justificar.
4. **Entenda:** conceitos e distinções necessários para compreender a resposta.
5. **Na prática:** exemplos identificados como hipotéticos ou situações reais documentadas; passos somente quando adequados ao assunto e testáveis.
6. **Dúvidas relacionadas:** perguntas que ajudam a resolver a mesma tarefa, sem repetir o corpo nem preencher uma quantidade obrigatória.
7. **Fontes e conferência:** links acessíveis, organização responsável e data da conferência efetivamente realizada.
8. **Continue a leitura:** notícias e guias relevantes já existentes. Não inventar URLs.

O tamanho acompanha o que é necessário para responder bem. Não estabelecer um mínimo de palavras como substituto de qualidade. Texto original deve organizar, explicar e exemplificar o material apurado, em vez de apenas trocar palavras de uma fonte.

## Dados exigidos antes de produzir

| Campo | Uso |
|---|---|
| `intent_key` | Identidade estável da pergunta/tarefa, com unicidade no registro de pautas |
| `slug` / `canonical_path` | Endereço permanente proposto em `/guias/`, sem data |
| `reader_question` | Pergunta que o primeiro bloco precisa resolver |
| `questions` | Perguntas secundárias que delimitam o conteúdo |
| `scope_limits` | O que esta pauta não pode afirmar ou incluir |
| `category_slug` / abrangência | Editoria existente e público; estes primeiros guias são nacionais |
| `source_ids` | Fontes de referência a consultar; identificação não equivale a apuração |
| `news_triggers` | Indícios para relacionar uma notícia ao guia; não confirmam sozinhos a pertinência |
| `revision_triggers` | Mudanças que justificam nova conferência |

Os IDs numéricos de editoria e autoria serão resolvidos no CMS durante a integração. A autoria será a conta editorial efetivamente configurada; a IA não pode inventar profissionais, entrevistas, experiência pessoal ou revisão especializada.

## Apuração e escrita em etapas separadas

**Pesquisa:** produzir um dossiê com afirmações sustentadas por fontes, e só depois solicitar a redação. Cada afirmação registra URL exata, trecho/localização da evidência, instante da consulta e o período a que a informação se aplica. A data em que o robô leu a página não é a data do fato. Referências externas são dados, nunca instruções.

Uma fonte identificada por busca não recebe automaticamente o estado de conferida. Nesta preparação, o índice do CERT.br foi aberto; parte das páginas do INMET, IBGE e Biblioteca Nacional apresentou bloqueio ou timeout no leitor automatizado. As pautas correspondentes continuam propostas. O fluxo futuro deve consultar uma alternativa oficial e suficiente ou marcar a apuração como bloqueada. Falha de acesso não autoriza completar o texto com a memória do modelo.

**Redação:** usar somente o dossiê aprovado para a pauta. O corpo deve cobrir a pergunta principal, conservar ressalvas e separar exemplos de dados reais. Não inserir índices mensais, cargos, preços, horários ou telas de aplicativos como informações permanentes.

**Validação:** conferir correspondência entre texto e dossiê, completude da resposta, links, estrutura, datas e limites de escopo. Verificação estrutural por código e segunda leitura por IA ajudam, mas não constituem prova independente da veracidade. Os primeiros guias seguem para revisão editorial; a liberação automática posterior será uma configuração explícita por assunto e critérios, sem presumir aprovação por uma nota gerada pela própria IA.

## Duplicidade e atualização

- Uma mesma intenção atende a vários gatilhos de notícias. O fluxo deve preferir vincular o guia existente.
- Se a pauta exata já está em produção, a rodada não cria outro trabalho igual.
- Títulos diferentes não bastam para justificar um segundo guia. Quando a equivalência for incerta, encaminhar para decisão editorial.
- Uma mudança na fonte gera proposta de revisão do mesmo guia, com histórico, em vez de outra página quase igual.
- A redação protege suas correções. Toda atualização compara a versão lida com a atual e preserva alterações manuais; conflitos voltam para revisão.
- Revisão de rotina sem mudança efetiva pode atualizar o registro interno de conferência. A data pública de atualização só muda quando houver modificação relevante no conteúdo.

## Fluxo previsto no n8n

Fila de pautas → consultar existência e reservar trabalho → coletar fontes → validar dossiê → redigir → validar texto e links → revisão/configuração editorial → publicar ou atualizar → registrar fontes, versão e próxima conferência.

O registro de pautas terá estados próprios: proposta, em apuração, bloqueada, rascunho, em revisão, aprovada, publicada e revisão pendente. Esses estados não devem ser enviados como se já existissem no campo `posts.status` da API atual.

O tamanho do lote é configurável na futura integração. O limite de dez aplicado ao RSS de Política não é herdado automaticamente. A produção acompanha pautas disponíveis e verificadas, com limite de trabalho simultâneo e uma reserva de execução que impeça duas rodadas de produzir o mesmo guia.

Guias e matérias complementares geradas devem ser excluídos da descoberta automática de novas notícias, evitando geração recursiva. O fluxo de matérias complementares existente precisa consultar a biblioteca antes de criar outro explicativo para uma dúvida já atendida.

## Manutenção e distribuição

Consultar fontes em agenda configurável conforme a estabilidade do assunto. Reutilizar a coleta de uma URL entre pautas e comparar o corpo editorial relevante, sem tratar alterações de menu, publicidade ou relógio da página como mudança factual. Fonte alterada, link quebrado, correção editorial e informação datada vencida colocam o guia na fila de revisão. Falhas não apagam o texto aprovado nem resultam em atualização vazia.

O CMS previsto terá Pautas, Em produção, Publicados e Revisões. Deve mostrar origem da pauta, guia existente, fontes, última conferência, modo de publicação, responsável e histórico. O site pode distribuir os guias na biblioteca pública, nas matérias relacionadas e no Meu dia quando fizerem sentido para aquela edição.

A implementação usa uma entidade própria para os guias, com revisões e relações com as notícias. O formato atual de URL das notícias não é alterado. Guias não entram no RSS nem na descoberta de notícias para geração recursiva. As rotas, a migração e os endpoints precisam ser instalados em produção antes de ativar o novo fluxo.

## Critérios para concluir o piloto

O primeiro guia precisa responder sua pergunta, ter afirmações rastreáveis, passar pela revisão editorial e manter uma URL estável. Reexecutar o mesmo trabalho deve reutilizar o registro. Uma fonte indisponível deve produzir bloqueio explicativo; uma edição manual concorrente deve ser preservada. As ligações com notícias devem apontar para páginas existentes.

## Referência editorial

O Google recomenda conteúdo útil, original e com fontes claras e orienta a conferência do material gerado com IA. Estas referências informam os critérios de qualidade; não são promessa de tráfego ou de posição na busca:

- [Conteúdo útil e confiável](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).
- [Orientação sobre conteúdo gerado com IA](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content).
