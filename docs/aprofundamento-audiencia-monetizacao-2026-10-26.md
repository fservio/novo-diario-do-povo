# Diário do Povo — aprofundamento e plano operacional

Coleta adicional em **26/10/2026**. Período: **28/09 a 25/10/2026**, comparado a **31/08 a 27/09/2026**. Mesmo hostname: **diario.dopovo.com.br**. Complementa o [diagnóstico inicial](./diagnostico-audiencia-monetizacao-2026-10-26.md).

## O que a nova coleta resolveu

1. **O Direct de baixo rendimento está concentrado no desktop.** O cruzamento registra 25.425 sessões, tempo médio exibido de 0s e US$ 0,27 de receita GA4.
2. **A diferença de receita foi conciliada:** US$ 6,02 em anúncios automáticos e US$ 3,36 em manuais, totalizando US$ 9,38.
3. **A consulta openai foi localizada:** a exposição se concentra em variantes de uma notícia publicada em 23/10, quase toda no Brasil, em tablets e computadores, num pico de um único dia.
4. **Há sobreposição editorial confirmada na amostra:** três versões inspecionadas têm o mesmo título e fonte, abordam o mesmo acontecimento com redações muito semelhantes e declaram canônicas próprias.
5. **O fluxo atual de Economia já apresenta controles adicionais de duplicidade.** Isso não comprova como as versões de 23/10 foram produzidas nem elimina todas as possibilidades de repetição.

Não houve alteração de anúncios, bloqueio de países, exclusão de matérias, redirecionamento, publicação de campanha ou execução de fluxo nesta etapa. Os testes e a oferta comercial abaixo são propostas concretas para execução posterior; seus resultados ainda não existem.

## 1. Direct × dispositivo

GA4, filtro exato de hostname. Métricas de receita pertencem ao GA4 e não devem ser somadas ao AdSense.

| Canal e dispositivo | Sessões atuais | Engajadas | Taxa de engajamento | Tempo por sessão | Receita GA4 | Sessões anteriores | Receita anterior |
|---|---:|---:|---:|---:|---:|---:|---:|
| Direct / desktop | 25.425 | 4.080 | 16,05% | 0s | US$ 0,27 | 5.427 | US$ 0,09 |
| Direct / mobile | 1.174 | 292 | 24,87% | 9s | US$ 0,76 | 289 | US$ 0,09 |
| Organic Search / desktop | 2.293 | 1.443 | 62,93% | 23s | US$ 1,98 | 741 | US$ 0,50 |
| Organic Search / mobile | 4.429 | 2.938 | 66,34% | 25s | US$ 5,50 | 1.023 | US$ 1,00 |

Direct / desktop equivale a **73,94% das sessões totais** do relatório, mas a apenas **2,92% da receita GA4**, participação exibida com precisão interna. Organic Search / desktop monetiza melhor que Direct / desktop, mesmo no mesmo tipo de dispositivo. Portanto, a hipótese de que o baixo RPM do computador decorre exclusivamente do layout não se sustenta.

**Cautela de agregação:** as sessões das linhas por dispositivo não reconciliam perfeitamente com a tabela sem essa dimensão. Por exemplo, Direct desktop + mobile supera ligeiramente o Direct agregado. Preservamos os valores exibidos e não recalculamos o total somando dimensões. Tempo exibido como 0s é arredondado e não demonstra que cada sessão durou exatamente zero segundo.

## 2. Direct × desktop × país

Aplicado um segundo filtro: **categoria de dispositivo = desktop**, mantendo o hostname. A tabela foi pesquisada por **Direct**, com país como dimensão secundária. O total filtrado confirmou **25.425 sessões, US$ 0,27 e 0s**.

| País | Sessões | Taxa de engajamento | Tempo por sessão | Receita GA4 exibida |
|---|---:|---:|---:|---:|
| Estados Unidos | 7.015 | 13,01% | 0s | US$ 0,01 |
| Noruega | 5.394 | 8,21% | 0s | US$ 0,03 |
| China | 4.817 | 1,00% | 1s | US$ 0,01 |
| Finlândia | 2.823 | 76,51% | 0s | US$ 0,01 |
| Alemanha | 1.891 | 0,90% | 0s | US$ 0,00 |
| Brasil | 1.535 | 18,89% | 5s | US$ 0,17 |
| Singapura | 611 | 3,60% | 0s | US$ 0,00 |
| Hong Kong | 112 | 9,82% | 0s | US$ 0,00 |
| Rússia | 107 | 3,74% | 0s | US$ 0,00 |
| Vietnã | 81 | 25,93% | 1s | US$ 0,00 |

