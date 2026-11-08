# Diário do Povo — diagnóstico de audiência e monetização

> **Atualização:** a coleta adicional conciliou a receita automática/manual, cruzou Direct com dispositivo e país e localizou as páginas da consulta openai. Consulte o [aprofundamento e plano operacional](./aprofundamento-audiencia-monetizacao-2026-10-26.md). As lacunas descritas abaixo refletem a coleta inicial; o novo documento registra o que foi resolvido e o que continua pendente.

Coleta realizada em 26/10/2026, diretamente nos painéis abertos no Chrome. Domínio analisado: **diario.dopovo.com.br**.

**Período principal:** 28/09/2026 a 25/10/2026, inclusive, 28 dias completos. **Comparação:** 31/08/2026 a 27/09/2026, inclusive, 28 dias.

## Resultado principal

O AdSense registrou **US$ 9,38 no período**, média de **US$ 0,335/dia**, em **31.512 visualizações de página**. O RPM calculado pelos totais é **US$ 0,2977**, apresentado como US$ 0,30 no painel. A referência anterior de US$ 0,39 não se confirma para este recorte.

A receita cresceu cerca de **399%** frente aos US$ 1,88 anteriores, principalmente pelo aumento de páginas monetizadas. Entretanto, alcançar US$ 50/dia exigiria aproximadamente **167.975 páginas/dia no AdSense**, mantendo esse RPM — cerca de **149 vezes** a média atual. A meta depende de crescer audiência qualificada e melhorar receita por página em conjunto.

O principal alerta de qualidade é a combinação de muito tráfego Direct com pouco engajamento e pouca receita. Organic Search representa 19,44% das sessões, mas aproximadamente 82,33% da receita registrada no GA4. Isso pede investigação de origem e medição do Direct; não comprova tráfego automatizado.

## Escopo, fontes e limitações

| Fonte | Recorte confirmado | Observação |
|---|---|---|
| AdSense | Filtro **Site: diario.dopovo.com.br**, datas explícitas | Não utiliza o total da conta nem o domínio agregado dopovo.com.br |
| GA4 | Propriedade 377197606; **Nome do host corresponde exatamente a diario.dopovo.com.br** | Filtro conferido nos relatórios de aquisição e páginas; exclui outros hosts da propriedade |
| Search Console | Propriedade de prefixo https://diario.dopovo.com.br/ | Pesquisa Web, Discover e Google Notícias separados |
| Indexação | Retrato disponível em 26/10; painel informa atualização em 22/10 | Não corresponde a um relatório histórico filtrado nos mesmos 28 dias |
| Sitemaps | Situação consultada em 26/10 | Páginas encontradas não equivalem a páginas indexadas |

Os dados foram transcritos das tabelas e cartões visíveis. A tentativa de exportação CSV do AdSense não disponibilizou um arquivo utilizável; este documento **não é uma exportação integral** dos três sistemas. Valores diários de receita e detalhamentos exibidos em centavos sofrem arredondamento; o total do relatório prevalece. O próprio AdSense alerta que os ganhos por site são estimativas indicativas.

As datas de calendário foram alinhadas. Os fusos de configuração dos painéis não foram auditados; não se presume equivalência exata de cada dia entre plataformas. O último dia pode receber ajustes de processamento. Receita estimada não é pagamento final. Não foi descontada comissão de parceiro, nem somada receita do Ad Manager/Ad Exchange que não foi conciliada nesta coleta.

## 1. AdSense — comparação do período

| Indicador | 28/09–25/10 | 31/08–27/09 | Variação |
|---|---:|---:|---:|
| Ganhos estimados | US$ 9,38 | US$ 1,88 | +398,94% |
| Visualizações de página | 31.512 | 7.159 | +340,17% |
| RPM de página, calculado pelos totais | US$ 0,2977 | US$ 0,2626 | +13,35% |
| Impressões | 32.058 | 7.136 | +349,24% |
| RPM de impressões, exibido | US$ 0,29 | US$ 0,26 | Valores arredondados |
| Impressões visíveis do Active View | 60,70% | 62,97% | −2,27 pontos percentuais |
| Cliques em anúncios | 230 | 65 | +253,85% |
| Receita média diária, calculada | US$ 0,335 | US$ 0,067 | +398,94% |

