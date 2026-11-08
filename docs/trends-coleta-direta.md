# Trends: coleta direta dos links do RSS

> Histórico: o desenho abaixo foi substituído pelo [RSS enriquecido direto ao jornalista](rss-enriquecido-jornalista.md), sem etapa de pesquisa web neste workflow. Consulte o documento novo para a versão ativa e o cadastro de fontes.

Ativo em 06/11/2026 (America/Fortaleza), versão `f6c72aa2-9438-4bb9-82bc-3cd4c2fedb3d`, com 24 nós. Base preservada: `80a63204-5ec8-45d1-bd80-b769e85c0290`. Publicação confirmada pelo editor e pela versão ativa da API.

Correção posterior em 06/11: versão `f88a5f7a-efab-41cb-83a1-d4c05ae21100`, com 25 nós e coleta serial por Split in Batches. O intervalo de 250 ms do HTTP Request não aguardava a conclusão de cada requisição. Na execução real `5381216`, 15 das 18 pautas receberam busy do extrator; todas as 18 acabaram pesquisadas na web, com 69 buscas registradas e duas matérias publicadas. Essa rodada confirmou a extração, mas ainda não demonstrou economia de buscas.

O nó Coletar uma pauta por vez agora aguarda a resposta de cada coleta e acumula os resultados antes da análise. O teste isolado `5381226`, com as mesmas 18 pautas e sem IA/publicação, concluiu em 47 segundos, com zero busy e 16 pautas com documentos extraídos. Uma pauta ficou sem texto suficiente e outra não continha URLs. A vinculação entre pautas e resultados foi preservada. O workflow de teste `gmoBcDvQzYp8SzYl` foi arquivado. Evidência: `artifacts/trends-direct/serial-verification.json`. Conteúdo extraído continua sujeito à validação editorial; 16 extrações não representam 16 matérias aprovadas nem 16 pesquisas evitadas.

O fluxo Google Trends - Pesquisa e redacao v2 (`kzGfdd8KDNxnB1fi`) passa a tentar a coleta direta dos links de notícias presentes no RSS antes da pesquisa web. O RSS contratado, o agendamento, o modelo redator e as verificações de duplicidade e publicação permanecem.

## Serviço de extração

Código em `infra/news-extractor/`. Newspaper3k extrai o texto sem executar JavaScript, fazer NLP ou baixar imagens. Serviço instalado por SSH em `/opt/diario-news-extractor`, VPS `srv797269`, rede Docker `root_default`. Endpoint interno: `http://news-extractor:8080/extract`, corpo `{ "urls": ["https://..."] }`, até quatro URLs por pauta.

Sem porta publicada. O acesso é restrito à rede Docker do n8n; não configurar proxy público para este serviço. Contêiner sem privilégios, raiz somente leitura, limite de 512 MiB e 0,5 CPU. Cache em volume Docker próprio, SQLite separado do D1 do site: quinze minutos por URL normalizada, até dez mil documentos, sem guardar HTML. Essa primeira etapa não cria biblioteca vetorial nem armazena dossiês no R2.

A coleta registra URL solicitada e final, título, texto, autoria/data disponíveis, horário UTC, identificação do extrator e hashes SHA-256 do HTML e do texto. O cache preserva o horário da coleta original, sem apresentar conteúdo reaproveitado como uma consulta nova. Documentos repetidos por hash são eliminados no lote.

Destinos HTTPS públicos apenas; DNS é validado e o IP da conexão é fixado preservando validação TLS/SNI. Redirecionamentos são validados novamente. Respeita robots.txt e intervalo mínimo de um segundo por host. Respostas bloqueadas, conteúdo curto, material marcado como restrito e formatos não HTML seguem para o caminho alternativo. Não há contorno de login, captcha ou paywall.

## Fluxo editorial

1. Eliminar pautas já publicadas, como antes.
2. Preparar a requisição editorial original, incluindo a referência temporal.
3. Extrair URLs das notícias no texto do RSS; não consultar a página do próprio Trends como evidência.
4. Coletar documentos, com cache por URL.
5. Havendo texto válido, solicitar um dossiê à IA sem ferramentas de pesquisa. A requisição original de pesquisa web fica preservada para eventual retorno.
6. Conferir fontes, cronologia, fato central, seis fatos distintos e trechos literais dos documentos coletados. A IA não pode adicionar fontes que não foram extraídas.
7. Dossiê direto aprovado segue à redação. Ausência de conteúdo, erro do extrator/IA ou dossiê insuficiente seguem ao Research Topic original.
8. Ambos os caminhos convergem em Apuração aprovada, antes do redator e do parser de publicação.

Coleta direta usa `verified_collection`, recibos e trechos de evidência; nunca fabrica chamadas `web_search_call` nem atribui `verified_search=true` a uma análise sem pesquisa. O validador e a validação temporal de publicação existentes continuam ativos.

## Verificação e operação

Testes Python cobrem destinos proibidos, DNS privado, extração sem downloads secundários, cache/expiração e deduplicação. Testes JavaScript cobrem vinculação de itens, requisição sem ferramentas, retorno após falha, recibos vencidos, trechos inexistentes, URLs indevidas e cronologia. O workflow de teste `7fomQUfqR2V6KIPm` é isolado e não publica matérias nem faz pesquisa web.

No piloto local, três das quatro páginas testadas foram extraídas; a quarta foi reconhecida como restrita. Na VPS, o piloto de tênis extraiu duas páginas e rejeitou HTTP 202 da terceira. A análise recusou a liberação porque as páginas anunciavam um jogo cujo horário já havia passado, sem comprovar o resultado: retorno à pesquisa é o comportamento esperado nesse caso. O piloto de desabamento também pediu atualização de números preliminares divergentes. No piloto sobre o Paraguai, a execução `5381211` aprovou dez fatos de três fontes, sem qualquer chamada web_search na resposta da IA.

`get_workflow_details` omite referências a credenciais. As referências atuais foram verificadas por exportação CLI sem exibir segredos: OpenAi account e Header Auth account. O gerador conserva essas referências em `config.credentials`; não depender da atribuição automática do SDK para HTTP Request.

Atualização: gerar com `scripts/build-trends-direct.mjs`, validar no SDK, testar sem publicação, conferir versão de base, atualizar o workflow e publicar a versão. O template salvo contém `__LIVE_RSS_URL__`; resolver a URL pelo workflow atual em memória, sem gravar o token do feed em artefatos. Não publicar o template com esse marcador.

Validação final: cinco testes Python passaram localmente e na VPS; dez testes JavaScript e typecheck passaram. A execução `5381213` gerou uma redação real sem pesquisa web; o primeiro teste do parser identificou uma referência de configuração ausente apenas no fluxo de teste. A configuração foi incluída no gerador de testes. A resposta já produzida foi reaproveitada na execução `5381214`, que validou o payload no parser sem novas chamadas à IA ou gravação no CMS. O workflow de teste foi arquivado. O extrator ficou saudável, e n8n, Traefik e renderizador seguiram em execução. A chave SSH temporária foi revogada no servidor e o arquivo de chave privada local foi removido.

A redução de buscas depende da suficiência dos links recebidos. Esta mudança não impõe teto diário, não altera outros fluxos e não garante atingir US$ 5/dia. O fluxo de complementares continua pesquisando até uma integração posterior de reaproveitamento.
