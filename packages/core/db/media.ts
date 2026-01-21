/**
 * Media Repository
 * Handles media library operations for R2 storage
 */

import type { Env } from '../types'

export interface MediaItem {
  id: number
  r2_key: string
  filename: string
  mime_type: string
  size_bytes: number
  width?: number
  height?: number
  alt?: string
  credits?: string
  uploaded_by_user_id?: number
  uploaded_at: string
  updated_at?: string
  deleted_at?: string
}

export interface CreateMediaInput {
  r2_key: string
  filename: string
  mime_type: string
  size_bytes: number
  width?: number
  height?: number
  alt?: string
  credits?: string
  uploaded_by_user_id: number
}

export interface UpdateMediaInput {
  filename?: string
  alt?: string
  credits?: string
}

export interface ListMediaOptions {
  query?: string
  filename?: string
  page?: number
  limit?: number
  includeDeleted?: boolean
}

/**
 * Create new media item
 */
export async function createMedia(
  env: Env,
  data: CreateMediaInput
): Promise<number> {
  const result = await env.DB.prepare(`
    INSERT INTO media (
      r2_key,
      filename,
      mime_type,
      size_bytes,
      width,
      height,
      alt,
      credits,
      uploaded_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.r2_key,
    data.filename,
    data.mime_type,
    data.size_bytes,
    data.width || null,
    data.height || null,
    data.alt || null,
    data.credits || null,
    data.uploaded_by_user_id
  ).run()

  return result.meta.last_row_id as number
}

/**
 * List media with search and pagination
 */
export async function listMedia(
  env: Env,
  options: ListMediaOptions = {}
): Promise<{ items: MediaItem[], total: number }> {
  const {
    query = '',
    filename = '',
    page = 1,
    limit = 20,
    includeDeleted = false
  } = options

  const offset = (page - 1) * limit

  // Escape special characters for LIKE
  // \ -> \\, % -> \%, _ -> \_
  const escapedQuery = query
    .replace(/\|/g, '||')
    .replace(/%/g, '|%')
    .replace(/_/g, '|_')

  const q = `%${escapedQuery}%`

  // Build WHERE clause
  const whereConditions = []
  if (!includeDeleted) {
    whereConditions.push('deleted_at IS NULL')
  }

  // Exact filename match
  if (filename) {
    whereConditions.push('filename = ?')
  }
  else if (query) {
    whereConditions.push('(filename LIKE ? ESCAPE \'|\' OR alt LIKE ? ESCAPE \'|\' OR credits LIKE ? ESCAPE \'|\')')
  }

  const whereClause = whereConditions.length > 0
    ? 'WHERE ' + whereConditions.join(' AND ')
    : ''

  // Count total
  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM media ${whereClause}`
  const countParams = filename ? [filename] : (query ? [q, q, q] : [])

  const countResult = await env.DB.prepare(countQuery)
    .bind(...countParams)
    .first<{ total: number }>()

  const total = countResult?.total || 0

  // Get items
  const itemsQuery = `
    SELECT 
      id,
      r2_key,
      filename,
      mime_type,
      size_bytes,
      width,
      height,
      alt,
      credits,
      uploaded_by_user_id,
      uploaded_at,
      updated_at,
      deleted_at
    FROM media
    ${whereClause}
    ORDER BY uploaded_at DESC
    LIMIT ? OFFSET ?
  `

  const itemsParams = [...countParams, limit, offset]
  const itemsResult = await env.DB.prepare(itemsQuery)
    .bind(...itemsParams)
    .all<MediaItem>()

  return {
    items: itemsResult.results || [],
    total
  }
}

/**
 * Search media items (simpler version for API)
 */
export async function searchMedia(
  env: Env,
  query: string = '',
  limit: number = 20
): Promise<MediaItem[]> {
  const q = `%${query}%`

  const result = await env.DB.prepare(`
    SELECT 
      id,
      r2_key,
      filename,
      mime_type,
      size_bytes,
      width,
      height,
      alt,
      credits,
      uploaded_at,
      updated_at
    FROM media
    WHERE 
      deleted_at IS NULL AND
      (filename LIKE ? OR alt LIKE ? OR credits LIKE ?)
    ORDER BY uploaded_at DESC
    LIMIT ?
  `).bind(q, q, q, limit).all<MediaItem>()

  return result.results || []
}

/**
 * Get media by ID
 */
export async function getMediaById(
  env: Env,
  id: number,
  includeDeleted: boolean = false
): Promise<MediaItem | null> {
  const whereClause = includeDeleted ? 'WHERE id = ?' : 'WHERE id = ? AND deleted_at IS NULL'

  const result = await env.DB.prepare(`
    SELECT 
      id,
      r2_key,
      filename,
      mime_type,
      size_bytes,
      width,
      height,
      alt,
      credits,
      uploaded_by_user_id,
      uploaded_at,
      updated_at,
      deleted_at
    FROM media
    ${whereClause}
  `).bind(id).first<MediaItem>()

  return result || null
}

/**
 * Update media metadata
 */
export async function updateMedia(
  env: Env,
  id: number,
  data: UpdateMediaInput
): Promise<void> {
  const updates: string[] = []
  const params: any[] = []

  if (data.filename !== undefined) {
    updates.push('filename = ?')
    params.push(data.filename)
  }
  if (data.alt !== undefined) {
    updates.push('alt = ?')
    params.push(data.alt)
  }
  if (data.credits !== undefined) {
    updates.push('credits = ?')
    params.push(data.credits)
  }

  if (updates.length === 0) return

  params.push(id)

  await env.DB.prepare(`
    UPDATE media 
    SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND deleted_at IS NULL
  `).bind(...params).run()
}

/**
 * Soft delete media
 */
export async function softDeleteMedia(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`
    UPDATE media 
    SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ? AND deleted_at IS NULL
  `).bind(id).run()
}

