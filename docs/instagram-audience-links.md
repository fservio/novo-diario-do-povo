# Audiência e “comente LINK”

## Painel

Acesse `/admin/instagram/audience`, também disponível na mesa de publicações. O painel reúne:

- Seguidores atuais, entradas e saídas, alcance, visualizações e contas engajadas nos últimos 30 dias, quando disponibilizados pela Meta.
- Histórico diário de seguidores coletado a partir da ativação, por dia de Fortaleza. Não há reconstrução retroativa desse histórico.
- Distribuições agregadas por cidade, país, idade e gênero. Algumas métricas exigem pelo menos 100 seguidores; respostas vazias permanecem indisponíveis, sem virarem zero.
- Métricas acumuladas das matérias publicadas diretamente pelo CMS, vinculadas pelo ID de mídia do Instagram.
- Atualização automática a cada seis horas e solicitação manual. São atualizadas até 12 mídias por execução, priorizando as menos recentes; novas solicitações manuais continuam essa rotação.

## Resposta LINK

Cada matéria publicada tem uma ativação individual no painel. O recurso começa **desativado**. Somente diretores podem ativar, pausar e solicitar sincronizações.

O comentário precisa ser a palavra LINK, sem distinção entre maiúsculas e minúsculas e aceitando pontuação final. Frases como “não quero link” não disparam mensagens. Somente comentários posteriores à ativação são elegíveis.

Uma resposta privada é enviada por leitor e matéria. Ela usa um cartão `generic` com título (até 80 caracteres Unicode), subtítulo e botão **Ler reportagem** do tipo `web_url`. Tocar no cartão também abre o mesmo endereço do próprio Diário. O endereço redireciona à reportagem com parâmetros UTM; o contador registra aberturas, incluindo prévias e repetições, sem armazenar IP ou identificar visitantes únicos. Não há URL longa no texto da mensagem.

Antes do envio, o worker verifica novamente a campanha, a disponibilidade da matéria e o texto e a data do comentário na Meta. A janela máxima é de sete dias. Não há mensagem de acompanhamento automática. Limites locais: 100 respostas por matéria e 200 por conta em 24 horas. A fila processa até cinco respostas por minuto.

Entregas e comentários repetidos são deduplicados. O identificador do leitor é armazenado somente como HMAC; o texto do comentário e o nome do leitor não são persistidos. Registros encerrados são removidos após 30 dias. Envios com resultado incerto não são repetidos automaticamente e ficam visíveis no painel como requerendo atenção.

## Permissões e ativação

1. Aplicar `0047_instagram_audience_links.sql` no D1 e registrar a migração antes de atualizar o site e o worker.
2. Publicar o site e o worker `diario-instagram-scheduler` atualizado.
3. No painel, usar **Autorizar audiência e comentários**. O OAuth solicita, além das permissões de publicação existentes, `instagram_business_manage_insights` e `instagram_business_manage_comments`.
4. Confirmar essas permissões na Meta. A conta permanece a mesma. A renovação pelo botão comum preserva as permissões adicionais já informadas pela Meta.
5. Solicitar a atualização e verificar métricas reais. Para testar LINK, ativar uma matéria escolhida, fazer um comentário por outra conta autorizada no ambiente de testes e verificar a mensagem recebida. A ativação não publica nem altera a legenda de uma matéria existente.

## Webhooks e consulta periódica

O endpoint HTTPS é `https://diario.dopovo.com.br/webhooks/instagram`.

- GET valida `hub.mode`, `hub.verify_token` e devolve `hub.challenge`. Cadastrar um segredo novo como `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` no Pages e usar o mesmo valor no painel da Meta.
- POST verifica a assinatura `X-Hub-Signature-256` com o Instagram App Secret sobre o corpo original. Eventos sem assinatura válida são recusados. O endpoint aceita os envelopes de objeto e lista documentados pela Meta e reconhece `comment_id` e `id`.
- A autorização ampliada tenta inscrever a conta em `comments` via `/{account_id}/subscribed_apps`. Falhas dessa inscrição são mostradas no painel e não desfazem a conexão de publicação.
- A documentação atual da Meta exige aplicativo publicado/ativo, Advanced Access e requisitos de verificação para webhooks em produção. Não se deve declarar o webhook operacional antes de cumprir esses requisitos e testar uma entrega assinada real.
- A consulta periódica usa a API oficial de comentários e respeita o nível de acesso do aplicativo. A cada minuto, até cinco campanhas são consultadas, com páginas de até 50 comentários e cursores persistidos. Contas com muitos comentários podem levar vários ciclos. Essa consulta não contorna restrições de acesso: erros de permissão são mostrados no painel.

O worker usa somente DB, INSTAGRAM_TOKEN_SECRET e PUBLIC_BASE_URL/versão da API. A assinatura de webhook é verificada no Pages, onde INSTAGRAM_APP_SECRET já está protegido. Não há necessidade de conceder acesso ao token de Instagram no navegador.

## Fontes oficiais conferidas

