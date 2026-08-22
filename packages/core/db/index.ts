/**
 * Database Helpers & Repositories
 */

import type { Env, Post, Category, Tag, Author, Media, Plan, ReaderUser, Entitlement, User } from '../types'

// ============================================================================
// Generic Query Builder Helpers
// ============================================================================

export interface PaginationParams {
  page?: number
  perPage?: number
}

export interface PaginationResult<T> {
  data: T[]
  total: number
  page: number
  perPage: number
  totalPages: number
}

export async function paginate<T>(
  env: Env,
  query: string,
  bindings: any[],
  params: PaginationParams = {}
): Promise<PaginationResult<T>> {
  const page = Math.max(1, params.page || 1)
  const perPage = Math.min(100, Math.max(1, params.perPage || 20))
  const offset = (page - 1) * perPage

  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM (${query})`
  const countResult = await env.DB.prepare(countQuery).bind(...bindings).first<{ total: number }>()
  const total = countResult?.total || 0

  // Get paginated data
  const dataQuery = `${query} LIMIT ? OFFSET ?`
  const dataResult = await env.DB.prepare(dataQuery).bind(...bindings, perPage, offset).all<T>()

  return {
    data: dataResult.results || [],
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  }
}

// ============================================================================
// Posts Repository
// ============================================================================

export async function findPostBySlug(env: Env, slug: string): Promise<Post | null> {
  return await env.DB.prepare('SELECT * FROM posts WHERE slug = ? LIMIT 1')
    .bind(slug)
    .first<Post>()
}

export async function findPostById(env: Env, id: number): Promise<Post | null> {
  return await env.DB.prepare('SELECT * FROM posts WHERE id = ? LIMIT 1')
    .bind(id)
    .first<Post>()
}

export async function findPublishedPosts(
  env: Env,
  filters: {
    categoryId?: number
    tagId?: number
    authorId?: number
    limit?: number
    offset?: number
  } = {}
): Promise<Post[]> {
  let query = `
    SELECT DISTINCT p.* 
    FROM posts p
    WHERE p.status = 'published' 
    AND p.published_at <= ?
  `
  const bindings: any[] = [new Date().toISOString()]

  if (filters.categoryId) {
    query += ' AND p.category_id = ?'
    bindings.push(filters.categoryId)
  }

  if (filters.tagId) {
    query += ` AND p.id IN (SELECT post_id FROM posts_tags WHERE tag_id = ?)`
    bindings.push(filters.tagId)
  }

  if (filters.authorId) {
    query += ' AND p.author_id = ?'
    bindings.push(filters.authorId)
  }

  query += ' ORDER BY p.published_at DESC'

  if (filters.limit) {
    query += ' LIMIT ?'
    bindings.push(filters.limit)

    if (filters.offset) {
      query += ' OFFSET ?'
      bindings.push(filters.offset)
    }
  }

  const result = await env.DB.prepare(query).bind(...bindings).all<Post>()
  return result.results || []
}

export async function countPublishedPosts(
  env: Env,
  filters: {
    categoryId?: number
    tagId?: number
    authorId?: number
  } = {}
): Promise<number> {
  let query = `
    SELECT COUNT(*) as total
    FROM posts p
    WHERE p.status = 'published' 
    AND p.published_at <= ?
  `
  const bindings: any[] = [new Date().toISOString()]

  if (filters.categoryId) {
    query += ' AND p.category_id = ?'
    bindings.push(filters.categoryId)
  }

  if (filters.tagId) {
    query += ` AND p.id IN (SELECT post_id FROM posts_tags WHERE tag_id = ?)`
    bindings.push(filters.tagId)
  }

  if (filters.authorId) {
    query += ' AND p.author_id = ?'
    bindings.push(filters.authorId)
  }

  const result = await env.DB.prepare(query).bind(...bindings).first<{ total: number }>()
  return result?.total || 0
}

export async function findPostWithRelations(env: Env, slug: string) {
  const post = await findPostBySlug(env, slug)
  if (!post) return null

  // Category
  const category = await env.DB.prepare('SELECT * FROM categories WHERE id = ?')
    .bind(post.category_id)
    .first<Category>()

  // Author
  const author = await env.DB.prepare('SELECT * FROM authors WHERE id = ?')
    .bind(post.author_id)
    .first<Author>()

  // Tags
  const tags = await env.DB.prepare(`
    SELECT t.* FROM tags t
    INNER JOIN posts_tags pt ON pt.tag_id = t.id
    WHERE pt.post_id = ?
  `).bind(post.id).all<Tag>()

  // Cover media
  let coverMedia = null
  if (post.cover_media_id) {
    coverMedia = await env.DB.prepare('SELECT * FROM media WHERE id = ?')
      .bind(post.cover_media_id)
      .first<Media>()
  }

  return {
    ...post,
    category,
    author,
    tags: tags.results || [],
    coverMedia,
  }
}

// ============================================================================
// LiveBlog Updates Repository
// ============================================================================

export interface LiveBlogUpdate {
  id: number
  post_id: number
  author_id: number
  title: string | null
  content: string
  content_markdown: string | null
  is_pinned: number
  published_at: string
  created_at: string
  updated_at: string
  // Joined
  author_name?: string
}

export async function findLiveUpdates(
  env: Env,
  postId: number,
  params: { limit?: number; offset?: number } = {}
): Promise<LiveBlogUpdate[]> {
  const limit = params.limit || 50
  const offset = params.offset || 0

  const result = await env.DB.prepare(`
    SELECT u.*, a.name as author_name
    FROM live_blog_updates u
    LEFT JOIN authors a ON a.id = u.author_id
    WHERE u.post_id = ?
    ORDER BY u.is_pinned DESC, u.published_at DESC
    LIMIT ? OFFSET ?
  `).bind(postId, limit, offset).all<LiveBlogUpdate>()

  return result.results || []
}

export async function createLiveBlogUpdate(
  env: Env,
  data: {
    post_id: number
    author_id: number
    title?: string
    content: string
    content_markdown?: string
    is_pinned?: number
  }
): Promise<number> {
  const now = new Date().toISOString()
  const result = await env.DB.prepare(`
    INSERT INTO live_blog_updates (
      post_id, author_id, title, content, content_markdown, is_pinned, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    data.post_id,
    data.author_id,
    data.title || null,
    data.content,
    data.content_markdown || null,
    data.is_pinned ?? 0,
    now,
    now,
    now
  ).run()

  return result.meta.last_row_id as number
}