O crescimento de receita foi explicado sobretudo pelo volume: páginas aumentaram aproximadamente 4,40 vezes, enquanto o RPM aumentou aproximadamente 1,13 vez. Isso não estabelece causalidade com uma mudança técnica específica.

### Receita por dispositivo

| Dispositivo | Receita atual | Páginas atuais | RPM página exibido | Impressões | Active View | Cliques | Receita anterior | Páginas anteriores | RPM anterior |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Celulares — “Dispositivos móveis de última geração” | US$ 6,84 | 7.217 | US$ 0,95 | 19.720 | 58,56% | 203 | US$ 1,18 | 1.551 | US$ 0,76 |
| Computador | US$ 2,50 | 24.250 | US$ 0,10 | 12.214 | 63,99% | 25 | US$ 0,70 | 5.605 | US$ 0,12 |
| Tablets | US$ 0,03 | 43 | US$ 0,80 | 116 | 68,97% | 0 | US$ 0,00 | 3 | US$ 0,35 |
| Smart TV | US$ 0,00 | 2 | US$ 1,47 | 8 | 100,00% | 2 | Não exibido | Não exibido | Não exibido |

Valores pequenos podem exibir receita US$ 0,00 e RPM positivo porque o cálculo usa precisão superior a centavos. Os valores exibidos das linhas podem não somar exatamente o total.

**Leitura:** o computador concentra aproximadamente 77% das páginas do AdSense e tem RPM muito inferior ao celular. Investigar dispositivo em conjunto com origem, país, páginas acessadas, consentimento e carregamento de anúncios. Não atribuir a diferença apenas ao layout nem presumir que todo computador seja tráfego inválido.

### Bloco de anúncio identificado

| Bloco | Receita | Impressões | RPM de impressões | Active View | Cliques |
|---|---:|---:|---:|---:|---:|
| Diário do Povo \| Banner \| Home | US$ 3,36 | 20.447 | US$ 0,16 | 46,11% | 74 |

O relatório por bloco apresentou apenas essa linha e total de US$ 3,36. **Ele não reconcilia os US$ 9,38 do relatório por site.** Não se deve atribuir automaticamente a diferença de US$ 6,02 a anúncios automáticos sem confirmar o detalhamento correspondente. Também não se pode identificar cada posição física da página a partir de um nome de bloco: um mesmo código pode ser reutilizado em várias posições.

Prioridade: mapear códigos por posição e medir receita e visibilidade de cada um. O Active View do bloco, 46,11%, indica uma oportunidade de teste de posicionamento/carregamento; não garante aumento de receita de determinada magnitude. Cobertura de solicitações não foi coletada e não deve ser confundida com Active View.

## 2. Série diária — AdSense e Pesquisa Web

Receita, páginas, RPM, impressões publicitárias e cliques em anúncios vêm do AdSense. As duas últimas colunas vêm do Search Console, exclusivamente Pesquisa Web. Cliques em anúncio e cliques da Pesquisa são métricas diferentes.

