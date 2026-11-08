# Queda na Pesquisa — verificação de 06/11/2026

Propriedade: `https://diario.dopovo.com.br/`. Pesquisa Web, apresentada na interface como “Web (texto)”. Comparação de sete dias completos: **29/10 a 04/11**, contra **22/10 a 28/10**. Foram mantidos os mesmos dias da semana; 05 e 06/11 ficaram fora desta comparação. Dados transcritos dos painéis autenticados; cartões arredondados.

## Resultado

A queda de cliques foi confirmada. A amostra indica forte dependência de notícias pontuais que deixam de atrair buscas, com ganhos de novas matérias insuficientes para repor os picos anteriores. Não foi comprovada uma causa única, punição algorítmica ou perda generalizada de indexação.

| Indicador | 22–28/10 | 29/10–04/11 | Leitura |
|---|---:|---:|---|
| Cliques | 4,09 mil | 2,61 mil | Queda aproximada de 36,2% |
| Impressões | 603 mil | 131 mil | Queda aproximada de 78,3% |
| CTR | 0,7% | 2,0% | Aumentou |
| Posição média | 3,9 | 5,4 | Piorou no agregado; mistura de consultas e páginas mudou |

Não interpretar a posição agregada como queda uniforme de todas as páginas, nem usar a queda das impressões como equivalente à queda de leitores.

## Pico de openai distorce as impressões

Aplicado filtro de **consulta exata openai** nos mesmos períodos:

| Indicador | 22–28/10 | 29/10–04/11 |
|---|---:|---:|
| Impressões | 405 mil | 24,1 mil |
| Cliques | 0 | 0 |
| CTR | 0% | 0% |
| Posição média | 3,0 | 3,4 |

A redução dessa consulta corresponde a aproximadamente **381 mil impressões**, cerca de **81% da redução agregada de 472 mil**, calculadas a partir de cartões arredondados. É uma decomposição aproximada dos indicadores, sem prova da causa do pico. Como não houve clique nessa consulta em nenhuma das semanas, ela **não explica a perda de cliques**.

## Maiores perdas por página

Ordenação da tabela por diferença de cliques, da maior perda para a menor:

| Matéria | Cliques antes | Cliques depois | Diferença |
|---|---:|---:|---:|
| Guindaste / monotrilho, 24/10 | 444 | 0 | −444 |
| Votação no Japão, 25/10 | 334 | 0 | −334 |
| Mudanças na Bluefit, 23/10 | 197 | 3 | −194 |
| Nova Zelândia, variante segundo-turno-2, 25/10 | 122 | 0 | −122 |
| 30e / sede da Bayer, 27/10 | 150 | 39 | −111 |
| Viaduto da China, variante sp-3, 23/10 | 105 | 0 | −105 |
| Camila Kfouri, 27/10 | 92 | 0 | −92 |
| Petróleo / subsídios e diesel, 26/10 | 86 | 0 | −86 |
| Nova Zelândia, variante segundo-turno-presidencial-2, 25/10 | 73 | 0 | −73 |
| Golpe de residência em Portugal, 28/10 | 95 | 29 | −66 |

As dez perdas somam 1.627 cliques. Outras páginas ganharam cliques; portanto, essa soma não é a perda líquida do site nem uma estimativa de todas as perdas brutas. A natureza pontual desses assuntos é compatível com perda de atualidade/demanda, mas não elimina mudanças de posição ou problemas individuais. Verificar consultas e posição de cada família antes de atribuir causalidade.

## Páginas com mais cliques na semana recente

| Matéria | Cliques recentes | Impressões recentes |
|---|---:|---:|
| Mega-Sena / prêmio de R$ 42 milhões, 01/11 | 768 | 6.265 |
| Binance / possível ataque, 29/10 | 92 | 8.847 |
| Axia / disputa no STJ, 30/10 | 56 | 166 |
| Painel de LED em Campo Maior, 29/10 | 50 | 715 |
| Previsão de novo CNU, 30/10 | 45 | 565 |
| Convocação de profissionais da saúde em Teresina, 29/10 | 40 | 362 |
| 30e / sede da Bayer, 27/10 | 39 | 358 |
| Último sorteio da Mega-Semana, 30/10 | 39 | 2.037 |
| Resgate de marinheiro e cachorro, 02/11 | 38 | 394 |
| Luiz Henrique / Flamengo, 01/11 | 37 | 1.037 |

