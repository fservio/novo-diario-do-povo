# Renderizador de Stories com áudio

O serviço em `infra/story-renderer` converte uma arte pronta de 1080 × 1920 e um
MP3/WAV em MP4 H.264/AAC. A arte mantém a tipografia do gerador existente; deve
reservar a faixa y=1470–1570 para a onda sonora real, sincronizada com o áudio.
O formulário e a fila do CMS estão implementados e publicados no Pages. O usuário
confirmou que as alterações anteriores do pacote já estavam publicadas.
Deploy da integração: `4f32d87b.novo-diario-do-povo.pages.dev`.

## Armazenamento

- Originais e resultado definitivo devem ficar no Cloudflare R2.
- A VPS baixa os dois arquivos para `/work`, um **tmpfs de 384 MiB**, e envia o
  MP4 por PUT para uma URL HTTPS assinada. Não recebe credenciais permanentes do R2.
- Não existem volumes persistentes de mídia, portas públicas ou logs de payloads.
- `TemporaryDirectory` remove os arquivos em sucesso, falha de download, erro de
  codificação, timeout ou falha de upload. Se o contêiner for encerrado, o tmpfs
  desaparece. Um resultado só é confirmado depois do PUT retornar 2xx.
- Swap do contêiner é desativado (`memswap_limit` igual a `mem_limit`).
- Imagem Docker e código ocupam espaço fixo no disco; vídeos não se acumulam ali.
- A política de retenção no R2 deve ser tratada separadamente da VPS. Não apagar
  um vídeo anterior até o novo estar persistido e associado à versão correta no CMS.

## Operação

Instalação dedicada: `/opt/diario-story-renderer`, projeto Compose
`diario-story-renderer`, rede externa `root_default` compartilhada com o n8n.
Não modificar nem reiniciar o projeto Compose do n8n.

`.env` (modo 0600, não versionar):

```dotenv
RENDER_TOKEN=<segredo gerado no servidor>
SOURCE_HOSTS=diario.dopovo.com.br
UPLOAD_HOSTS=diario.dopovo.com.br
N8N_NETWORK=root_default
CMS_ORIGIN=https://diario.dopovo.com.br
```

Antes de usar URLs assinadas diretamente do R2, acrescentar **o hostname exato**
do bucket à lista correspondente. Não usar curingas nem hosts fornecidos pelo
usuário. Redirects não são seguidos, destinos locais/privados são recusados.
No modo integrado, downloads e PUT usam os endpoints do CMS e um Bearer token
temporário por trabalho. O Worker transmite o corpo diretamente ao R2. Não há
credenciais permanentes do R2 na VPS nem tokens em query strings ou logs de URLs.
O acesso público `/i/private/*` é bloqueado. Os arquivos definitivos são servidos
apenas às sessões autenticadas do CMS, incluindo suporte a Range para o player.

```sh
cd /opt/diario-story-renderer
docker compose up -d --build
docker compose ps
python3 -m unittest -v test_server.py
```

Os testes são executados no host com `python3 -m unittest -v test_server.py`;
`test_server.py` não integra a imagem de produção.

## Contrato interno

`GET http://story-renderer:8080/health` retorna estado e ocupação.
`POST http://story-renderer:8080/render` exige `Authorization: Bearer <RENDER_TOKEN>`.
O endpoint interno continua disponível, mas o fluxo integrado não exige um novo
workflow do n8n. Com `CMS_ORIGIN` configurado, uma thread consulta a fila a cada
15 segundos. O CMS guarda somente o SHA-256 da chave `RENDER_TOKEN` na tabela
`story_renderer_config`. Não publicar a chave nem guardar vídeos nas execuções
do n8n. A rede Docker existente serve apenas para acesso interno opcional.

```json
{
  "image_url": "https://host-permitido/arte.png?token-do-job",
  "audio_url": "https://host-permitido/audio.mp3?token-do-job",
  "upload_url": "https://host-permitido/api/story-audio/jobs/id/video",
  "asset_token": "token-temporario-do-trabalho"
}
```

Resposta de sucesso após persistir:

```json
{
  "success": true,
  "duration_seconds": 45.0,
  "size_bytes": 1234567,
  "over_45_seconds": false,
  "elapsed_seconds": 30.0
}
```

Uma execução por vez; 429 significa ocupado, a fila deve tentar novamente com
atraso. O timeout de renderização é de dez minutos; configurar o HTTP do n8n
para pelo menos 900 segundos. Em falha no PUT, gerar nova URL e repetir o job.
Usar chave de saída por versão e callback idempotente no CMS para impedir que
uma execução antiga substitua a nova.

## Fila integrada

- Migração: `0045_instagram_audio_stories.sql`; dados próprios, sem alteração de
  matérias ou publicações existentes.
- `POST /api/story-audio/claim` autentica a chave por hash e registra heartbeat.
- Claim atômico, lease de 20 minutos e até três tentativas após interrupção.
- O renderer envia `X-Video-Duration` no PUT. O CMS valida tamanho e cabeçalho MP4
  antes de marcar como pronto; uma chave distinta por lease protege contra PUT tardio.
- Erros de mídia/envio aparecem no painel e permitem gerar uma nova versão.
- Alterações da composição recebem controle otimista de versão. Um trabalho antigo
  perde acesso quando uma versão nova é salva. Arquivos antigos são removidos do R2
  somente após persistir o substituto.
- Não configurar `CMS_ORIGIN` na VPS até o deploy dos endpoints terminar. Antes
  disso o renderizador continua saudável no modo interno e não consulta a fila.