| Data | Receita US$ | Páginas AdSense | RPM página US$ exibido | Impressões anúncios | Cliques anúncios | Cliques Pesquisa | Impressões Pesquisa |
|---|---:|---:|---:|---:|---:|---:|---:|
| 28/09 | 0,16 | 553 | 0,29 | 615 | 4 | 40 | 1.491 |
| 29/09 | 0,09 | 573 | 0,15 | 320 | 2 | 23 | 894 |
| 30/09 | 0,05 | 347 | 0,13 | 238 | 0 | 15 | 668 |
| 01/10 | 0,03 | 304 | 0,10 | 156 | 0 | 8 | 552 |
| 02/10 | 0,06 | 225 | 0,28 | 201 | 1 | 17 | 585 |
| 03/10 | 0,06 | 190 | 0,34 | 155 | 1 | 7 | 585 |
| 04/10 | 0,04 | 144 | 0,31 | 135 | 2 | 16 | 623 |
| 05/10 | 0,03 | 171 | 0,19 | 146 | 2 | 14 | 454 |
| 06/10 | 0,02 | 163 | 0,12 | 104 | 0 | 12 | 417 |
| 07/10 | 0,02 | 128 | 0,18 | 106 | 0 | 7 | 344 |
| 08/10 | 0,02 | 132 | 0,18 | 121 | 0 | 11 | 430 |
| 09/10 | 0,02 | 108 | 0,16 | 66 | 0 | 6 | 367 |
| 10/10 | 0,02 | 139 | 0,14 | 38 | 0 | 4 | 355 |
| 11/10 | 0,01 | 263 | 0,05 | 63 | 0 | 12 | 429 |
| 12/10 | 0,01 | 295 | 0,02 | 37 | 0 | 4 | 288 |
| 13/10 | 0,21 | 1.455 | 0,14 | 754 | 0 | 56 | 2.951 |
| 14/10 | 1,07 | 2.615 | 0,41 | 3.335 | 17 | 615 | 12.054 |
| 15/10 | 0,44 | 1.914 | 0,23 | 1.585 | 10 | 185 | 6.231 |
| 16/10 | 0,35 | 1.874 | 0,19 | 1.290 | 12 | 162 | 8.233 |
| 17/10 | 0,31 | 1.854 | 0,17 | 1.144 | 8 | 142 | 8.608 |
| 18/10 | 0,48 | 1.897 | 0,26 | 1.697 | 20 | 393 | 21.192 |
| 19/10 | 0,53 | 1.915 | 0,28 | 2.137 | 20 | 261 | 14.670 |
| 20/10 | 0,36 | 2.076 | 0,17 | 1.404 | 9 | 236 | 12.054 |
| 21/10 | 0,36 | 2.031 | 0,18 | 1.543 | 8 | 209 | 23.166 |
| 22/10 | 0,78 | 2.483 | 0,31 | 2.892 | 15 | 391 | 47.645 |
| 23/10 | 1,13 | 2.488 | 0,45 | 3.635 | 33 | 494 | 358.186 |
| 24/10 | 1,33 | 2.541 | 0,52 | 4.047 | 29 | 847 | 18.006 |
| 25/10 | 1,37 | 2.634 | 0,52 | 4.094 | 37 | 846 | 23.402 |
| **Total do período** | **9,38** | **31.512** | **0,2977 calculado** | **32.058** | **230** | **5.033** | **564.880** |

Os valores diários exibidos de receita somam US$ 9,36, diferença de US$ 0,02 frente ao total, por arredondamento da interface. Utilizar US$ 9,38 para os cálculos consolidados. Cliques e impressões da Pesquisa foram obtidos pela soma das 28 linhas, com maior precisão que os cartões “5,03 mil” e “565 mil”.

### Concentração e mudança de patamar

- A mediana das receitas diárias exibidas é aproximadamente **US$ 0,125**, inferior à média de US$ 0,335.
- Nos últimos sete dias, foram **16.168 páginas AdSense**, média de aproximadamente **2.310/dia**. A soma das receitas diárias arredondadas é aproximadamente **US$ 5,86**, ou **US$ 0,84/dia**; não é um novo total exato de relatório.
- Os dias 23–25 concentram aproximadamente **41% da receita** dos 28 dias e **33,6% dos cliques de Pesquisa**.
- Em 23/10 ocorreram **358.186 impressões de Pesquisa**, aproximadamente 63,4% do total, sem um aumento proporcional dos cliques.
- Há aceleração a partir de 13–14/10, além do movimento dos últimos dias. Não projetar o melhor dia como uma média permanente nem atribuir todo o crescimento apenas à eleição.

## 3. GA4 — audiência e engajamento

| Indicador | Atual | Anterior | Variação |
|---|---:|---:|---:|
| Usuários ativos | 32.028 | 7.321 | +337,48% |
| Sessões | 34.387 | 7.755 | +343,42% |
| Visualizações | 40.394 | 8.766 | +360,80% |
| Sessões engajadas | 9.185 | 1.993 | +360,86% |
| Taxa de engajamento | 26,71% | 25,70% | +1,01 ponto percentual |
| Tempo médio de engajamento por sessão | 6s | 8s | −27,26% na interface, calculado com precisão interna |
| Tempo médio de engajamento por usuário ativo | 6s | 9s | −26,27% na interface, calculado com precisão interna |
| Visualizações por usuário ativo | 1,26 | 1,20 | +5,33% |
| Eventos | 153.436 | 33.891 | +352,73% |
| Receita total registrada no GA4 | US$ 9,12 | US$ 1,82 | +402,54% na interface |

