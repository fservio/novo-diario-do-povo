import type { Env } from '../types'
import { createMedia, extractImageDimensions, getMediaById, type MediaItem } from '../db/media'

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif'
}

export const ADMIN_IMAGE_MAX_BYTES = 10 * 1024 * 1024

export async function uploadAdminImage(env: Env, input: {
  file: File
  alt: string
  credits?: string
  userId: number
  purpose?: string
}): Promise<MediaItem> {
  const extension = IMAGE_TYPES[input.file.type]
  if (!extension) throw new Error('Use uma imagem JPEG, PNG, WebP ou AVIF.')
  if (!input.file.size) throw new Error('O arquivo enviado está vazio.')
  if (input.file.size > ADMIN_IMAGE_MAX_BYTES) throw new Error('A imagem ultrapassa o limite de 10 MB.')

  const alt = input.alt.trim()
  if (alt.length < 3 || alt.length > 300) throw new Error('Informe um texto alternativo entre 3 e 300 caracteres.')
  const credits = String(input.credits || '').trim().slice(0, 300)
  const filename = input.file.name.trim().slice(0, 240) || `imagem.${extension}`
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const random = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map(value => value.toString(16).padStart(2, '0')).join('')
  const r2Key = `media/${year}/${month}/${random}.${extension}`
  const bytes = await input.file.arrayBuffer()
  const dimensions = extractImageDimensions(bytes, input.file.type)

  await env.R2.put(r2Key, bytes, {
    httpMetadata: { contentType: input.file.type },
    customMetadata: { purpose: input.purpose || 'media-library', uploadedAt: now.toISOString() }
  })

  try {
    const id = await createMedia(env, {
      r2_key: r2Key,
      filename,
      mime_type: input.file.type,
      size_bytes: input.file.size,
      width: dimensions?.width,
      height: dimensions?.height,
      alt,
      credits: credits || undefined,
      uploaded_by_user_id: input.userId
    })
    const media = await getMediaById(env, id)
    if (!media) throw new Error('A imagem foi enviada, mas não pôde ser recuperada da biblioteca.')
    return media
  } catch (error) {
    await env.R2.delete(r2Key).catch((_deleteError: unknown): void => undefined)
    throw error
  }
}