Estados Unidos, Noruega e China somam **17.226 sessões** nesse recorte, aproximadamente **67,8% do Direct desktop**. O Brasil tem 6,04% das sessões e 64,8% da receita desse recorte, conforme as participações exibidas pelo GA4.

Como referência em todos os dispositivos, **Organic Search / Brasil** apresentou **6.070 sessões, 68,71% de engajamento, 26s por sessão e US$ 7,10**, equivalentes a 77,86% da receita GA4 de todo o site. É um indicador mais útil de audiência comercialmente relevante que o total bruto de sessões.

O contraste da Finlândia — taxa de engajamento alta, tempo arredondado em 0s e pouca receita — merece verificar eventos, sessões e navegação. Uma taxa isolada não comprova leitura qualificada.

### Navegadores — Direct, todos os dispositivos

| Navegador | Sessões atuais | Sessões anteriores | Engajadas atuais | Tempo por sessão | Receita GA4 atual |
|---|---:|---:|---:|---:|---:|
| Chrome | 20.879 | 5.232 | 4.176 | 1s | US$ 0,68 |
| (not set) | 3.585 | 7 | 0 | 0s | US$ 0,00 |
| Safari | 1.482 | 345 | 74 | 2s | US$ 0,18 |
| Firefox | 642 | 20 | 20 | 5s | US$ 0,01 |
| Android Webview | 220 | 43 | 3 | 0s | US$ 0,00 |

A linha **(not set)** merece prioridade na validação de medição: cresceu de 7 para 3.585 sessões, sem sessões engajadas e sem receita registrada. O padrão conjunto é compatível com hipóteses de automação, monitoramento ou eventos incompletos, mas a causa não foi comprovada. Não bloquear países ou navegadores em massa com base apenas nestas tabelas.

## 3. Direct × página de entrada

Todos os dispositivos; hostname exato; canal pesquisado por Direct; dimensão **Página de destino + string de consulta**. O relatório apresentou **14.606 combinações de linhas** entre os períodos, indicando grande dispersão. Esse número não deve ser tratado como contagem de leitores ou de matérias publicadas.

| Entrada, identificada por caminho/tema | Sessões atuais | Engajadas | Tempo por sessão | Receita GA4 |
|---|---:|---:|---:|---:|
| `/` | 1.474 | 171 | 4s | US$ 0,03 |
| Correios / Pinheiro Neto, caminho com r-7097-milhoes, 23/10 | 73 | 40 | 20s | US$ 0,13 |
| Guindaste / monotrilho, 24/10 | 61 | 28 | 16s | US$ 0,11 |
| Mudança no TSE, 14/10 | 35 | 23 | 30s | US$ 0,05 |
| `/2026/10/24/justica-suspende-exigencia-de-opa-da-oncoclinicas` | 31 | 1 | 0s | US$ 0,00 |
| Grupos de Lula e Flávio / debate da Band, variante -3, 19/10 | 27 | 0 | 1s | US$ 0,00 |
| `(not set)` | 26 | 1 | 2s | US$ 0,00 |
| Agentes afastados / Milton Leite, 17/10 | 25 | 12 | 40s | US$ 0,02 |
| Carta de pesquisadores britânicos, variante -2, 22/10 | 21 | 7 | 23s | US$ 0,03 |
| `/2026/05/22/governo-fixa-subvencao-da-gasolina-em-r-044-por-litro/` | 19 | 0 | 0s | US$ 0,00 |

A página inicial é a maior entrada individual, mas explica apenas **5,55% do Direct**. Não há uma única página que explique o volume inteiro. Existem visitas Direct com engajamento e receita, como Correios e monotrilho; eliminar todo o canal seria uma decisão inadequada.

**Próximo exame técnico:** comparar logs agregados da borda com GA4, por data, rota, país e classificação de automação disponível, e revisar tags/eventos e ferramentas de monitoramento. Esse cruzamento de logs ainda não foi realizado. Não é possível identificar a origem real ou validar tráfego inválido apenas pelo GA4.

## 4. Conciliação da receita AdSense

Mesmo hostname e período, dimensão **Método de posicionamento**:

| Método | Receita | Participação calculada | Impressões | RPM de impressões | Active View | Cliques |
|---|---:|---:|---:|---:|---:|---:|
| Automático | US$ 6,02 | 64,18% | 11.611 | US$ 0,52 | 86,57% | 156 |
| Manual | US$ 3,36 | 35,82% | 20.446 | US$ 0,16 | 46,11% | 74 |
| **Total do detalhamento** | **US$ 9,38** | **100%** | **32.057** | **US$ 0,29** | **60,70%** | **230** |

**A pendência de US$ 6,02 está resolvida:** corresponde aos anúncios automáticos. Houve diferença de uma impressão entre o detalhamento por método (32.057) e o relatório diário/site inicial (32.058). Preservamos ambos; a coleta não determinou a razão dessa diferença. Receita e cliques conciliam integralmente.

O bloco manual **Diário do Povo | Banner | Home** apresentou US$ 3,36 e 20.447 impressões no relatório por bloco. A diferença de uma impressão também aparece nessa comparação com Manual. Não recalcular ganhos a partir de RPM arredondado.

### Código reutilizado em posições diferentes

Na inspeção do DOM público servido em **26/10**, o código AdSense **9752337983** foi observado em:

- Matéria: `article_top`, `article_inread_1` e `article_footer`.
- Página inicial: `home_top_leaderboard` e `home_infeed_1`, posições presentes na renderização consultada.

O cliente carregado no anúncio superior foi **ca-pub-3839974827280107**. Outros elementos ainda aguardavam inicialização/carregamento; atributos vazios nesses elementos, isoladamente, não demonstram falha.

Assim, o nome do bloco **Banner | Home não significa que toda sua receita vem da home**. O mesmo código é reutilizado na matéria. O detalhamento do AdSense por esse código não permite separar topo, meio e rodapé. O mapeamento é atual, posterior ao período financeiro; não comprova que a configuração foi idêntica em cada dia dos 28 dias.

Para medir posições, será necessário identificá-las separadamente com uma configuração de mensuração apropriada, preservando a comparabilidade. O simples nome interno de um slot no CMS não cria automaticamente um detalhamento separado no AdSense.

**Ad Exchange e outros parceiros:** não foi obtido um relatório financeiro dessas fontes. A aba do Ad Manager foi localizada, mas não respondeu às duas tentativas de acesso nesta etapa. A conciliação acima explica o AdSense; não demonstra receita adicional nem ausência dela no Ad Manager.

## 5. Consulta openai — origem do pico

Search Console, Pesquisa Web, **consulta exata openai**, mesmo período. Total por consulta: **327.637 impressões, zero clique**, posição média exibida **3,2**.

### Páginas

| Caminho após `/2026/10/23/` | Impressões por página | Cliques |
|---|---:|---:|
| `openai-retoma-treinamento-de-modelos-sem-acesso-a-internet-4/` | 250.058 | 0 |
| `openai-retoma-treinamento-de-modelos-sem-acesso-a-internet-3/` | 70.593 | 0 |
| `openai-retoma-treinamento-de-modelos-sem-acesso-a-internet/` | 16.616 | 0 |
| `openai-retoma-treinamento-de-modelos-sem-acesso-a-internet-2/` | 59 | 0 |

Outras cinco páginas tiveram, individualmente, 6, 4, 2, 1 e 1 impressões. **As linhas por página não somam o total por propriedade/consulta**, porque representam outra agregação. Não somar essas linhas para substituir as 327.637 impressões do total por consulta.

### País, dispositivo e dia

| Recorte | Impressões | Cliques |
|---|---:|---:|
| Brasil | 327.634 | 0 |
| Portugal | 3 | 0 |
| Tablet | 223.761 | 0 |
| Computador | 103.449 | 0 |
| Celular | 427 | 0 |
| Dia 23/10 | 327.569 | 0 |
| Dia 24/10 | 54 | 0 |
| Dia 25/10 | 0 | 0 |

O dia 23/10 concentra **99,98% das impressões da consulta**. Tablets representam aproximadamente **68,3%**. Esse padrão de concentração e ausência de cliques justifica acompanhamento específico; não foi demonstrado se decorre de comportamento de usuários, ferramentas de consulta de SERP ou outra causa.

Não há base para atribuir esse fenômeno ao Direct internacional: aqui as impressões são quase integralmente do Brasil, e uma impressão na Pesquisa não é uma sessão no site. Não confundir as duas anomalias.

### Comparação das versões publicadas

Foram abertas as versões **sem sufixo, -3 e -4**. Nas três:

- Título: **OpenAI retoma treinamento de modelos sem acesso à internet**.
- Fonte indicada: o mesmo artigo de **O Globo**, com o mesmo link de origem.
- Tema e sequência factual muito semelhantes; redações diferentes, sem um propósito editorial distintivo identificado na leitura da amostra.
- Canônica aponta para a própria URL de cada variante.

Isso confirma **sobreposição editorial nesta família**, sem concluir duplicação literal byte a byte. A versão -2 foi identificada no GSC, mas seu conteúdo não foi inspecionado. Não houve remoção ou definição de qual versão deve prevalecer. Antes de consolidar, conferir o desempenho de todas as consultas dessas URLs, links recebidos, histórico e diferenças de conteúdo — zero clique em openai não significa zero clique em outras consultas.

## 6. RSS e proteção contra repetição

### Código local inspecionado

- `functions/index.ts`: POST `/api/n8n/posts` chama `createImportedPost`.
- `packages/core/db/imported-posts.ts`: remove espaços externos de `original_link`, procura correspondência exata já existente e reutiliza o primeiro ID. Na ausência de correspondência, cria uma matéria.
- `packages/core/db/posts.ts`: gera sufixos incrementais quando o slug já existe. Isso explica o mecanismo de criação de URLs numeradas, mas não determina a causa de cada colisão.
- `migrations/0015_add_original_link_to_posts.sql`: adiciona índice comum, **sem restrição UNIQUE** sobre `original_link`.
- O fluxo JSON local `n8n-rss-workflow.json` contém consulta por `original_link` e envio desse campo. Um arquivo local não comprova a configuração de todos os fluxos publicados.

**Limites verificados da proteção atual:** depende do preenchimento do link; a comparação é exata após trim, sem normalização de parâmetros/variantes; a sequência de consultar e inserir não é uma garantia atômica contra requisições simultâneas. Reutilizar um ID existente também não equivale a atualizar o conteúdo da matéria. São riscos de implementação identificados pela leitura, não prova de que causaram a família openai.

### Fluxo publicado observado

O conector listou **Economia | O GLOBO | Diário do Povo — corrigido** como ativo, criado em 26/10. A leitura de detalhes pelo conector foi recusada porque o fluxo não está disponível para acesso MCP. A inspeção continuou na aba autenticada, sem alterar permissões.

No editor desse fluxo publicado foram observadas as etapas:

```text
RSS Read → Prepare RSS → Check Duplicate → Select First New
→ AI Journalist → Parse AI → Recheck Before Publish
→ Confirm Still New → Create Post → Confirm Published
```

Os nomes e a presença dessas etapas foram confirmados. Os parâmetros completos, o comportamento de concorrência e o histórico de execuções de 23/10 não foram verificados nesta etapa. **Não se pode atribuir as publicações de 23/10 a esse fluxo criado em 26/10**, nem afirmar que a correção atual já provou eficácia ao longo do tempo.

### Encaminhamento técnico

Preparar uma chave estável de origem e persistência atômica antes de novas consolidações do acervo. A migração deve começar por levantamento de links repetidos e resolução dos conflitos existentes; aplicar UNIQUE diretamente sobre uma base não auditada pode falhar ou conflitar com atualizações legítimas. Definir separadamente: repetição do mesmo item, atualização da mesma notícia e nova cobertura sobre o mesmo assunto. Não usar apenas o título como chave de exclusão.

## 7. Protocolo de testes e primeiro marco

**Objetivo operacional proposto:** US$ 1/dia de AdSense sustentado. Critério proposto: média de pelo menos US$ 1/dia em **14 dias completos**, com pelo menos 10 dos 14 dias em US$ 1 ou mais. Esse critério é uma escolha operacional, não uma garantia estatística.

### Etapa A — observar as mudanças já publicadas

Janela proposta: **27/10 a 09/11/2026**, com fechamento a partir de 10/11, após verificar processamento. Excluir 26/10 por ser dia de implantação. Registrar diariamente receita AdSense, páginas, RPM calculado, métodos de posicionamento e dispositivo; no GA4, separar busca orgânica brasileira de Direct desktop e acompanhar os grupos anômalos.

As mudanças de 26/10 ocorreram juntas e o período anterior teve eleição. Uma comparação antes/depois será observacional e não isolará o efeito de cada mudança. Usar também medianas, distribuição diária e composição de canais; não declarar causalidade apenas porque a receita subiu.

