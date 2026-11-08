# RSS enriquecido direto ao jornalista

Desde 08/11/2026, a fonte de pautas do Google Trends é o RSS oficial `https://trends.google.com.br/trending/rss?geo=BR`. O NewsExtractor consulta essa fonte a cada dez minutos, com o ID `trends-google-br`, e extrai os textos dos links de notícias do próprio RSS. O link de cada tema segue o formato anterior do Google Trends Explore para preservar a deduplicação por URL. O conversor anterior foi desativado. O jornalista continua lendo `/feeds/all.xml` no agendamento horário.

## Implantação original

Implementação de 06/11/2026. O coletor da VPS recebe RSS e URLs individuais, extrai os artigos e mantém um RSS enriquecido em cache. O workflow Google Trends recebe esse RSS e envia o texto diretamente à IA jornalista. Não há nó de pesquisa web nem IA intermediária de apuração nesse workflow.

## Caminho dos dados

RSS do conversor → coletor em segundo plano → RSS enriquecido → jornalista → validação técnica/temporal → checagem de duplicidade → CMS.

O RSS original do Trends foi transferido para TRENDS_RSS_URL no arquivo privado /opt/diario-news-extractor/.env. O token não foi gravado nos artefatos locais nem exibido. O contêiner continua sem portas públicas, na rede root_default, com 512 MiB e 0,5 CPU.

O leitor do n8n usa `http://news-extractor:8080/feeds/all.xml`. A saída contém content:encoded com os textos, além de dp:documents, dp:version e dp:feed_id. O corpo de cada documento, a URL original/final, datas disponíveis e recibos de coleta são preservados. Documentos truncados ou sem conteúdo suficiente não são emitidos.

O serviço consulta feeds registrados a cada quinze minutos e processa lotes iniciais de trinta itens, continuando a fila sem esperar quinze minutos enquanto houver itens ainda não tentados. O feed gerado é lido do cache, sem disparar coleta ou IA durante a leitura. Prioriza itens recentes, com até 24 horas quando o RSS informa a data. URLs individuais podem ser coletadas mesmo quando representam material anterior; o jornalista recebe as datas reais, sem atualização artificial.

Os limites da primeira versão são 200 itens candidatos por feed e RSS final de até 1,8 MB. O cache de documentos continua com quinze minutos e até dez mil URLs. URLs e tipos de conteúdo continuam sujeitos aos controles de SSRF, TLS, robots, tamanho e bloqueios de acesso.

## Jornalista e publicação

Há uma única etapa de IA. O jornalista recebe os documentos, escreve o artigo e inclui no mesmo JSON o fato central, um trecho literal de evidência e suas informações temporais. Não há exigência de seis fatos distintos, pesquisa adicional ou dossiê produzido por outra IA. O texto deve ter extensão proporcional ao material; a validação aplica apenas um piso técnico de oitenta palavras.

O parser mantém verificações de HTML, fontes recebidas, datas, fato central e identidade do item. Só URLs dos documentos podem ser anexadas à matéria. Isso valida estrutura e rastreabilidade, não equivale a comprovação independente de cada afirmação.

O conteúdo insuficiente ou a recusa do jornalista gera uma pendência no coletor via POST /feeds/:id/review. O item fica fora do RSS de publicação. Na atualização seguinte, só volta a ser elegível se o texto das fontes mudar. Não há pesquisa web automática como alternativa. Fontes sem texto suficiente permanecem pendentes de coleta. As verificações de duplicidade e os endpoints de publicação anteriores foram preservados.

## Entradas pela web

