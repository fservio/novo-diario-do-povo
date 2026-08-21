/**
 * R2 Storage Module
 * 
 * Gerencia upload, variantes responsivas e serving de mídia
 */

import type { Env, Media } from '../types'

// ============================================================================
// R2 Upload & Variants Generation
// ============================================================================

export interface UploadResult {
  media: Media
  variants: Array<{ width: number; r2_key: string }>
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'video/mp4',
  'video/webm',
  'application/pdf',
]

const VARIANT_WIDTHS = [320, 640, 1200]

export async function uploadMedia(
  env: Env,
  file: File,
  metadata: {
    alt?: string
    credits?: string
    uploadedByUserId?: number
  }
): Promise<UploadResult> {
  // Validar tipo MIME
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error(`Tipo de arquivo não permitido: ${file.type}`)
  }

  // Validar tamanho (15MB max)
  const MAX_SIZE = 15 * 1024 * 1024
  if (file.size > MAX_SIZE) {
    throw new Error(`Arquivo muito grande. Máximo: ${MAX_SIZE / 1024 / 1024}MB`)
  }

  // Gerar chave R2 única
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 11)
  const extension = file.name.split('.').pop() || 'bin'
  const r2Key = `media/${timestamp}-${random}.${extension}`

  // Upload arquivo original
  const buffer = await file.arrayBuffer()
  await env.R2.put(r2Key, buffer, {
    httpMetadata: {
      contentType: file.type,
    },
    customMetadata: {
      originalFilename: file.name,
      uploadedAt: new Date().toISOString(),
    },
  })

  // Criar registro no D1
  const result = await env.DB.prepare(`
    INSERT INTO media (
      r2_key, filename, mime_type, size_bytes,
      alt, credits, uploaded_by_user_id, uploaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    r2Key,
    file.name,
    file.type,
    file.size,
    metadata.alt || null,
    metadata.credits || null,
    metadata.uploadedByUserId || null
  ).run()

  const mediaId = result.meta.last_row_id as number

  // Buscar media criada
  const media = await env.DB.prepare('SELECT * FROM media WHERE id = ?')
    .bind(mediaId)
    .first<Media>()

  if (!media) {
    throw new Error('Falha ao criar registro de mídia')
  }

  // TODO: Gerar variantes responsivas (imagens) em background worker
  // Por ora, retornar apenas original
  const variants: Array<{ width: number; r2_key: string }> = []

  return { media, variants }
}

// ============================================================================
// R2 Serving (GET /i/:key)
// ============================================================================

export async function serveMedia(env: Env, r2Key: string, request: Request): Promise<Response> {
  // Bloquear acesso a paths privados
  if (r2Key.includes('private/')) {
    return new Response('Forbidden', { status: 403 })
  }

  const url = new URL(request.url)
  const width = url.searchParams.get('w')
  const height = url.searchParams.get('h')
  const quality = url.searchParams.get('q') || '85'
  const isProcessed = url.searchParams.has('processed')
  const focalXParam = url.searchParams.get('fp-x')
  const focalYParam = url.searchParams.get('fp-y')
  const focalX = focalXParam === null ? Number.NaN : Number(focalXParam)
  const focalY = focalYParam === null ? Number.NaN : Number(focalYParam)
  const gravity = Number.isFinite(focalX) && Number.isFinite(focalY)
    ? { x: Math.max(0, Math.min(1, focalX)), y: Math.max(0, Math.min(1, focalY)) }
    : undefined

  // Se houver parâmetros de redimensionamento e NÃO for o fetch interno de processamento
  if ((width || height) && !isProcessed) {
    const resizedUrl = new URL(request.url)
    resizedUrl.searchParams.set('processed', 'true')


    // IMPORTANTE: Para o Cloudflare Image Resizing funcionar, devemos usar o domínio da zona (Custom Domain).
    // O domínio .pages.dev muitas vezes não tem o add-on ativado ou não processa o 'cf: image' da mesma forma.
    // Garantimos a proteção contra loop com a flag 'processed=true' acima.
    const customDomain = 'diario.dopovo.com.br'
    if (!resizedUrl.hostname.includes('localhost')) {
      resizedUrl.hostname = customDomain;
      resizedUrl.protocol = 'https:';
      resizedUrl.port = ''; // Ensure no port (like 8788) leaks into prod
    }

    // REMOVER headers de range para garantir que o Cloudflare receba um 200 OK
    // O Image Resizing não funciona com 206 Partial Content
    const newHeaders = new Headers(request.headers)
    newHeaders.delete('Range')

    // Dispara o Image Resizing do Cloudflare via fetch recursivo
    // Nota: O Cloudflare detecta esse fetch interno e aplica as transformações na resposta
    return (fetch as any)(resizedUrl.toString(), {
      headers: newHeaders,
      cf: {
        image: {
          width: width ? parseInt(width) : undefined,
          height: height ? parseInt(height) : undefined,
          quality: parseInt(quality),
          format: 'auto', // AVIF/WebP negotiation
          fit: 'cover',
          ...(gravity ? { gravity } : {}),
        }
      }
    })
  }

  // Se for uma imagem estática (logo, etc) servida via /i/static/
  if (r2Key.startsWith('static/')) {
    const staticPath = r2Key.replace('static/', '')
    // Se for um fetch interno de processamento, buscamos o arquivo e retornamos 200 OK
    if (isProcessed) {
      const resp = await fetch(`${url.origin}/static/${staticPath}`)
      return resp
    }
    // Caso contrário, redirect normal para cache de borda (sem resize)
    return Response.redirect(`${url.origin}/static/${staticPath}`, 301)
  }

  // Buscar no R2
  const object = await env.R2.get(r2Key)

  if (!object) {
    if (env.CF_ENV === 'dev') {
      const productionUrl = new URL(`/i/${r2Key}`, 'https://diario.dopovo.com.br')
      productionUrl.search = url.search
      const productionResponse = await fetch(productionUrl.toString(), {
        headers: {
          'User-Agent': 'localhost-production-media-sync/1.0',
          'Accept': request.headers.get('Accept') || '*/*',
        },
      })

      if (productionResponse.ok) {
        return productionResponse
      }
    }

    return new Response('Not Found', { status: 404 })
  }

  // Headers de cache agressivo
  const headers = new Headers()
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('ETag', object.httpEtag)
  headers.set('Vary', 'Accept') // Importante para format: auto

  // Suporte a range requests (vídeos)
  if (object.range && 'offset' in object.range) {
    const rangeData = object.range as { offset: number; length: number }
    headers.set('Content-Range', `bytes ${rangeData.offset}-${rangeData.length}/${object.size}`)
    return new Response(object.body, { status: 206, headers })
  }

  return new Response(object.body, { headers })
}

// ============================================================================
// External Media Download (n8n integration)
// ============================================================================

export async function downloadAndUploadExternalMedia(
  env: Env,
  url: string,
  metadata: {
    alt?: string
    credits?: string
    uploadedByUserId?: number
  }
): Promise<UploadResult> {
  // Download da URL externa
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Jornal-Bot/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Falha ao baixar mídia: ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream'

  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    throw new Error(`Tipo de conteúdo não permitido: ${contentType}`)
  }

  const arrayBuffer = await response.arrayBuffer()

  // Extrair filename da URL
  const urlParts = new URL(url).pathname.split('/')
  const filename = urlParts[urlParts.length - 1] || 'download'

  // Criar File mock
  const blob = new Blob([arrayBuffer], { type: contentType })
  const file = new File([blob], filename, { type: contentType })

  // Upload usando função existente
  return uploadMedia(env, file, metadata)
}

// ============================================================================
// Generate Blur Placeholder (básico)
// ============================================================================

export function generateBlurPlaceholder(width: number, height: number): string {
  // Placeholder SVG simples (pode ser melhorado com blurhash)
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#e5e7eb"/>
    </svg>
  `
  return `data:image/svg+xml;base64,${btoa(svg)}`
}

// ============================================================================
// Delete Media (cascade D1 + R2)
// ============================================================================

export async function deleteMedia(env: Env, mediaId: number): Promise<void> {
  // Buscar media
  const media = await env.DB.prepare('SELECT * FROM media WHERE id = ?')
    .bind(mediaId)
    .first<Media>()

  if (!media) {
    throw new Error('Mídia não encontrada')
  }

  // Deletar do R2
  await env.R2.delete(media.r2_key)

  // Deletar variantes (se existirem)
  if (media.variants_json) {
    try {
      const variants = JSON.parse(media.variants_json) as Array<{ r2_key: string }>
      for (const variant of variants) {
        await env.R2.delete(variant.r2_key)
      }
    } catch (error) {
      console.error('Failed to parse/delete variants:', error)
    }
  }

  // Deletar do D1
  await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(mediaId).run()
}

// ============================================================================
// Get Media from R2 (for serving)
// ============================================================================

export async function getMediaFromR2(env: Env, key: string): Promise<R2ObjectBody | null> {
  try {
    return await env.R2.get(key)
  } catch (error) {
    console.error(`Failed to get media from R2: ${key}`, error)
    return null
  }
}