### Etapa B — teste de anúncio

Primeiro identificar as posições separadamente; só então alterar **uma posição manual por teste**. Preservar os automáticos enquanto se testa o manual, pois eles geraram 64,18% da receita observada. Desfecho principal: receita total por mil páginas no mesmo dispositivo e grupo de páginas. Desfechos secundários: receita do manual, Active View, impressões e experiência de leitura.

Preferir grupos contemporâneos comparáveis com atribuição estável quando a instrumentação permitir. Com o volume atual, não definir vencedor em um ou dois dias. Definir duração e volume mínimo após conhecer a variabilidade da nova base; não há amostra suficiente nesta coleta para calcular o tamanho de teste necessário. Nenhum experimento foi lançado nesta etapa.

### Etapa C — piloto editorial

Produzir **dez conteúdos originais de serviço local em quatro semanas**, como hipótese de trabalho, com fontes verificáveis e utilidade recorrente. Escolher temas a partir de demanda observada e capacidade de apuração. Comparar com um grupo de conteúdos originais contemporâneos de esforço semelhante; registrar diferenças de distribuição e sazonalidade.

Avaliar após 7 e 28 dias por matéria: sessões Organic Search / Brasil, engajamento, receita e custo de produção. Usar receita GA4 apenas como atribuição por página e conciliar o total com AdSense. Não afirmar que esses temas têm RPM superior antes da medição, nem aumentar a quantidade diária de matérias apenas para alimentar anúncios.

## 8. Oferta comercial — rascunho para validação

**Produto piloto:** patrocínio identificado de uma série de serviço local, com presença em uma posição definida e mensurável. Prazo inicial de 30 dias. O patrocinador não escolhe conclusões editoriais nem recebe promessa de posição no Google.

**Base de audiência a apresentar:** o site registrou 40.394 visualizações GA4 no período, mas a audiência inclui Direct de qualidade ainda não esclarecida. Apresentar separadamente as **6.070 sessões Organic Search / Brasil**, sem chamá-las de usuários únicos ou de audiência exclusivamente piauiense. Confirmar localização mais específica antes de vender alcance local. Não usar 327.637 impressões de openai como visitas ao portal ou impressões publicitárias.

**Entregas propostas:** identificação clara do patrocínio, posição e prazo definidos, relatório de impressões publicitárias efetivamente medidas, cliques identificados por UTM e acompanhamento da série. Distribuição social/newsletter só integra a oferta quando houver canal, autorização e capacidade de entrega confirmados.

**Preço de teste para discussão interna:** hipótese de **US$ 150 líquidos por 30 dias**, equivalentes a US$ 5/dia, não um preço de mercado validado. Definir preço bruto, moeda de cobrança, impostos, produção e margem antes de propor ao anunciante. Não há proposta enviada nem receita contratada. Dez contratos desse valor seriam US$ 50/dia matematicamente, mas não há evidência de demanda ou inventário para prometer essa composição.

**Relatório ao patrocinador:** alcance efetivamente medido no espaço contratado, páginas e conteúdo entregues, cliques e eventuais conversões verificáveis. Descontar da receita incremental qualquer publicidade programática deslocada e os custos da entrega.

## 9. O que permanece pendente

| Item | Situação após esta etapa |
|---|---|
| Direct × dispositivo × país | Coletado, com concentração internacional no desktop confirmada |
| Direct × navegador e entrada | Coletado em tabelas separadas; não é uma análise conjunta de todas as dimensões por sessão |
| Receita AdSense por modalidade | Conciliada: US$ 6,02 automático + US$ 3,36 manual |
| Receita por posição física | Código reutilizado identificado; separação financeira por posição ainda não disponível |
| Receita Ad Manager/Ad Exchange | Sem relatório financeiro conciliado |
| Família openai | URLs, país, dispositivo e pico diário localizados; três conteúdos e canônicas inspecionados |
| Origem técnica das repetições | Riscos do código e etapas atuais registrados; histórico causador não comprovado |
| Tráfego automatizado | Hipótese reforçada pelo padrão; sem confirmação por logs ou outra evidência técnica |
| Ganho das alterações de 26/10 | Depende da janela posterior; não pode ser avaliado em 26/10 |
| Testes e venda direta | Protocolos e oferta preparados; ainda não executados nem contratados |

Arquivo interno de análise. Dados obtidos dos painéis autenticados, páginas públicas e código local. Não publicado nem enviado a terceiros.
