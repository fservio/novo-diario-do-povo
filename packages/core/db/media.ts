/**
 * Media Repository
 * Handles media library operations
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
  created_at: string
}

/**
 * Search media items
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
      uploaded_at as created_at
    FROM media
    WHERE 
      filename LIKE ? OR
      alt LIKE ? OR
      credits LIKE ?
    ORDER BY uploaded_at DESC
    LIMIT ?
  `).bind(q, q, q, limit).all<MediaItem>()
  
  return result.results || []
}

/**
 * Get media by ID
 */
export async function getMediaById(env: Env, id: number): Promise<MediaItem | null> {
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
      uploaded_at as created_at
    FROM media
    WHERE id = ?
  `).bind(id).first<MediaItem>()
  
  return result || null
}

/**
 * List recent media
 */
export async function listRecentMedia(env: Env, limit: number = 50): Promise<MediaItem[]> {
  const result = await env.DB.prepare(`
    SELECT 
      id,
      r2_key,
      filename,
      mime_type,
      size,
      width,
      height,
      alt,
      caption,
      created_at
    FROM media
    WHERE mime_type LIKE 'image/%'
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(limit).all<MediaItem>()
  
  return result.results || []
}