### Aquisição por grupo de canais da sessão

| Canal | Sessões atuais | Participação | Taxa engajamento | Tempo engajamento/sessão | Receita GA4 atual | Sessões anteriores | Receita GA4 anterior |
|---|---:|---:|---:|---:|---:|---:|---:|
| Direct | 26.570 | 77,27% | 16,39% | 1s | US$ 1,03 | 5.739 | US$ 0,17 |
| Organic Search | 6.686 | 19,44% | 65,39% | 25s | US$ 7,51 | 1.770 | US$ 1,50 |
| AI Assistant | 247 | 0,72% | 58,30% | 19s | US$ 0,30 | 59 | US$ 0,05 |
| Referral | 207 | 0,60% | 71,01% | 14s | US$ 0,10 | 57 | US$ 0,04 |
| Unassigned | 107 | 0,31% | 29,91% | 9s | US$ 0,12 | 47 | US$ 0,02 |
| Organic Social | 105 | 0,31% | 43,81% | 14s | US$ 0,07 | 26 | US$ 0,02 |
| Organic Video | 10 | 0,03% | 40,00% | 4s | US$ 0,00 | 66 | US$ 0,00 |

Podem ocorrer diferenças de centavos ao somar linhas arredondadas. Os valores de receita por canal pertencem ao GA4, não ao relatório financeiro do AdSense.

Organic Search gerou aproximadamente **US$ 1,12 por mil sessões** no GA4, contra **US$ 0,039** de Direct, diferença aproximada de 29 vezes. Trata-se de receita por sessões, **não de RPM de página**. Não é uma previsão de que trocar a origem de uma visita multiplicará sua receita dessa forma.

Investigar Direct por país, navegador, dispositivo, página de entrada e campanhas sem UTM. Verificar acessos internos, ferramentas de monitoramento, referências perdidas e automação. A classificação Direct, isoladamente, não identifica bots.

### Páginas mais vistas — GA4

Valores do período atual. O tempo é por usuário ativo, conforme o relatório Páginas e telas. Os títulos abreviam o caminho; links preservam a URL observada.

