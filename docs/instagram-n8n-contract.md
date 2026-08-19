# Contrato n8n — Instagram editorial

O CMS é a fonte de verdade. O n8n recebe versões aprovadas, executa IA/rasterização/publicação e devolve o resultado. Todas as chamadas do CMS enviam `X-API-Key` e `X-Webhook-Secret` quando esses segredos estão configurados.

## Webhook de legenda

Configure a URL em **CMS → Integrações → Instagram via n8n**. O CMS envia `POST` com:

```json
{
  "event": "instagram.caption.requested",
  "publication_id": 1,
  "version": 2,
  "editorial": {
    "hat": "POLÍTICA",
    "title": "Título da chamada",
    "subtitle": "Linha de apoio",
    "category": "Política",
    "author": "Redação"
  },
  "article": {
    "id": 123,
    "title": "Título original",
    "excerpt": "Resumo original",
    "content": "Texto limpo da matéria",
    "url": "https://..."
  },
  "constraints": {
    "language": "pt-BR",
    "factual_only": true,
    "caption_max_characters": 2200,
    "hashtag_maximum": 8,
    "human_approval_required": true
  }
}
```

Resposta síncrona esperada:

```json
{
  "caption": "Legenda sugerida pela IA.",
  "hashtags": ["#jornalismo", "#politica"],
  "alt_text": "Descrição objetiva da imagem.",
  "execution_id": "n8n-execution-id"
}
```

O prompt deve proibir fatos, números, nomes ou citações ausentes na matéria. A resposta nunca é aprovada automaticamente.

## Webhook de publicação

O CMS envia somente versões aprovadas. O payload contém uma chave idempotente, a data opcional de agendamento, a URL tokenizada da arte e a legenda final:

```json
{
  "event": "instagram.publication.requested",
  "publication_id": 1,
  "idempotency_key": "instagram:1:v3",
  "scheduled_at": null,
  "render": {
    "url": "https://.../artes/editoriais/token",
    "width": 1080,
    "height": 1350,
    "output": "jpeg",
    "quality": 92
  },
  "instagram": {
    "caption": "Legenda final\n\n#hashtags",
    "alt_text": "Descrição da imagem",
    "account_label": "@diariodopovo"
  },
  "callback_url": "https://.../api/n8n/instagram/1"
}
```

O fluxo do n8n deve:

1. rejeitar uma `idempotency_key` já processada;
2. abrir `render.url` em viewport de 1080 × 1350 e gerar JPEG;
3. hospedar o JPEG em uma URL HTTPS pública;
4. criar o contêiner de mídia na API oficial da Meta;
5. publicar o contêiner;
6. chamar `callback_url` com `X-API-Key`.

Resposta imediata aceita pelo CMS:

```json
{
  "status": "accepted",
  "execution_id": "n8n-execution-id"
}
```

Quando concluir, o n8n envia `POST` ou `PATCH` para `callback_url`:

```json
{
  "status": "published",
  "execution_id": "n8n-execution-id",
  "container_id": "meta-container-id",
  "media_id": "meta-media-id",
  "permalink": "https://www.instagram.com/p/.../",
  "image_url": "https://.../arte-final.jpg",
  "published_at": "2026-08-19T15:00:00.000Z"
}
```

Em falha, use `{"status":"failed","error":"mensagem objetiva"}`. O CMS preserva a aprovação e permite uma tentativa controlada.