A página de Mega-Sena concentra aproximadamente **29,4% dos cliques recentes**. As páginas novas demonstram capacidade de conquistar buscas, mas não provam estabilidade de audiência ou ausência de problemas em outras partes do site. Tampouco justificam concentrar toda a produção em loterias a partir de uma semana.

## Indexação e ação manual

- Ações manuais: **“Nenhum problema foi detectado”**. Isso não exclui efeitos algorítmicos.
- Indexação: a tela consultada ainda informa **última atualização em 22/10/2026**, 16,1 mil indexadas e 47,4 mil não indexadas, com 24.087 rastreadas sem indexação e 22.693 detectadas sem indexação.
- Como o retrato antecede as duas semanas comparadas, **não permite confirmar evolução da indexação da produção nova ou desindexação recente**. Não tratar esses totais como atualizados em 06/11.

## Mudanças recentes e limites da análise

Os documentos do projeto registram melhorias de sitemaps em 26/10 e correções de renderização móvel em 04/11, com melhora laboratorial na amostra. Melhoras técnicas não garantem crescimento de cliques. O resultado laboratorial não representa aprovação imediata dos dados de campo.

`docs/rss-politica-lote-10.md` registra ampliação do fluxo de Política para até dez inéditas por rodada, ativada em **06/11**. Essa alteração ocorreu depois da janela medida e **não pode explicar a queda de 29/10 a 04/11**.

Não foi contado o volume publicado por dia nem calculada a proporção de notícias novas indexadas nesta etapa. Logo, não há base para afirmar que “publicar mais causou a queda”. O que está demonstrado é que o aumento de produção relatado não assegurou a reposição dos cliques perdidos pelas notícias anteriores.

## Prioridade editorial e técnica proposta

1. **Controlar o rendimento por publicação.** Comparar grupos de matérias pela data de publicação e medir cliques por URL após 2, 7 e 28 dias. Separar assuntos pontuais de conteúdos com demanda recorrente.
2. **Investigar uma amostra de novas matérias sem cliques.** Usar Inspeção de URL para separar: desconhecida, não rastreada, rastreada sem indexação, canônica diferente ou indexada sem demanda/desempenho. A Inspeção de URL dessas amostras ainda não foi realizada.
3. **Priorizar valor adicional e manutenção do acervo.** Reescritas de RSS e maior frequência não são, por si, vantagem editorial demonstrada. Atualizar conteúdos existentes quando o assunto e a intenção forem os mesmos; revisar sobreposição antes de criar novas URLs.
4. **Criar recorrência a partir da demanda observada.** Saúde/empregos de Teresina e CNU são candidatos a um piloto com fonte oficial, acompanhamento e atualização. Escolher a escala pelos resultados e capacidade de apuração, não por uma quota fixa de matérias.
5. **Preservar o acervo durante a investigação.** Não excluir em massa, mudar canônicas ou fazer redirecionamentos apenas porque uma notícia parou de receber cliques. Não há plano de consolidação individual validado nesta etapa.

A recomendação anterior de seis entregas diárias era um desenho de piloto, **não um volume comprovado para crescer**. O próximo critério deve ser o ganho de cliques úteis por grupo de publicações e sua persistência.

Referência metodológica: [orientação oficial do Google para investigar quedas de tráfego](https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops?hl=pt-br). Recomenda comparar períodos, páginas, consultas e tipos de pesquisa antes de concluir a causa.

[Comparação no Search Console](https://search.google.com/search-console/performance/search-analytics?resource_id=https%3A%2F%2Fdiario.dopovo.com.br%2F&start_date=20261029&end_date=20261104&compare_start_date=20261022&compare_end_date=20261028&breakdown=page)

Relatório local interno. Nenhuma configuração de produção foi alterada nesta verificação.