Tabela privada do n8n: NewsExtractor — RSS e artigos, ID 9OXlMycPVN7ZGaXs, no projeto pessoal. Acesse [Data tables](https://n8n.srv797269.hstgr.cloud/home/datatables) e selecione a tabela. Preencher nome, tipo (`rss` ou `artigo`), URL HTTPS e marcar processar. O workflow NewsExtractor — cadastro de RSS e artigos (PnIBPs2jlwD3YQgF) lê as entradas a cada cinco minutos e atualiza situação, erro, RSS gerado e horário. A entrada fica desmarcada depois de processada; para tentar novamente, corrigir os dados e marcar processar.

Esses cadastros usam a autenticação do próprio n8n. A API do extrator permanece interna. Não foi criado um painel no CMS nem um domínio público para o coletor nesta etapa. Novos feeds podem alimentar o mesmo RSS agregado sem alterar o workflow jornalista.

## API interna

- GET /feeds: contagens e estado das fontes, sem revelar a URL secreta do RSS.
- POST /feeds: `{url,name,mode:"articles"}` registra um RSS convencional.
- POST /articles: `{url}` enfileira um artigo individual no feed articles.
- GET /feeds/:id.xml e /feeds/all.xml: RSS enriquecido em cache.
- GET /feeds/:id/status: itens, situação e razões das pendências.
- POST /feeds/:id/sync: solicita sincronização.
- POST /feeds/:id/review: registra `{guid,reason}` para revisão.

## Validação

Onze testes Python de extração, RSS/Atom, XML inseguro, cache, coleta individual e pendências passaram localmente e na VPS. Dez testes JavaScript do novo caminho e typecheck passaram. A execução 5381259 leu 29 itens reais pelo nó RSS Read, todos com documentos reconhecidos. A execução 5381260 escreveu e validou uma matéria de 131 palavras sobre uma première, sem gravar no CMS e sem pesquisa web. Os dois workflows isolados de teste foram arquivados.

## Implantação ativa

Jornalista: workflow kzGfdd8KDNxnB1fi, versão publicada ce822292-f404-4181-be4b-f0a639d048af, 16 nós, agendamento horário preservado. Cadastro de entradas: workflow PnIBPs2jlwD3YQgF, versão publicada 052baebe-d0d2-43be-8ddc-c1583d15fcd6. Ambos ativos e confirmados pela API do n8n.

Após autorização explícita do usuário, o lote real 5381272 foi iniciado em 07/11/2026 às 01:40 UTC (06/11 às 22:40 em Fortaleza). O resultado final é registrado no manifesto artifacts/rss-enriched/release.json. Antes do lote, o RSS disponibilizava 61 pautas completas e quatro pendentes de coleta. Essas contagens não representam matérias publicadas.

O lote terminou com sucesso às 01:42:50 UTC: 61 itens lidos, 45 descartados pela checagem de duplicidade, 16 enviados ao jornalista, oito publicados com confirmação do CMS e oito registrados para revisão. Não houve chamadas de pesquisa web. As pendências incluem datas divergentes, concursos de loteria diferentes dos temas e agendas sem atualização após o horário previsto. IDs publicados: 419958, 419959, 419960, 419961, 419962, 419963, 419964 e 419965.

A chave SSH temporária foi removida de authorized_keys na VPS e o arquivo privado local foi excluído. O extrator permaneceu saudável e os demais contêineres continuaram ativos.

Correção editorial posterior: versão ativa f5a3714f-c03d-4da5-b65e-2c7c252266e3. O jornalista deve evitar datas de calendário nos títulos, colocando a contextualização temporal no lide ou no corpo. Mantém o tempo verbal correto para fatos passados e pode preservar anos que identificam edições ou competições. Não se aplica corte automático por expressão regular. Dez testes existentes passaram e o workflow foi validado antes de publicar. O título da matéria 419959 foi corrigido preservando o slug. Após coordenação da edição simultânea e autorização do usuário, a matéria 419965 também foi corrigida para “Banco do Brasil registrou instabilidade digital e queixas sobre Pix”, com confirmação no banco e preservação do slug.

Os outros workflows, incluindo complementares, Guias e fluxos RSS existentes, não foram alterados. A ausência de pesquisa vale para esse workflow; ela não elimina despesas de pesquisa dos demais fluxos da conta.