- [Insights](https://developers.facebook.com/documentation/instagram-platform/insights)
- [Métricas de conta](https://developers.facebook.com/documentation/instagram-platform/api-reference/instagram-user/insights)
- [Respostas privadas](https://developers.facebook.com/documentation/instagram-platform/private-replies)
- [Configuração de webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks/setup)
- [Exemplos de eventos](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples)

## Implantação de 4 de novembro de 2026

Migração 0047 aplicada no D1 e worker atualizado (versão inicial `90d3dc0c-39f9-42d4-810f-ae932ccf873e`). O primeiro deploy do painel é `d2a65719`, feito pelo pacote isolado `artifacts/instagram-audience-production-v2`, baseado na versão `0e5c6213` para preservar as mudanças posteriores à integração original, incluindo WhatsApp, desempenho móvel e arquivos de descoberta. INSTAGRAM_WEBHOOK_VERIFY_TOKEN foi configurado como segredo do Pages. Nenhuma campanha foi ativada automaticamente.

A autorização adicional foi concluída pelo titular. A conexão confirma `instagram_business_manage_insights` e `instagram_business_manage_comments`, além das permissões básicas e de publicação. A coleta real confirmou 60.447 seguidores, 2.289 entradas, 628 saídas, alcance de 505.957 contas e mais de um milhão de visualizações nos últimos 30 dias. Dados demográficos e métricas individuais das matérias também foram conferidos no painel publicado.

O deploy final desta entrega é `95b3b666` (pacote `artifacts/instagram-audience-production-v3`), com worker `f455066b-7f37-4250-80fc-2ed9a8424d09`. A regressão direcionada passou: 52 testes em seis arquivos de Instagram. A leitura autenticada de comentários retornou HTTP 200.

O callback do webhook foi verificado e salvo na Meta, e a conta foi inscrita em `comments`. O simulador da Meta foi acionado, mas sua interface não apresentou confirmação conclusiva do resultado HTTP; portanto a entrega assinada em produção permanece sem validação conclusiva. O painel da Meta ainda informa que o aplicativo precisa estar publicado para receber notificações reais. Enquanto isso, o recurso usa a consulta periódica oficial de comentários, sujeita ao nível de acesso da conta/aplicativo.

Nenhuma campanha LINK foi ativada e nenhuma resposta privada real foi enviada nesta validação. O teste completo de recebimento da mensagem deve usar uma matéria escolhida e um novo comentário de leitor elegível após a ativação.

### Publicação do aplicativo e primeiro teste real

Posteriormente, o titular ativou LINK na publicação 151. Antes de publicar o app, a Meta informava dois comentários, mas o endpoint de comentários devolvia lista vazia. A associação empresarial inicialmente feita ao portfólio `610932611650749` foi removida com autorização expressa do titular. O InautoDP foi associado ao portfólio verificado `jordiariodopovo` (`942170271892397`), e a Meta confirmou a publicação do aplicativo em 4 de novembro de 2026.

Após a publicação, a API passou a entregar os dois comentários, incluindo o LINK enviado às 16h36 (Fortaleza). O agendador o capturou às 17h17 e tentou a resposta privada. A Meta recusou o envio por autorização do recurso. O registro ficou `uncertain`, sem `message_id`, e não será reenviado automaticamente. Portanto, a publicação do aplicativo foi concluída, mas a entrega real de respostas privadas ainda não foi confirmada e exige resolver a autorização de envio na Meta.

### Permissão de mensagens e envio confirmado

A tentativa controlada de diagnóstico confirmou HTTP 403/código 10, com a mensagem `Application does not have permission for this action`. Embora a tabela de requisitos de respostas privadas do Instagram Login cite basic e manage_comments, nesta integração o endpoint de mensagens recusou o envio até a autorização adicional de `instagram_business_manage_messages`.

O titular autorizou expressamente a nova permissão para `@jordiariodopovo`. A conexão confirmou os cinco escopos às 17h34 de Fortaleza. Com o novo token, uma única tentativa controlada para o comentário LINK da publicação 151 retornou `message_id`; o registro foi atualizado para `sent`, evitando repetição pelo agendador. Nenhuma leitura de caixa de entrada ou envio a outros leitores foi feita nessa validação.

Deploy `940fb610`, pacote isolado `artifacts/instagram-messages-permission-production`: botão **Autorizar respostas privadas** solicita os escopos adicionais de forma explícita. Renovações comuns preservam a permissão de mensagens quando já concedida. A autorização de audiência/comentários isolada continua sem solicitar mensagens. Validação: 31 testes direcionados e typecheck aprovados. A revisão de comentários foi apenas preparada em rascunho na Meta, sem submissão.

### Cartão com endereço clicável

O titular confirmou o recebimento da resposta de texto, mas o Instagram não tornou a URL clicável no aplicativo. O agendador foi atualizado para enviar `message.attachment` com `template_type=generic`, `default_action` e botão `web_url` **Ler reportagem**, conforme o exemplo da [coleção oficial da Meta](https://www.postman.com/meta/instagram/request/xru3vzm/generic-template). Versão do worker `2cab5412-9428-4638-a422-d44fa6ac0cd7`. Validação: 31 testes e typecheck aprovados. O teste de aceitação real do novo formato exige um novo comentário elegível; a mensagem anteriormente enviada não é editada nem reenviada e a deduplicação por leitor/matéria foi preservada.

O titular posteriormente confirmou o funcionamento do botão e testou com uma conta comum, sem papel de testadora, com sucesso. A pedido dele, a versão `34364ad1-a688-4b3b-8e96-392d4a6673eb` acrescenta `image_url` ao cartão com o JPEG original da publicação. A imagem é selecionada do job publicado com a mesma publicação, conta e ID de mídia da campanha; não usa a capa atual da matéria nem imagens de outros posts. O endereço público `/instagram/media/{token}` foi verificado (HTTP 200, image/jpeg, assinatura JPEG válida). Na ausência de imagem correspondente, mantém título e botão. Testes: 32 aprovados e typecheck aprovado. O recebimento visual com imagem ainda deve ser conferido em uma nova resposta elegível.