- Após publicar: habilitar `CMS_ORIGIN` no `.env`, recriar somente o contêiner do
  renderer e validar upload real, MP4 no R2, download e zero arquivos em `/work`.

Limites: áudio 30 MiB, imagem 15 MiB, saída 90 MiB, duração máxima operacional
180 segundos. Acima de 45 segundos há sinalização, sem corte automático.
Um arquivo acima do limite operacional é recusado por inteiro.

Limites do contêiner: 1 CPU, 1 GiB de RAM, 64 processos, usuário sem privilégios,
sistema de arquivos somente leitura. A capacidade de produção deve ser avaliada
com os arquivos reais; o benchmark sintético não representa toda matéria.

## Verificação na VPS — 27/10/2026

- Serviço instalado e `healthy`; nenhuma porta publicada.
- n8n alcança o hostname interno: `/health` retorna 200; `/render` sem token retorna 401.
- Inspeção Docker confirmou tmpfs em `/work` e `/tmp`, raiz somente leitura,
  CPU=1, memória=1 GiB e limite combinado memória+swap=1 GiB.
- Quatro testes passaram localmente e na VPS: rejeição de URL indevida, DNS
  privado e limpeza após falhas de download/upload.
- Teste real de codificação: 45 segundos, 1080 × 1920, H.264/AAC, 1.822.075 bytes,
  64,46 segundos de processamento usando arte sintética e tom de áudio.
- O destino de upload foi substituído por um verificador de codecs/checksum
  nesse benchmark de 45 segundos. O teste posterior abaixo validou o PUT real.
- Ao terminar: zero arquivos em `/work`; serviço em repouso com aproximadamente
  15 MiB de memória. n8n e Traefik continuaram em execução.
- Versão com barra de progresso e autenticação por job: benchmark de 45 segundos
  em 59,09 segundos, 1.824.089 bytes, zero arquivos temporários remanescentes.
- Build e typecheck passaram. Suíte completa: 404 testes passaram em 50 arquivos.
- Prévia local do formulário revisada no Chrome; usa marca como foto ilustrativa,
  sem criar uma matéria ou publicação real.

## Correção e teste real — 27/10/2026

A consulta da fila usava o User-Agent padrão do urllib e recebia HTTP 403 com
`error code: 1010` da Cloudflare, antes de chegar ao CMS. O heartbeat ficava ausente
e o painel recusava a geração com “O renderizador está indisponível”.

Todas as chamadas agora usam a identificação descritiva `DiarioStoryRenderer/1.0`,
incluindo claim e callback de erro. É a correção de cliente indicada pela
[documentação da Cloudflare](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/).
Nenhuma proteção da Cloudflare foi desativada. Os logs registram somente a classe
de erro e o status, sem URLs nem tokens. Cinco testes Python passaram, incluindo
a identificação HTTP e liberação do lock após uma consulta sem trabalhos.

Após a correção, o heartbeat foi confirmado no D1 e um teste sintético isolado
percorreu R2 → fila → renderizador → PUT no CMS → R2. O painel mostrou “MP4 pronto”
e o link de download. O arquivo foi baixado do R2 e validado: 146.443 bytes,
5,0 segundos, H.264/AAC e container MP4 válido. Os registros e os três objetos
sintéticos desse teste foram removidos; a matéria e os formatos existentes
não foram alterados. A cópia de verificação está em `artifacts/story-audio-qa/`.

O download automatizado pelo navegador não pôde ser concluído: o controle da
extensão ficou desacoplado. Isso não afetou a geração nem o PUT, ambos confirmados
pelo D1, pelo painel e pelo download direto do R2. A contagem de arquivos temporários
na VPS não foi medida novamente nesse teste; a limpeza continua coberta pelos
testes e pelo contexto temporário do renderizador.

## Correção de sessão do editor — 27/10/2026

O envio para a rota SSR podia receber um 403 em HTML quando o token de edição
embutido na página expirava após uma hora. O cliente tentava interpretar o HTML
como JSON e exibia `Unexpected token '<'`.

O editor agora usa `/api/admin/instagram/:id/audio/{session,generate,status}`.
Antes de enviar, renova o token por um GET autenticado, vinculado ao usuário e ao
SID do JWT, e o envia em `X-CSRF-Token`. As verificações de autenticação, papel e
CSRF foram mantidas. A renovação não descarta os arquivos ou os campos da página.
O novo helper HTTP trata 401, 403, redirects para login e respostas não JSON.

Typecheck e build passaram; 411 testes passaram em 52 arquivos. A regressão testa
token expirado, renovação com a mesma sessão, arquivo mantido, sessão divergente,
papel sem permissão e respostas HTML/JSON. As cópias de testes em `artifacts/`
foram excluídas da descoberta de testes para evitar execução duplicada.

Deploy: `c2a5f630.novo-diario-do-povo.pages.dev`. O pacote congelado está em
`artifacts/story-audio-csrf-release/site`; comparado ao deploy anterior, mudam
apenas o Worker e os scripts do Instagram (incluindo suas cópias estáticas).
Em produção, a rota sem autenticação devolveu 401 JSON. A página autenticada
recebeu os scripts novos. A publicação 54 exibiu o vídeo real do usuário pronto:
39,000998 segundos, 1080 × 1920, player com readyState=4 e nenhum erro, além do
botão de download. Captura em `artifacts/story-audio-csrf-ready.jpg`.

Um teste sintético adicional no D1 foi rejeitado pela revisão automática e não
foi executado; o único áudio técnico já enviado ao R2 foi removido. A validação
final usou somente leitura do vídeo real já gerado pelo usuário.