export async function deleteLiveBlogUpdate(
  env: Env,
  id: number
): Promise<void> {
  await env.DB.prepare('DELETE FROM live_blog_updates WHERE id = ?').bind(id).run()
}

// ============================================================================
// Categories Repository
// ============================================================================

export async function findCategoryBySlug(env: Env, slug: string): Promise<Category | null> {
  return await env.DB.prepare('SELECT * FROM categories WHERE slug = ? AND is_active = 1 LIMIT 1')
    .bind(slug)
    .first<Category>()
}

export async function findAllCategories(env: Env): Promise<Category[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM categories WHERE is_active = 1 ORDER BY display_order ASC, name ASC'
  ).all<Category>()

  return result.results || []
}

// ============================================================================
// Tags Repository
// ============================================================================

export async function findTagBySlug(env: Env, slug: string): Promise<Tag | null> {
  return await env.DB.prepare('SELECT * FROM tags WHERE slug = ? LIMIT 1')
    .bind(slug)
    .first<Tag>()
}

// ============================================================================
// Authors Repository
// ============================================================================

export async function findAuthorBySlug(env: Env, slug: string): Promise<Author | null> {
  return await env.DB.prepare('SELECT * FROM authors WHERE slug = ? AND is_active = 1 LIMIT 1')
    .bind(slug)
    .first<Author>()
}

// ============================================================================
// Media Repository
// ============================================================================

export async function findMediaById(env: Env, id: number): Promise<Media | null> {
  return await env.DB.prepare('SELECT * FROM media WHERE id = ? LIMIT 1')
    .bind(id)
    .first<Media>()
}

export async function findMediaByR2Key(env: Env, r2Key: string): Promise<Media | null> {
  return await env.DB.prepare('SELECT * FROM media WHERE r2_key = ? LIMIT 1')
    .bind(r2Key)
    .first<Media>()
}

// ============================================================================
// Plans Repository
// ============================================================================

export async function findActivePlans(env: Env): Promise<Plan[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM plans WHERE is_active = 1 ORDER BY display_order ASC'
  ).all<Plan>()

  return result.results || []
}

export async function findPlanBySlug(env: Env, slug: string): Promise<Plan | null> {
  return await env.DB.prepare('SELECT * FROM plans WHERE slug = ? AND is_active = 1 LIMIT 1')
    .bind(slug)
    .first<Plan>()
}

// ============================================================================
// Reader Users Repository
// ============================================================================

export async function findReaderByEmail(env: Env, email: string): Promise<ReaderUser | null> {
  return await env.DB.prepare('SELECT * FROM reader_users WHERE email = ? LIMIT 1')
    .bind(email)
    .first<ReaderUser>()
}

export async function findReaderById(env: Env, id: number): Promise<ReaderUser | null> {
  return await env.DB.prepare('SELECT * FROM reader_users WHERE id = ? LIMIT 1')
    .bind(id)
    .first<ReaderUser>()
}

// ============================================================================
// Entitlements Repository
// ============================================================================

export async function findActiveEntitlement(env: Env, readerUserId: number): Promise<Entitlement | null> {
  return await env.DB.prepare(`
    SELECT * FROM entitlements 
    WHERE reader_user_id = ? 
    AND status = 'active'
    AND (current_period_end IS NULL OR current_period_end > ?)
    ORDER BY id DESC
    LIMIT 1
  `).bind(readerUserId, new Date().toISOString()).first<Entitlement>()
}

