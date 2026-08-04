# Direção Editorial 2026

## Posicionamento

O Diário do Povo deve parecer um veículo regional estabelecido: confiável, próximo da comunidade e capaz de cobrir hard news, serviço, política, economia, cultura e opinião com a mesma clareza.

O desenho não compete com a notícia. Hierarquia, fotografia, títulos e contexto editorial determinam a composição. Cards, fundos e ornamentos são usados apenas quando cumprem uma função.

## Princípios

1. **A notícia vem primeiro.** A manchete principal recebe fotografia, contexto e espaço. Chamadas secundárias têm peso proporcionalmente menor.
2. **Hierarquia, não uniformidade.** Conteúdos não são apresentados como uma grade de peças equivalentes.
3. **Identidade institucional.** Azul profundo sustenta a marca; vermelho aparece apenas em urgência, editoria e conversão.
4. **Fotografia documental.** Imagens usam enquadramento natural, sem filtros, gradientes ou efeitos decorativos.
5. **Tipografia de jornal.** Georgia organiza manchetes e leitura longa; a pilha Inter/Segoe UI organiza navegação, metadados e controles.
6. **Separação editorial discreta.** Linhas finas e espaço em branco substituem caixas, sombras e bordas pesadas.
7. **Conteúdo real.** O layout nunca completa seções com artigos, autores ou dados fictícios.

## Estrutura

- **Cabeçalho:** faixa de edição, masthead azul de alta presença, marca central, assinatura e navegação de editorias.
- **Home:** manchete com foto, destaques secundários, análises, opinião real e blocos de editoria.
- **Editorias e tags:** lista vertical que permite comparar títulos, imagens e resumos com rapidez.
- **Artigo:** título amplo, linha fina de metadados, foto principal e coluna de leitura de 720 px.
- **Colunistas:** identidade do autor e publicação mais recente sem estética de rede social.
- **Assinatura e conta:** superfícies comerciais sóbrias, coerentes com a confiança da marca.

## Acessibilidade e desempenho

- foco visível e link para saltar ao conteúdo;
- alvos de toque com pelo menos 42–44 px;
- navegação mobile explícita;
- contraste alto e texto redimensionável;
- reserva de espaço para publicidade;
- `srcset`, lazy loading e preload da imagem principal;
- respeito a `prefers-reduced-motion`.

## Compatibilidade

O identificador recomendado no CMS é `editorial`. Durante a transição, instalações configuradas como `alltype_v2` também são direcionadas ao novo sistema, impedindo que o design rejeitado permaneça ativo em produção.

## Refinamento premium

A segunda iteração estudou a maturidade editorial de grandes jornais brasileiros sem reproduzir sua identidade. Foram incorporados o masthead institucional, a combinação entre serifas expressivas e navegação compacta, a faixa de valor da assinatura, a hierarquia modular e um trilho próprio para opinião. A home também possui um modo de manchete única para edições com pouco conteúdo, evitando colunas vazias ou preenchimento fictício.
