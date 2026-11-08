# PRD — Diário do Povo

**Versão 1.0 · Retrato de produção em 8 de novembro de 2026 · Horários de Fortaleza**

## 1. Produto e objetivos

O Diário do Povo é um jornal digital com identidade piauiense e cobertura regional, nacional e internacional. Reúne notícias, opinião, serviços ao leitor e conteúdo permanente. Uma redação opera o portal por um CMS próprio, com automações que coletam fontes, auxiliam a produção, publicam conforme a política de cada fluxo e distribuem conteúdo.

| Objetivo | Resultado esperado |
|---|---|
| Acompanhar o que acontece | O leitor encontra cobertura recente pela capa, busca, editorias e últimas notícias. |
| Aprofundar a leitura | Cada notícia pode levar a uma explicação complementar, a um guia ou a outra matéria recente. |
| Criar hábito | Meu dia, agenda cultural e Extra! Extra! dão motivos distintos para voltar ao portal. |
| Ganhar escala editorial | A redação combina publicação manual e automação com fontes rastreáveis, controles de duplicidade e revisão onde exigida. |
| Sustentar a operação | Publicidade, assinatura e canais próprios apoiam distribuição e receita. Cache, limites de processamento e reaproveitamento de pesquisas ajudam a controlar custo. |

**Públicos.** Leitores do Piauí e de outros estados, leitores de busca e redes sociais, assinantes, organizadores culturais, jornalistas, editores, direção e administradores técnicos.

**Como ler o status.** “Em produção” tem evidência pública, registro de implantação ou validação operacional. “Ativo” indica workflow publicado e habilitado no n8n, conforme a consulta desta data. “Implementado” indica capacidade no código ou no CMS cuja configuração e operação ponta a ponta não foram reconfirmadas. O inventário cobre a plataforma, seus módulos e os fluxos ativos visíveis à integração n8n.

## 2. Experiência do leitor

| Área | Comportamento e requisitos atuais |
|---|---|
| Capa e navegação | Capa editorial com manchetes, destaques e editorias, além de Últimas Notícias, Opinião, colunas e autores. O menu público reúne editorias, Meu dia, Guias e Extra! Extra! em diferentes páginas. A busca interna por títulos começa pelos últimos 10 dias e permite selecionar um mês do ano atual ou do anterior. A lupa no cabeçalho editorial e o menu hambúrguer levam ao formulário da página dedicada. |
| Notícia | Exibe autoria, datas, conteúdo, imagem e elementos de continuação. Acima do primeiro parágrafo, a barra reúne ajuste de tamanho do texto, botão de salvar e acesso às matérias salvas. Preferências e favoritos ficam no navegador, assim como o ponto de retomada quando habilitado. Há blocos editoriais para complementar e aprofundar o tema, além de links internos. A consulta de recomendações usa uma janela móvel de 24 horas e prioriza vínculos explícitos elegíveis. Coberturas ao vivo têm atualizações próprias. |
| Mais vistas no Instagram | A página de notícia pode mostrar um ranking de matérias vinculadas a publicações no Instagram, com cache em KV. A classificação representa a popularidade nesse canal. |
| Meu dia | Abre com edição nacional e permite acrescentar um estado por escolha explícita. A preferência fica no navegador. O leitor vê o essencial, mudanças, oportunidades e assuntos para acompanhar, com fontes e validade quando aplicável. Itens vencidos saem da edição. Marcadores de abertura ficam no aparelho. |
| Agenda cultural | Teresina é a primeira praça. A agenda mostra programação confirmada, data, local, preço quando informado, fonte e ações como salvar no calendário. Organizadores podem sugerir eventos. A redação confere e decide antes de tornar a sugestão pública. O contato do organizador fica restrito ao processo de moderação. |
| Guias do Diário | Biblioteca evergreen com URLs permanentes, fontes, autoria e revisão editorial obrigatória. Guias e notícias podem se vincular em ambos os sentidos. A biblioteca é pública. Cada guia depende de aprovação para aparecer. |
| Extra! Extra! | Jogo do entregador de jornal em bicicleta, com pulo, entrega, pontuação e pausa. Tem controles de teclado e toque, recorde local e compartilhamento acionado pelo leitor. O jogo roda no navegador com Canvas. |
| Relacionamento e conta | A oferta de assinatura e a entrada na conta são públicas. O portal implementa cadastro, autenticação, planos e acesso a conteúdo premium. Há cadastro para newsletter e uma página para encaminhar ao canal de WhatsApp. |