export async function hasActiveSubscription(env: Env, readerUserId: number): Promise<boolean> {
  const entitlement = await findActiveEntitlement(env, readerUserId)
  return entitlement !== null
}

// ============================================================================
// Settings Repository
// ============================================================================

// In-memory cache to avoid KV/DB roundtrips within the same isolate
const settingsMemoryCache = new Map<string, { value: any; timestamp: number }>()
const MEMORY_CACHE_TTL = 30000 // 30 seconds
const KV_CACHE_TTL = 600 // 10 minutes in KV

export async function getSetting(env: Env, key: string, scope: 'public' | 'private' = 'public'): Promise<any> {
  const results = await getSettings(env, [key], scope)
  return results[key] ?? null
}

export async function getSettings(env: Env, keys: string[], scope: 'public' | 'private' = 'public'): Promise<Record<string, any>> {
  const results: Record<string, any> = {}
  const missingKeys: string[] = []

  // 1. Memory Cache Check
  for (const key of keys) {
    const cacheKey = `settings:${scope}:${key}`
    const memoized = settingsMemoryCache.get(cacheKey)
    if (memoized && (Date.now() - memoized.timestamp) < MEMORY_CACHE_TTL) {
      results[key] = memoized.value
    } else {
      missingKeys.push(key)
    }
  }

  if (missingKeys.length === 0) return results

  // 2. KV Cache Check (if available)
  if (env.KV) {
    const kvKeys = missingKeys.map(k => `settings:${scope}:${k}`)
    const kvResults = await Promise.all(kvKeys.map(k => env.KV.get(k)))
    
    const stillMissing: string[] = []
    kvResults.forEach((val, i) => {
      const originalKey = missingKeys[i]
      if (val) {
        try {
          const parsed = JSON.parse(val)
          results[originalKey] = parsed
          settingsMemoryCache.set(`settings:${scope}:${originalKey}`, { value: parsed, timestamp: Date.now() })
        } catch {
          stillMissing.push(originalKey)
        }
      } else {
        stillMissing.push(originalKey)
      }
    })

    if (stillMissing.length === 0) return results
    missingKeys.length = 0
    missingKeys.push(...stillMissing)
  }

  // 3. Database Fallback (Batch)
  if (missingKeys.length > 0) {
    const placeholders = missingKeys.map(() => '?').join(',')
    const query = `SELECT key, value_json FROM settings WHERE scope = ? AND key IN (${placeholders})`
    
    try {
      const dbResult = await env.DB.prepare(query)
        .bind(scope, ...missingKeys)
        .all<{ key: string; value_json: string }>()

      if (dbResult.results) {
        for (const row of dbResult.results) {
          try {
            const value = JSON.parse(row.value_json)
            results[row.key] = value
            
            const cacheKey = `settings:${scope}:${row.key}`
            settingsMemoryCache.set(cacheKey, { value, timestamp: Date.now() })
            if (env.KV) {
              env.KV.put(cacheKey, row.value_json, { expirationTtl: KV_CACHE_TTL }).catch(() => {})
            }
          } catch (e) {
            console.error(`[getSettings] JSON parse error for ${row.key}`, e)
          }
        }
      }
    } catch (error) {
      console.error('[getSettings] Database error', error)
    }
  }

  return results
}

export async function setSetting(
  env: Env,
  key: string,
  value: any,
  scope: 'public' | 'private' = 'public',
  userId?: number
): Promise<void> {
  const valueJson = JSON.stringify(value)

  await env.DB.prepare(`
    INSERT INTO settings (key, value_json, scope, updated_by_user_id, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      scope = excluded.scope,
      version = version + 1,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = datetime('now')
  `).bind(key, valueJson, scope, userId || null).run()

  // Invalidate cache
  const cacheKey = `settings:${scope}:${key}`
  settingsMemoryCache.delete(cacheKey)
  if (env.KV) await env.KV.delete(cacheKey)
}

// ============================================================================
// Audit Log
// ============================================================================

export async function logAudit(
  env: Env,
  params: {
    entityType: string
    entityId?: string | number
    action: string
    actorType: 'user' | 'system' | 'webhook'
    actorId?: string | number
    details?: any
    requestId?: string
    ipAddress?: string
    userAgent?: string
  }
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO audit_log (
      entity_type, entity_id, action, actor_type, actor_id,
      details_json, request_id, ip_address, user_agent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    params.entityType,
    params.entityId?.toString() || null,
    params.action,
    params.actorType,
    params.actorId?.toString() || null,
    params.details ? JSON.stringify(params.details) : null,
    params.requestId || null,
    params.ipAddress || null,
    params.userAgent || null
  ).run()
}

// ============================================================================
// Posts Admin Repository (import from dedicated module)
// ============================================================================

export * from './posts'

// ============================================================================
// Authors Repository (import from dedicated module)
// ============================================================================

export * from './authors'

// ============================================================================
// Media Repository (import from dedicated module)
// ============================================================================

export * from './media'
export * from './subscribers'