| Página | Visualizações | Usuários ativos | Tempo médio | Receita GA4 |
|---|---:|---:|---:|---:|
| [Página inicial](https://diario.dopovo.com.br/) | 1.777 | 1.628 | 5s | US$ 0,22 |
| [Guindaste e monotrilho — 24/10](https://diario.dopovo.com.br/2026/10/24/guindaste-cai-sobre-estrutura-do-monotrilho-na-zona-leste-de-sao-paulo/) | 632 | 503 | 23s | US$ 0,73 |
| [Mudança no TSE — 14/10](https://diario.dopovo.com.br/2026/10/14/mudanca-no-tse-reforca-ala-lulista-e-isola-kassio-e-mendonca/) | 512 | 469 | 36s | US$ 0,72 |
| [Votação no Japão — 25/10](https://diario.dopovo.com.br/2026/10/25/votacao-de-brasileiros-no-japao-e-encerrada-no-segundo-turno/) | 367 | 344 | 22s | US$ 0,46 |
| [Mudanças na Bluefit — 23/10](https://diario.dopovo.com.br/2026/10/23/mudancas-atingem-comando-da-bluefit/) | 198 | 183 | 14s | US$ 0,31 |
| [Sobreviventes e tubarões — 18/10](https://diario.dopovo.com.br/2026/10/18/tubaroes-ferem-sobreviventes-de-barco-virado-na-baixa-california/) | 136 | 125 | 36s | US$ 0,15 |
| [Votação na Nova Zelândia — 25/10](https://diario.dopovo.com.br/2026/10/25/nova-zelandia-encerra-votacao-do-segundo-turno-2/) | 129 | 120 | 16s | US$ 0,16 |
| [Lula e abertura de sigilos — 19/10](https://diario.dopovo.com.br/2026/10/19/lula-propoe-a-flavio-abertura-de-sigilos-bancario-e-telefonico/) | 125 | 113 | 24s | US$ 0,12 |
| [Correios e Pinheiro Neto — 23/10](https://diario.dopovo.com.br/2026/10/23/correios-firmam-contrato-de-r-7097-milhoes-com-pinheiro-neto/) | 114 | 83 | 24s | US$ 0,17 |
| [Viaduto da China — 23/10](https://diario.dopovo.com.br/2026/10/23/troca-de-tiros-deixa-um-morto-e-um-ferido-no-viaduto-da-china-em-sp-3/) | 106 | 100 | 19s | US$ 0,11 |

A página inicial tinha 387 visualizações, 315 usuários ativos, 19s e US$ 0,13 no período anterior. As nove notícias seguintes tiveram zero no período anterior por serem páginas publicadas no período atual; não interpretar comparação com base zero como ganho percentual editorial.

A amostra demonstra tração em política, eleições, acontecimentos e empresas. Não demonstra ainda que algum desses temas mantém tráfego recorrente por meses ou oferece RPM consistentemente maior. Essa conclusão exige agrupamento de páginas por tema e coorte de publicação, incluindo conteúdos antigos.

## 4. Search Console — Pesquisa Web

| Indicador | Atual | Anterior | Leitura |
|---|---:|---:|---|
| Cliques | **5.033**, soma dos dias | 1,21 mil, cartão arredondado | Aproximadamente 4,2 vezes o anterior |
| Impressões | **564.880**, soma dos dias | 57,9 mil, cartão arredondado | Aproximadamente 9,8 vezes o anterior |
| CTR | 0,9% exibido; 0,891% pelos totais | 2,1% exibido | Queda influenciada pela composição das consultas |
| Posição média | 4,6 | 8,9 | Melhora agregada; não equivale à posição fixa das páginas |

### Consultas com mais cliques

| Consulta | Cliques atuais | Cliques anteriores | Impressões atuais | Impressões anteriores |
|---|---:|---:|---:|---:|
| troca no tse fortalece ala lulista e isola kassio e andré mendonça | 240 | 0 | 398 | 0 |
| votacao japao | 69 | 0 | 784 | 0 |
| votacao nova zelandia | 64 | 0 | 507 | 0 |
| nova zelandia votacao | 63 | 0 | 613 | 0 |
| acidente monotrilho | 61 | 0 | 784 | 0 |
| flavio bolsonaro caso ana clara | 52 | 0 | 5.053 | 0 |
| as previsões de alcolumbre em almoço com alexandre de moraes e aliados em brasília | 42 | 0 | 165 | 0 |
| troca no tse | 40 | 0 | 2.049 | 0 |
| bluefit | 40 | 0 | 1.021 | 0 |
| botafogo | 35 | 63 | 4.127 | 1.280 |

**Anomalia relevante:** ao ordenar consultas por impressões, “openai” apareceu com **327.637 impressões e zero clique**, contra 2.776 impressões e 12 cliques antes. Essa consulta sozinha equivale a aproximadamente **58% das impressões agregadas** do período. A comparação serve para mostrar concentração; totais por consulta podem diferir dos totais agregados do GSC, inclusive por privacidade e agregação.

Não concluir que o CTR global baixo se resolve apenas reescrevendo títulos. Primeiro abrir “openai” e cruzar página, país, dispositivo e data para entender relevância e apresentação do resultado. Não foi identificada nesta coleta a URL responsável por essa exposição.

### Páginas com mais cliques na Pesquisa

| Página, identificada pelo tema e data | Cliques | Impressões | CTR calculado |
|---|---:|---:|---:|
| Guindaste e monotrilho — 24/10 | 444 | 6.845 | 6,49% |
| Mudança no TSE — 14/10 | 439 | 2.980 | 14,73% |
| Votação no Japão — 25/10 | 334 | 4.064 | 8,22% |
| Mudanças na Bluefit — 23/10 | 181 | 1.442 | 12,55% |
| Nova Zelândia, URL terminada em segundo-turno-2 — 25/10 | 122 | 1.077 | 11,33% |
| Sobreviventes e tubarões — 18/10 | 110 | 741 | 14,84% |
| Viaduto da China, URL terminada em sp-3 — 23/10 | 103 | 1.876 | 5,49% |
| Lula e abertura de sigilos — 19/10 | 102 | 9.315 | 1,10% |
| McDonald’s muda compra de carne no Brasil — 19/10 | 84 | 270 | 31,11% |
| Nova Zelândia, URL terminada em segundo-turno-presidencial-2 — 25/10 | 73 | 754 | 9,68% |

Todas essas dez páginas apresentaram zero clique e zero impressão no período anterior. Os links das páginas comuns ao GA4 estão na seção anterior. As duas páginas de Nova Zelândia merecem comparação de conteúdo e intenção de busca para avaliar sobreposição; sem essa verificação, não se recomenda redirecionar ou excluir URLs.

### Discover e Google Notícias

| Relatório | Cliques atuais | Impressões atuais | CTR atual | Cliques anteriores | Impressões anteriores | CTR anterior |
|---|---:|---:|---:|---:|---:|---:|
| Discover | 0 | 8 | 0% | 0 | 0 | 0% exibido; sem base de impressões |
| Google Notícias | 71 | 8,67 mil | 0,8% | 5 | 1,38 mil | 0,4% |

Discover ainda não constitui fonte material de tráfego neste período. Google Notícias cresceu, mas a base é pequena. Não misturar esses números com Pesquisa Web, nem somar canais do GA4 a cliques do GSC.

## 5. Indexação e sitemaps

O painel de indexação informa atualização em **22/10/2026**: **16,1 mil páginas indexadas** e **47,4 mil não indexadas**, valores arredondados. Os motivos detalhados são:

| Motivo | URLs | Prioridade de investigação |
|---|---:|---|
| Rastreada, mas não indexada no momento | 24.087 | Alta: qualidade, sobreposição, canônica, conteúdo e links internos |
| Detectada, mas não indexada no momento | 22.693 | Alta: descoberta versus rastreamento, duplicação e relevância das URLs |
| Cópia sem página canônica selecionada pelo usuário | 288 | Revisar grupos e escolher URL preferida quando aplicável |
| Página alternativa com tag canônica adequada | 183 | Pode ser comportamento desejado; validar intenção |
| Excluída pela tag noindex | 63 | Verificar se a exclusão foi intencional |
| Erro soft 404 | 59 | Investigar páginas vazias, removidas ou respostas inadequadas |
| Erro no servidor, 5xx | 21 | Alta se afeta páginas válidas e o erro ainda ocorre |
| Bloqueada por acesso proibido, 403 | 12 | Alta se o bloqueio de páginas válidas é involuntário |

Os dois primeiros motivos somam **46.780 URLs**, aproximadamente 98,7% das 47.406 URLs dos oito motivos. Eles não significam, por si só, erro técnico ou obrigação de indexar tudo.

### Exemplos observados em “Rastreada, mas não indexada”

- `/2026/10/25/pedro-emanuel-destaca-marino-apos-virada-do-vasco-sobre-o-corinthians-2/`
- `/2026/10/25/tre-ce-altera-nove-locais-de-votacao-para-o-segundo-turno-3/`
- `/2026/10/25/lula-fala-a-apoiadores-da-janela-de-casa-em-sao-paulo-3/`
- `/2026/10/24/cbf-confirma-classico-entre-vasco-e-flamengo-no-nilton-santos-5/`
- `/2026/10/24/japao-cria-equipe-para-simular-ataques-ciberneticos-com-inteligencia-artificial-19/`

O relatório mostrava exemplos com datas de rastreamento até 25/10, apesar do cabeçalho de atualização em 22/10. Preservamos as duas informações como apresentadas pela interface. Os sufixos são sinais para investigar variantes repetidas; não demonstram duplicidade de conteúdo sem comparar as páginas.

### Sitemaps consultados em 26/10

| Sitemap | Status | Última leitura | Páginas encontradas |
|---|---|---|---:|
| /sitemap.xml | Processado | 26/10/2026 | 56.480 |
| /sitemap-index.xml | Processado | 26/10/2026 | 56.480 |
| /sitemap-news.xml | Processado | 26/10/2026 | 1.000 |
| /sitemap/archive/2026/02.xml | Processado | 26/10/2026 | 1.862 |

Os totais se sobrepõem e não devem ser somados. Status processado confirma leitura, não indexação nem validade editorial de todas as URLs. Não há evidência nesta tela de que reenviar os mesmos índices aumentará receita. A prioridade passa a ser a qualidade e a seleção das URLs, acompanhando os relatórios após o processamento.

## 6. Distância até US$ 50/dia

Fórmulas utilizadas:

```text
RPM AdSense = receita AdSense / páginas AdSense × 1.000
Receita diária = 9,38 / 28 = US$ 0,335
Páginas diárias atuais = 31.512 / 28 = 1.125,43
Distância diária = 50 − 0,335 = US$ 49,665
Páginas/dia para a meta = 50 / 0,29766438 × 1.000 = 167.974,41
Crescimento necessário = 167.974,41 / 1.125,43 − 1 = 14.825,37%
```

Arredondando para páginas inteiras suficientes, seriam **167.975 páginas por dia**. A meta equivale a US$ 1.400 em 28 dias; faltam US$ 1.390,62 em relação ao período observado. Com o volume atual, seria necessário RPM de aproximadamente **US$ 44,43**, sem evidência de viabilidade neste inventário.

### Cenários matemáticos, não previsões

Todos os volumes abaixo usam o denominador de páginas do AdSense. Os RPMs alternativos são hipóteses para dimensionamento, não benchmarks prometidos para o Diário.

| RPM de página assumido | Páginas/dia para US$ 50 | Múltiplo da média atual |
|---|---:|---:|
| US$ 0,2977, atual pelos totais | 167.975 | 149,25× |
| US$ 0,50 | 100.000 | 88,86× |
| US$ 1,00 | 50.000 | 44,43× |
| US$ 2,00 | 25.000 | 22,21× |
| US$ 3,00 | 16.667 | 14,81× |
| US$ 5,00 | 10.000 | 8,89× |

Exemplo de composição comercial: **10.000 páginas/dia × RPM US$ 2 = US$ 20/dia** de publicidade programática, mais **US$ 900 líquidos de patrocínio por mês de 30 dias = US$ 30/dia**, totalizando US$ 50/dia. É apenas uma hipótese de oferta, venda, custos e entrega; não há contratos dessa receita comprovados nesta coleta. Se a venda direta substituir impressões programáticas, descontar a receita deslocada para evitar dupla contagem.

### Denominadores preservados

O GA4 registrou 40.394 visualizações, enquanto o AdSense registrou 31.512 páginas. Essa diferença **não é uma taxa de cobertura de anúncios**, nem prova que 8.882 páginas perderam monetização. As plataformas têm regras e limitações de medição diferentes.

Dividir US$ 9,38 pelas 40.394 visualizações produz aproximadamente **US$ 0,232 por mil visualizações GA4**, uma métrica cruzada distinta do RPM AdSense de US$ 0,2977. A receita própria do GA4, US$ 9,12, também difere do AdSense e não deve ser somada a ele.

## 7. Prioridades para avançar

| Ordem | Ação | Evidência e objetivo | Como verificar |
|---|---|---|---|
| 1 | Investigar Direct e desktop | 77,27% das sessões são Direct, com 1s de engajamento; desktop tem RPM US$ 0,10 | Cruzar país, dispositivo, navegador, página de entrada e origem; validar tags, campanhas e acessos internos |
| 2 | Conciliar inventário e receita | Relatório por bloco mostra US$ 3,36 versus US$ 9,38 por site | Separar modalidades de posicionamento, identificar códigos e mapear posições; conferir consentimento e cobertura |
| 3 | Testar visibilidade dos anúncios | Bloco manual com Active View de 46,11% | Testes controlados por dispositivo; comparar receita por mil páginas e experiência, sem buscar cliques artificiais |
| 4 | Tratar duplicação e páginas de baixo valor | 46.780 URLs rastreadas/detectadas sem indexação; variantes numeradas na amostra | Auditar grupos, canônicas, conteúdo original e links; corrigir causas antes de excluir ou redirecionar |
| 5 | Investigar a consulta openai | 327.637 impressões sem clique | Abrir consulta e cruzar URL, país, dispositivo e dia; só depois decidir ação editorial/técnica |
| 6 | Consolidar audiência de busca | Organic Search entrega aproximadamente 82% da receita GA4 com 19% das sessões | Acompanhar páginas e temas por receita, engajamento e cliques durante várias semanas |
| 7 | Testar conteúdo de serviço com recorrência | Top atual concentrado em notícias e eleição, sem prova de cauda longa | Pequeno piloto de conteúdo original local: serviços, empregos/concursos, negócios e utilidade; validar demanda e retorno antes de escalar |
| 8 | Construir oferta comercial direta | A meta exige grande salto de escala mesmo com RPM maior | Definir público verificável, inventário, preço líquido e entrega; medir receita incremental e custos |

Não há base para prescrever um número de matérias por dia. Mais publicações só ajudam se produzirem páginas úteis, distribuídas e monetizadas. Acompanhar **receita e sessões qualificadas por matéria após 7 e 28 dias**, em vez de medir apenas quantidade publicada. Nichos são hipóteses editoriais a testar; esta amostra não comprova RPM por nicho.

As alterações técnicas de anúncios e sitemaps realizadas em 26/10 são posteriores ao encerramento deste período. Portanto, os números acima servem como referência anterior às alterações; não demonstram retorno financeiro delas.

## 8. Dados ainda não fechados

- Série diária do GA4 de usuários, sessões e visualizações: não foi extraída em tabela; a evolução diária deste documento combina AdSense e Pesquisa Web.
- Série diária completa dos 28 dias anteriores: totais comparativos coletados, sem transcrição diária integral.
- Receita por modalidade de posicionamento, cobertura e inventário físico completo: ainda não conciliados com o total por site.
- Cruzamento de Direct com país/dispositivo e análise de tráfego automatizado: necessário para explicar a baixa monetização, sem diagnóstico conclusivo nesta coleta.
- URL e contexto responsáveis pelas impressões de “openai”: ainda não identificados.
- Receita líquida de parceiros, Ad Manager/Ad Exchange, contratos diretos e custos: não coletados. Não é possível afirmar receita total de todas as fontes do portal nem lucro.
- Comparação histórica de indexação e avaliação individual de exclusões: o painel atual fornece um retrato e uma amostra, não uma auditoria de cada URL.

## Links para reproduzir a consulta

- [AdSense: relatório diário atual, filtrado pelo hostname](https://adsense.google.com/adsense/u/0/pub-3839974827280107/reporting/?d=20260928-20261025&ag=date&dd=1YsiteY1Ydiario.dopovo.com.brYdiario.dopovo.com.br&gm=earnings&m=earnings%2CpageViews%2CpageViewsRpm%2CmonetizableImpressions%2CmonetizableImpressionsRpm%2CactiveViewViewability%2Cclicks&oc=date&oo=ascending&ct=td)
- [GA4: propriedade do Diário](https://analytics.google.com/analytics/web/#/a268888638p377197606/reports/reportinghub) — reaplicar/conferir período, comparação e filtro exato de hostname ao trocar de relatório.
- [Search Console: Pesquisa Web com comparação de períodos](https://search.google.com/search-console/performance/search-analytics?resource_id=https%3A%2F%2Fdiario.dopovo.com.br%2F&start_date=20260928&end_date=20261025&compare_start_date=20260831&compare_end_date=20260927)
- [Indexação de páginas](https://search.google.com/search-console/index?resource_id=https%3A%2F%2Fdiario.dopovo.com.br%2F)
- [Sitemaps](https://search.google.com/search-console/sitemaps?resource_id=https%3A%2F%2Fdiario.dopovo.com.br%2F)

Os links exigem acesso autorizado às respectivas contas. Este arquivo contém dados internos de audiência e receita; foi salvo localmente, sem publicação ou envio a terceiros.