**Rotas públicas.** [Portal](https://diario.dopovo.com.br/), [Busca](https://diario.dopovo.com.br/busca), [Meu dia](https://diario.dopovo.com.br/meu-dia), [Guias](https://diario.dopovo.com.br/guias), [Extra! Extra!](https://diario.dopovo.com.br/jogos/extra-extra) e [Assinatura](https://diario.dopovo.com.br/assinar).

## 3. Jornada da redação

1. **Entrar e acompanhar.** A redação vê no painel o total de notícias publicadas no dia editorial e acessa matérias, mídia, usuários, guias, agenda, integrações e filas.
2. **Captar pautas.** A entrada pode ser manual, via formulário n8n incorporado no CMS, RSS de editorias, Google Trends, fonte cadastrada no NewsExtractor ou sugestão de organizador.
3. **Produzir e revisar.** O CMS oferece edição visual com TipTap, suporte a Markdown e HTML, prévia, salvamento automático e histórico. A redação gerencia título, autoria, editoria, tags, mídia, metadados, destaques e vínculos. Cada automação tem sua regra de validação e liberação.
4. **Publicar ou agendar.** A matéria pode seguir por publicação imediata, agendamento, arquivo ou revisão. O agendador consulta pendências a cada minuto. O CMS também gerencia capa, seções, colunas e coberturas ao vivo.
5. **Distribuir e acompanhar.** Instagram, newsletter, WhatsApp e SEO têm superfícies próprias de operação. A redação pode consultar fila, histórico e estados conforme o canal.

**Ferramentas especializadas.** A central Meu dia e Agenda permite ajustar a edição, cadastrar, destacar ou cancelar eventos e moderar sugestões. Alterações humanas em eventos podem proteger registros de sobrescrita automática. O NewsExtractor permite cadastrar RSS ou URL individual, inspecionar itens, pedir atualização, repetir comandos e desativar fontes com confirmação. A desativação retira a fonte da coleta futura e do RSS agregado, preservando registros e matérias anteriores. O código também contém Redação IA com fontes, radar, briefing, materiais, triagem, rascunho, copidesque e checagem, além de Estúdio de Vídeo IA com geração, revisão e exportação de roteiros.

## 4. Automação editorial em operação

| Frente | Entrada, saída e regra de publicação |
|---|---|
| RSS de editorias | Workflows ativos para Política, Economia, Esporte, Mundo, Piauí e Tecnologia, com fontes identificadas como O Globo e G1. Em Política, o feed fornece o texto, a IA reescreve cada notícia separadamente, e o fluxo publica até dez inéditas por rodada de 15 minutos após validação e deduplicação. Esse limite é específico de Política. |
| Google Trends | O RSS oficial Brasil é a fonte de pautas. O NewsExtractor o consulta a cada 10 minutos, identifica o tema e baixa os artigos vinculados. O n8n lê o RSS enriquecido a cada hora, valida fontes, atualidade e duplicidade e encaminha matéria apta ao CMS. Material insuficiente fica pendente. O jornalista desse fluxo opera sem busca web da OpenAI. Na troca de fonte, oito das dez pautas iniciais ficaram prontas no feed. |
| Pautas manuais | Formulário n8n acessível no CMS. O fluxo ativo recebe a pauta e encadeia pesquisa, redação e publicação conforme suas validações. |
| Complementares | Seleciona notícias das últimas 24 horas. Pode vincular guia existente, redigir com base na matéria original ou reaproveitar pesquisa validada e acervo recente. Se faltar evidência essencial, registra pendência. A rotina roda a cada 30 minutos, com até duas redações iniciais por rodada, sem novas buscas web. O CMS registra o vínculo entre matéria original e complementar. |
| Meu dia | Workflow ativo com uma edição diária às 6h. Seleciona notícias do acervo, consulta fontes conforme a configuração e envia um snapshot nacional e regional para o portal. Uma falha de preparação preserva a edição válida. |
| Agenda de Teresina | Workflow ativo coleta programação de fontes selecionadas. Eventos coletados e sugestões de organizadores têm trilhas distintas. Sugestões exigem moderação, e eventos protegidos pela redação mantêm suas alterações. |
| Guias | O n8n reserva pautas, pesquisa fontes oficiais, prepara dossiê e devolve rascunho para revisão. A publicação exige aprovação no CMS, autoria e editoria ativas, e conferência das fontes. Revisões e atualização periódica mantêm a URL do guia. |
| Links internos | Workflow ativo propõe vínculos a partir de candidatos do acervo. A API recebe planos associados a matérias existentes e valida as alterações conforme as regras do CMS. |
| SEO | Dois workflows ativos cuidam da otimização e do acompanhamento. Search Console está conectado via OAuth2. O CMS mantém metadados SEO próprios, histórico, fila, limites e restauração. O piloto teve 30 páginas tratadas e 30 controles. O efeito posterior sobre cliques e posições ainda não foi medido. |
| NewsExtractor e CMS | Dois workflows ativos cobrem cadastro por tabela n8n e ponte de comandos com o CMS. A ponte roda a cada cinco minutos, reserva comandos em lotes pequenos, executa na rede privada e devolve estado e contagens. |

**Referências operacionais.** [Política em lotes](rss-politica-lote-10.md), [RSS enriquecido](rss-enriquecido-jornalista.md), [Complementares](materias-complementares-ia.md), [Meu dia](meu-dia.md), [Agenda cultural](agenda-cultural.md), [Guias](gestao-guias-do-diario.md), [SEO](seo-automation-2026-11-06.md) e [NewsExtractor no CMS](news-extractor-cms.md).

## 5. Distribuição, receita e mídia

| Capacidade | Tecnologia e situação |
|---|---|
| Instagram | Instagram Login e API da Meta para publicação direta na conta profissional, com agendador Cloudflare. O CMS reúne audiência, sincronização e exportação Markdown. Campanhas de comentário “LINK” vinculam publicações a matérias e podem responder em privado, conforme permissões. Há registro de envio real validado. Consulta periódica e webhook são caminhos distintos. A saúde atual do webhook requer verificação própria. |
| WhatsApp | Página pública do canal em produção. O código oferece gestão de destinos, campanhas e aprovação para integração WA-AKG. O envio automatizado a destinos depende de configuração e validação específica. |
| Newsletter | CMS para audiência, campanhas, prévia, teste e envio. Transporte SMTP autenticado em TLS quando configurado. A disponibilidade do provedor e a entregabilidade atual não foram reconfirmadas. |
| Publicidade | Slots configuráveis, Google AdSense e gestão de ads.txt. Há diagnóstico de audiência, posicionamento e monetização. Receita e preenchimento atuais não foram aferidos neste inventário. |
| Assinatura e paywall | Portal de conta, planos, controle de acesso a conteúdo premium e integração Asaas com webhook. Cobrança real e confirmação financeira exigem teste operacional próprio. |
| Stories com áudio | Renderizador Python e FFmpeg em Docker, validado na VPS. A fila do CMS permite preparar vídeo vertical com áudio e ativos editoriais. O processamento usa espaço temporário e controles de fila. |
| Estúdio de Vídeo IA | Módulo de geração, revisão e exportação de roteiro TXT/CSV, com fila D1 e Worker de processamento previsto na configuração. O escopo desse módulo termina no roteiro. A execução atual do Worker não foi reconfirmada. |

**Referências.** [Instagram direto](instagram-direct.md), [Audiência e campanhas](instagram-audience-links.md), [WhatsApp](trd-whatsapp-wa-akg.md), [Publicidade](adsense-audit-2026-10-26.md), [Stories](story-audio-renderer.md) e [Estúdio](video-ai-automation.md).

## 6. Arquitetura e tecnologias

| Camada | Tecnologia e responsabilidade |
|---|---|
| Portal e CMS | TypeScript, Hono e HTML renderizado no servidor em Cloudflare Pages. Layouts Editorial e AllType no código, CSS e JavaScript de navegador, TipTap no editor, Marked para Markdown, Zod para contratos e validações. |
| Banco e armazenamento | Cloudflare D1, compatível com SQLite, para matérias, taxonomia, contas, guias, cultura, estados editoriais, filas e auditoria. Cloudflare KV e CACHE para configurações e snapshots. Cloudflare R2 para imagens e outros ativos de mídia. |
| Execução assíncrona | Workers com Cron Triggers configurados para agendamento de matérias, Instagram e tarefas de vídeo. n8n na VPS Hostinger para orquestração, credenciais, formulários, tabelas operacionais e execução programada dos fluxos editoriais. |
| Extração e mídia na VPS | Docker Compose em rede privada compartilhada com o n8n. NewsExtractor em Python com Newspaper3k, parser XML seguro, armazenamento SQLite, controle de acesso a URLs e cache de documentos. Renderizador de Stories em Python e FFmpeg. |
| IA e fontes | OpenAI via n8n e integração editorial do CMS. Pesquisa, redação e revisão são separadas conforme o fluxo. Entradas incluem RSS oficial do Google Trends, feeds de editorias, fontes oficiais e URLs individuais. Dossiês reutilizáveis ficam em tabelas n8n. |
| Descoberta | Metadados canônicos, Open Graph, dados estruturados, RSS, sitemaps, robots.txt e llms.txt. Search Console apoia diagnóstico e piloto de SEO. |
| Medição de audiência | O layout oferece integração configurável com Google Analytics. A cobertura atual dos eventos de jornada e leitura precisa de verificação própria. Métricas de busca orgânica e audiência do Instagram são acompanhadas em superfícies separadas. |
| Desenvolvimento e entrega | Git/GitHub, Node.js, npm, Vite, Wrangler e Vitest. Migrações SQL acompanham mudanças de esquema. Scripts e manifestos registram releases isolados e validação em produção. |

**Fluxo principal.** Fonte ou jornalista → coleta e produção no n8n ou CMS → validação e autorização conforme o fluxo → gravação em D1 e mídia em R2 → entrega pelo portal → distribuição, descoberta e recirculação.

**Fronteiras.** O navegador recebe páginas públicas e faz preferências locais quando apropriado. O CMS usa sessão e controle por perfil, com CSRF nos módulos que o exigem. As APIs de automação usam chave própria. Serviços da VPS executam em rede privada. Segredos ficam na configuração operacional. Conteúdo de fontes fica no extrator; o CMS recebe os estados de coleta e os dados necessários à sua operação.

## 7. Qualidade, riscos e critérios de aceite

| Tema | Critério |
|---|---|
| Fidelidade editorial | Preservar fonte, autoria, data real e evidência. Validação estrutural de uma resposta de IA é uma etapa técnica. Guias e sugestões culturais exigem conferência editorial. |
| Duplicidade e recuperação | Manter a associação entre item e fonte até o CMS, usar reservas e tentativas limitadas onde há fila, e preservar a última versão válida diante de falha de atualização. |
| Atualidade | Medir separadamente o atraso da fonte, da extração, da redação e da publicação. A consulta do Trends a cada 10 minutos convive com a leitura horária do jornalista. |
| Disponibilidade | Em sobrecarga D1, devolver HTTP 503 temporário com Retry-After e sem stack público. A consulta de recomendações limita a janela e usa índices. A medição pós-correção registrou 158 linhas lidas em uma execução remota, frente à média histórica de cerca de 81 mil da consulta anterior. |
| Mobile e acessibilidade | Navegação completa, controles de leitura em uma linha nas larguras validadas, foco visível, contraste, conteúdo responsivo e controles de toque no jogo. |
| Privacidade | Região escolhida pelo leitor, preferência local, acesso restrito aos contatos de organizadores e isolamento de credenciais. |
| Custos | Priorizar RSS com texto ou extração das URLs vinculadas, reaproveitar dossiês e limitar lotes. A meta discutida é reduzir a busca paga a US$ 5/dia mantendo volume editorial. O resultado financeiro ainda precisa ser aferido. |

**Indicadores para acompanhar.** Publicações por dia e por fluxo, tempo da pauta à publicação, taxa de extração completa, pendências, duplicatas, erros D1, linhas lidas, custo OpenAI por fluxo, segunda leitura por sessão, retorno ao Meu dia, conversão de sugestões culturais em eventos, CTR orgânico e receita. O painel de notícias do dia, execuções n8n, filas operacionais, métricas do Instagram, D1 Insights e Search Console já fornecem partes dessa medição. Este PRD não atribui uma linha de base aos indicadores sem dados consolidados.

## 8. Escopo da verificação

- Conferidos o portal público, o menu e as rotas de produto, as configurações e módulos do repositório, os registros de implantação e a lista de 17 workflows ativos visíveis no n8n.
- A troca do Google Trends foi conferida até o RSS enriquecido em produção. O primeiro lote automático após a troca não foi reconfirmado para este PRD.
- O inventário distingue código disponível de operação verificada em SMTP, cobrança Asaas, automação de WhatsApp, webhook da Meta e Worker de vídeo. O banco vetorial foi discutido como alternativa e não consta como implantado.
- O diagnóstico técnico de desempenho está documentado em [sobrecarga D1](correcao-sobrecarga-d1-2026-11-06.md) e [Core Web Vitals mobile](core-web-vitals-mobile-2026-11-04.md). Os mecanismos de descoberta estão descritos em [Descoberta para agentes](agent-discovery-2026-11-04.md).