/**
 * Check if media is in use by posts
 */
export async function isMediaInUse(env: Env, id: number): Promise<boolean> {
  // Check if used as cover_media_id
  const coverResult = await env.DB.prepare(`
    SELECT COUNT(*) as count 
    FROM posts 
    WHERE cover_media_id = ?
  `).bind(id).first<{ count: number }>()

  if (coverResult && coverResult.count > 0) {
    return true
  }

  // Get r2_key to check in post content
  const media = await getMediaById(env, id)
  if (!media) return false

  const contentResult = await env.DB.prepare(`
    SELECT COUNT(*) as count 
    FROM posts 
    WHERE content LIKE ? OR content_markdown LIKE ?
  `).bind(`%${media.r2_key}%`, `%${media.r2_key}%`).first<{ count: number }>()

  return contentResult ? contentResult.count > 0 : false
}

/**
 * Extract image dimensions from buffer (simple PNG/JPEG parser)
 */
export function extractImageDimensions(
  buffer: ArrayBuffer,
  mimeType: string
): { width: number; height: number } | null {
  const bytes = new Uint8Array(buffer)

  // PNG: signature + IHDR chunk
  if (mimeType === 'image/png' && bytes.length >= 24) {
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
      // IHDR is at offset 16-23
      const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]
      const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
      return { width, height }
    }
  }

  // JPEG: scan for SOF0 (0xC0) marker
  if (mimeType === 'image/jpeg' && bytes.length >= 10) {
    // Look for FF C0 (SOF0 marker)
    for (let i = 0; i < bytes.length - 10; i++) {
      if (bytes[i] === 0xFF && bytes[i + 1] === 0xC0) {
        const height = (bytes[i + 5] << 8) | bytes[i + 6]
        const width = (bytes[i + 7] << 8) | bytes[i + 8]
        return { width, height }
      }
    }
  }

  return null
}
