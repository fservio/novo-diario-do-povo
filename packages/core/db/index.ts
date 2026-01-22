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
    AND p.published_at <= datetime('now')
  `
  const bindings: any[] = []

  if (filters.categoryId) {
    query += ' AND p.category_id = ?'
    bindings.push(filters.categoryId)
  }

  if (filters.tagId) {
    query += ` AND p.id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)`
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
    AND p.published_at <= datetime('now')
  `
  const bindings: any[] = []

  if (filters.categoryId) {
    query += ' AND p.category_id = ?'
    bindings.push(filters.categoryId)
  }

  if (filters.tagId) {
    query += ` AND p.id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)`
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
    INNER JOIN post_tags pt ON pt.tag_id = t.id
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
    AND (current_period_end IS NULL OR current_period_end > datetime('now'))
    ORDER BY id DESC
    LIMIT 1
  `).bind(readerUserId).first<Entitlement>()
}

export async function hasActiveSubscription(env: Env, readerUserId: number): Promise<boolean> {
  const entitlement = await findActiveEntitlement(env, readerUserId)
  return entitlement !== null
}

// ============================================================================
// Settings Repository
// ============================================================================

export async function getSetting(env: Env, key: string, scope: 'public' | 'private' = 'public'): Promise<any> {
  // Try cache first
  const cacheKey = `settings:${scope}:${key}`
  const cached = await env.KV.get(cacheKey)

  if (cached) {
    return JSON.parse(cached)
  }

  // Fetch from DB
  const result = await env.DB.prepare('SELECT value_json FROM settings WHERE key = ? AND scope = ?')
    .bind(key, scope)
    .first<{ value_json: string }>()

  if (!result) return null

  const value = JSON.parse(result.value_json)

  // Cache for 5 minutes
  await env.KV.put(cacheKey, result.value_json, { expirationTtl: 300 })

  return value
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
  await env.KV.delete(cacheKey)
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
