/**
 * Posts Repository
 * CRUD + workflow operations
 */

import type { D1Database } from '@cloudflare/workers-types'
import { renderMarkdownToHtml, sanitizeHtml } from '../render/sanitize'
import { editorialDocumentHasText, renderEditorialDocumentToHtml, type EditorialContentFormat } from '../editorial-content'

// Simple in-memory cache for total counts to reduce D1 read costs
// This avoids expensive full table scans (COUNT(*)) on every admin list refresh
const totalCountCache = new Map<string, { count: number; expires: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export interface Post {
  id: number
  slug: string
  title: string
  hat: string | null
  excerpt: string | null
  content: string
  content_markdown: string | null // Markdown source (optional, for new editor)
  content_json: string | null
  content_format: EditorialContentFormat
  content_version: number
  category_id: number
  author_id: number
  cover_media_id: number | null
  status: 'draft' | 'review' | 'published' | 'archived'
  template: string

  // SEO
  seo_title: string | null
  seo_description: string | null
  seo_canonical: string | null
  seo_noindex: number

  // Paywall
  is_premium: number
  paywall_tier: string | null
  metering_exempt: number

  // Breaking
  breaking_until: string | null

  // Timestamps
  published_at: string | null
  scheduled_at: string | null
  is_live: number
  is_headline: number
  created_at: string
  updated_at: string

  // Joined
  category_name?: string
  author_name?: string
  author_avatar_url?: string
  cover_media_url?: string
  tags?: string[]
}

export interface PostFilters {
  status?: string
  category_id?: number
  author_id?: number
  is_premium?: number
  search?: string
  limit?: number
  offset?: number
  missing_cover?: boolean
  is_headline?: number
  slug?: string
  original_link?: string
  year?: number
  month?: number
  day?: number
  includeCount?: boolean // Optional: only count if requested to save D1 costs
}

export interface CreatePostInput {
  title: string
  hat?: string
  slug?: string
  excerpt?: string
  content: string
  content_markdown?: string
  content_json?: string
  category_id: number
  author_id: number
  cover_media_id?: number
  template?: string
  seo_title?: string
  seo_description?: string
  seo_canonical?: string
  seo_noindex?: number
  is_premium?: number
  paywall_tier?: string
  metering_exempt?: number
  is_live?: number
  is_headline?: number
  tags?: number[]
  original_link?: string
}

export interface UpdatePostInput {
  title?: string
  hat?: string
  slug?: string
  excerpt?: string
  content?: string
  content_markdown?: string
  content_json?: string
  expected_content_version?: number
  category_id?: number
  author_id?: number
  cover_media_id?: number
  template?: string
  seo_title?: string
  seo_description?: string
  seo_canonical?: string
  seo_noindex?: number
  is_premium?: number
  paywall_tier?: string
  metering_exempt?: number
  is_live?: number
  is_headline?: number
  breaking_until?: string
  tags?: number[]
}

/**
 * Gera slug único com sufixo incremental se necessário
 */
async function generateUniqueSlug(db: D1Database, baseSlug: string, excludeId?: number): Promise<string> {
  let slug = baseSlug
  let counter = 2

  while (true) {
    const query = excludeId
      ? 'SELECT id FROM posts WHERE slug = ? AND id != ? LIMIT 1'
      : 'SELECT id FROM posts WHERE slug = ? LIMIT 1'

    const stmt = db.prepare(query)

    const boundStmt = excludeId
      ? stmt.bind(slug, excludeId)
      : stmt.bind(slug)

    const existing = await boundStmt.first()

    if (!existing) return slug

    slug = `${baseSlug}-${counter}`
    counter++

    // Safety: max 100 tentativas
    if (counter > 100) throw new Error('Slug conflict: too many attempts')
  }
}

/**
 * Converte string para slug URL-safe
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^\w\s-]/g, '') // Remove especiais
    .replace(/\s+/g, '-') // Espaços → hífens
    .replace(/-+/g, '-') // Múltiplos hífens → único
    .replace(/^-|-$/g, '') // Remove hífens início/fim
}

/**
 * Lista posts com filtros e paginação
 */
export async function listPosts(db: D1Database, filters: PostFilters = {}): Promise<{ posts: Post[], total: number }> {
  const {
    status,
    category_id,
    author_id,
    is_premium,
    is_headline,
    search,
    missing_cover,
    slug,
    original_link,
    year,
    month,
    day,
    includeCount = false,
    limit = 20,
    offset = 0
  } = filters

  let whereConditions: string[] = []
  let params: any[] = []

  if (status) {
    whereConditions.push('p.status = ?')
    params.push(status)
  }

  if (category_id) {
    whereConditions.push('p.category_id = ?')
    params.push(category_id)
  }

  if (author_id) {
    whereConditions.push('p.author_id = ?')
    params.push(author_id)
  }

  if (is_premium !== undefined) {
    whereConditions.push('p.is_premium = ?')
    params.push(is_premium)
  }

  if (is_headline !== undefined) {
    whereConditions.push('p.is_headline = ?')
    params.push(is_headline)
  }

  if (missing_cover) {
    whereConditions.push('p.cover_media_id IS NULL')
  }

  if (slug) {
    whereConditions.push('p.slug = ?')
    params.push(slug)
  }

  if (original_link) {
    whereConditions.push('p.original_link = ?')
    params.push(original_link)
  }

  if (year) {
    whereConditions.push("strftime('%Y', p.created_at) = ?")
    params.push(String(year))
  }

  if (month) {
    const monthStr = String(month).padStart(2, '0')
    whereConditions.push("strftime('%m', p.created_at) = ?")
    params.push(monthStr)
  }

  if (day) {
    const dayStr = String(day).padStart(2, '0')
    whereConditions.push("strftime('%d', p.created_at) = ?")
    params.push(dayStr)
  }

  if (search) {
    // Optimization: If search is long (likely duplicate check), search ONLY title to avoid "LIKE pattern too complex"
    if (search.length > 30) {
      whereConditions.push('p.title LIKE ?')
      params.push(`%${search}%`)
    } else {
      whereConditions.push('(p.title LIKE ? OR p.hat LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ?)')
      const searchTerm = `%${search}%`
      params.push(searchTerm, searchTerm, searchTerm, searchTerm)
    }
  }

  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''

  // Count total (Disabled by default to save D1 reads)
  let total = 0
  if (includeCount) {
    const cacheKey = `count:${whereClause}:${params.join('|')}`
    const cached = totalCountCache.get(cacheKey)

    if (cached && cached.expires > Date.now()) {
      total = cached.count
    } else {
      const countResult = await db.prepare(
        `SELECT COUNT(*) as count FROM posts p ${whereClause}`
      ).bind(...params).first<{ count: number }>()
      total = countResult?.count || 0
      totalCountCache.set(cacheKey, { count: total, expires: Date.now() + CACHE_TTL_MS })
    }
  }

  // Get posts
  const query = `
    SELECT 
      p.*,
      c.name as category_name,
      a.name as author_name,
      ma.r2_key as author_avatar_url,
      m.r2_key as cover_media_url
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN authors a ON a.id = p.author_id
    LEFT JOIN media m ON m.id = p.cover_media_id
    LEFT JOIN media ma ON ma.id = a.avatar_media_id
    ${whereClause}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `

  const result = await db.prepare(query)
    .bind(...params, limit, offset)
    .all<Post>()

  return { posts: result.results || [], total }
}

/**
 * Busca post por ID
 */
export async function getPostById(db: D1Database, id: number): Promise<Post | null> {
  const post = await db.prepare(`
    SELECT 
      p.*,
      c.name as category_name,
      a.name as author_name,
      ma.r2_key as author_avatar_url,
      m.r2_key as cover_media_url
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN authors a ON a.id = p.author_id
    LEFT JOIN media m ON m.id = p.cover_media_id
    LEFT JOIN media ma ON ma.id = a.avatar_media_id
    WHERE p.id = ?
    LIMIT 1
  `).bind(id).first<Post>()

  if (!post) return null

  // Get tags
  const tagsResult = await db.prepare(`
    SELECT t.id, t.name
    FROM tags t
    INNER JOIN posts_tags pt ON pt.tag_id = t.id
    WHERE pt.post_id = ?
  `).bind(id).all<{ id: number, name: string }>()

  post.tags = tagsResult.results?.map(t => t.name) || []

  return post
}

/**
 * Busca post por slug
 */
export async function getPostBySlug(db: D1Database, slug: string): Promise<Post | null> {
  const post = await db.prepare(`
    SELECT 
      p.*,
      c.name as category_name,
      a.name as author_name,
      ma.r2_key as author_avatar_url,
      m.r2_key as cover_media_url
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN authors a ON a.id = p.author_id
    LEFT JOIN media m ON m.id = p.cover_media_id
    LEFT JOIN media ma ON ma.id = a.avatar_media_id
    WHERE p.slug = ?
    LIMIT 1
  `).bind(slug).first<Post>()

  if (!post) return null

  // Get tags
  const tagsResult = await db.prepare(`
    SELECT t.id, t.name
    FROM tags t
    INNER JOIN posts_tags pt ON pt.tag_id = t.id
    WHERE pt.post_id = ?
  `).bind(post.id).all<{ id: number, name: string }>()

  post.tags = tagsResult.results?.map(t => t.name) || []

  return post
}

/**
 * Cria post (sempre como draft)
 */
export async function createPost(db: D1Database, input: CreatePostInput): Promise<number> {
  const now = new Date().toISOString()

  // Gera slug único
  const baseSlug = input.slug || slugify(input.title)
  const slug = await generateUniqueSlug(db, baseSlug)

  const hasVisualContent = Boolean(input.content_json?.trim())
  const hasMarkdown = !hasVisualContent && input.content_markdown !== undefined && input.content_markdown !== null
  if (hasVisualContent && !editorialDocumentHasText(input.content_json!)) throw new Error('Conteúdo é obrigatório.')
  const contentHtml = hasVisualContent
    ? renderEditorialDocumentToHtml(input.content_json!)
    : hasMarkdown
      ? renderMarkdownToHtml(input.content_markdown || '')
      : sanitizeHtml(input.content)
  const contentMarkdownValue = hasMarkdown ? input.content_markdown : null
  const contentJsonValue = hasVisualContent ? input.content_json : null
  const contentFormat: EditorialContentFormat = hasVisualContent ? 'visual' : hasMarkdown ? 'markdown' : 'legacy'
  const hatValue = input.hat ? input.hat.trim().toUpperCase() : null
  const originalLink = input.original_link || null

  const bindValues = [
    input.title,
    hatValue,
    slug,
    input.excerpt || null,
    contentHtml,
    contentMarkdownValue,
    contentJsonValue,
    contentFormat,
    1,
    input.category_id,
    input.author_id,
    input.cover_media_id || null,
    input.template || 'article', // template defaults to article
    'draft', // status defaults to draft
    0, // views
    input.seo_title || null,
    input.seo_description || null,
    input.seo_canonical || null,
    input.seo_noindex || 0,
    input.is_premium || 0,
    input.paywall_tier || null,
    input.metering_exempt || 0,
    input.is_live || 0,
    input.is_headline || 0,
    originalLink, // original_link
    now, // created_at
    now // updated_at
  ]

  const result = await db.prepare(`
    INSERT INTO posts (
      title, hat, slug, excerpt, content, content_markdown, content_json, content_format, content_version,
      category_id, author_id, cover_media_id, template, status, views,
      seo_title, seo_description, seo_canonical, seo_noindex,
      is_premium, paywall_tier, metering_exempt, is_live, is_headline, original_link,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(...bindValues).run()

  const postId = result.meta.last_row_id

  if (!postId) {
    console.error('[createPost] ERROR: No post ID returned!', {
      success: result.success,
      meta: result.meta,
      input_title: input.title
    })
    throw new Error('Failed to create post: no ID returned')
  }

  console.log('[createPost] Post inserted successfully. ID:', postId)

  // Insert tags
  if (input.tags && input.tags.length > 0) {
    for (const tagId of input.tags) {
      await db.prepare(`
        INSERT INTO posts_tags (post_id, tag_id, created_at)
        VALUES (?, ?, ?)
      `).bind(postId, tagId, now).run()
    }
  }

  return postId
}

/**
 * Atualiza post
 */
export async function updatePost(db: D1Database, id: number, input: UpdatePostInput): Promise<void> {
  const now = new Date().toISOString()

  // Build dynamic UPDATE
  const fields: string[] = []
  const values: any[] = []

  if (input.title !== undefined) {
    fields.push('title = ?')
    values.push(input.title)
  }

  if (input.hat !== undefined) {
    const hatValue = input.hat ? input.hat.trim().toUpperCase() : null
    fields.push('hat = ?')
    values.push(hatValue)
  }

  if (input.slug !== undefined) {
    const uniqueSlug = await generateUniqueSlug(db, input.slug, id)
    fields.push('slug = ?')
    values.push(uniqueSlug)
  }

  if (input.excerpt !== undefined) {
    fields.push('excerpt = ?')
    values.push(input.excerpt || null)
  }

  if (input.content_json !== undefined) {
    if (!editorialDocumentHasText(input.content_json)) throw new Error('Conteúdo é obrigatório.')
    fields.push('content = ?')
    values.push(renderEditorialDocumentToHtml(input.content_json))
    fields.push('content_json = ?')
    values.push(input.content_json)
    fields.push('content_markdown = NULL')
    fields.push("content_format = 'visual'")
    fields.push('content_version = content_version + 1')
  } else if (input.content_markdown !== undefined) {
    const markdown = input.content_markdown || ''
    fields.push('content = ?')
    values.push(renderMarkdownToHtml(markdown))
    fields.push('content_markdown = ?')
    values.push(input.content_markdown)
    fields.push('content_json = NULL')
    fields.push("content_format = 'markdown'")
    fields.push('content_version = content_version + 1')
  } else if (input.content !== undefined) {
    fields.push('content = ?')
    values.push(sanitizeHtml(input.content))
    fields.push('content_json = NULL')
    fields.push('content_markdown = NULL')
    fields.push("content_format = 'legacy'")
    fields.push('content_version = content_version + 1')
  }

  if (input.category_id !== undefined) {
    fields.push('category_id = ?')
    values.push(input.category_id)
  }

  if (input.author_id !== undefined) {
    fields.push('author_id = ?')
    values.push(input.author_id)
  }

  if (input.cover_media_id !== undefined) {
    fields.push('cover_media_id = ?')
    values.push(input.cover_media_id || null)
  }

  if (input.template !== undefined) {
    fields.push('template = ?')
    values.push(input.template)
  }

  if (input.seo_title !== undefined) {
    fields.push('seo_title = ?')
    values.push(input.seo_title || null)
  }

  if (input.seo_description !== undefined) {
    fields.push('seo_description = ?')
    values.push(input.seo_description || null)
  }

  if (input.seo_canonical !== undefined) {
    fields.push('seo_canonical = ?')
    values.push(input.seo_canonical || null)
  }

  if (input.seo_noindex !== undefined) {
    fields.push('seo_noindex = ?')
    values.push(input.seo_noindex)
  }

  if (input.is_live !== undefined) {
    fields.push('is_live = ?')
    values.push(input.is_live)
  }

  if (input.is_headline !== undefined) {
    fields.push('is_headline = ?')
    values.push(input.is_headline)
  }

  if (input.is_premium !== undefined) {
    fields.push('is_premium = ?')
    values.push(input.is_premium)
  }

  if (input.paywall_tier !== undefined) {
    fields.push('paywall_tier = ?')
    values.push(input.paywall_tier || null)
  }

  if (input.metering_exempt !== undefined) {
    fields.push('metering_exempt = ?')
    values.push(input.metering_exempt)
  }

  if (input.breaking_until !== undefined) {
    fields.push('breaking_until = ?')
    values.push(input.breaking_until || null)
  }

  fields.push('updated_at = ?')
  values.push(now)

  if (fields.length > 0) {
    const where = input.expected_content_version !== undefined
      ? 'id = ? AND content_version = ?'
      : 'id = ?'
    const result = await db.prepare(
      `UPDATE posts SET ${fields.join(', ')} WHERE ${where}`
    ).bind(...values, id, ...(input.expected_content_version !== undefined ? [input.expected_content_version] : [])).run()
    if (input.expected_content_version !== undefined && (result.meta.changes || 0) === 0) {
      throw new Error('CONTENT_VERSION_CONFLICT')
    }
  }

  // Update tags
  if (input.tags !== undefined) {
    // Delete existing
    await db.prepare('DELETE FROM posts_tags WHERE post_id = ?').bind(id).run()

    // Insert new
    for (const tagId of input.tags) {
      await db.prepare(`
        INSERT INTO posts_tags (post_id, tag_id, created_at)
        VALUES (?, ?, ?)
      `).bind(id, tagId, now).run()
    }
  }
}

export interface PostRevision {
  id: number
  post_id: number
  title: string
  excerpt: string | null
  content: string
  content_json: string | null
  content_format: EditorialContentFormat
  content_version: number
  revision_type: 'manual' | 'autosave' | 'restore' | 'ai'
  changed_by_user_id: number
  changed_by_name?: string | null
  created_at: string
}

export async function createPostRevision(
  db: D1Database,
  post: Post,
  changedByUserId: number,
  revisionType: PostRevision['revision_type'] = 'manual'
): Promise<number> {
  const result = await db.prepare(`
    INSERT INTO post_revisions (
      post_id, title, excerpt, content, content_json, content_format,
      content_version, revision_type, changed_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    post.id, post.title, post.excerpt, post.content, post.content_json,
    post.content_format || 'legacy', post.content_version || 1, revisionType,
    changedByUserId, new Date().toISOString()
  ).run()
  return Number(result.meta.last_row_id || 0)
}

export async function listPostRevisions(db: D1Database, postId: number, limit = 12): Promise<PostRevision[]> {
  const result = await db.prepare(`
    SELECT r.*, u.name AS changed_by_name
    FROM post_revisions r
    LEFT JOIN users u ON u.id = r.changed_by_user_id
    WHERE r.post_id = ?
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ?
  `).bind(postId, Math.max(1, Math.min(50, limit))).all<PostRevision>()
  return result.results || []
}

export async function restorePostRevision(
  db: D1Database,
  postId: number,
  revisionId: number,
  changedByUserId: number
): Promise<void> {
  const [post, revision] = await Promise.all([
    getPostById(db, postId),
    db.prepare('SELECT * FROM post_revisions WHERE id = ? AND post_id = ? LIMIT 1')
      .bind(revisionId, postId).first<PostRevision>()
  ])
  if (!post || !revision) throw new Error('Revisão não encontrada.')
  await createPostRevision(db, post, changedByUserId, 'restore')
  await db.prepare(`
    UPDATE posts
    SET title = ?, excerpt = ?, content = ?, content_json = ?, content_markdown = NULL,
        content_format = ?, content_version = content_version + 1, updated_at = ?
    WHERE id = ?
  `).bind(
    revision.title,
    revision.excerpt,
    revision.content,
    revision.content_json,
    revision.content_json ? 'visual' : 'legacy',
    new Date().toISOString(),
    postId
  ).run()
}

export async function autosaveVisualPost(db: D1Database, input: {
  postId: number
  contentJson: string
  expectedVersion: number
  title: string
  hat?: string
  excerpt?: string
}): Promise<number> {
  if (!editorialDocumentHasText(input.contentJson)) throw new Error('Conteúdo é obrigatório.')
  const html = renderEditorialDocumentToHtml(input.contentJson)
  const result = await db.prepare(`
    UPDATE posts
    SET title = ?, hat = ?, excerpt = ?, content = ?, content_json = ?,
        content_markdown = NULL, content_format = 'visual',
        content_version = content_version + 1, updated_at = ?
    WHERE id = ? AND content_version = ?
  `).bind(
    input.title.trim().slice(0, 500),
    input.hat?.trim().toUpperCase().slice(0, 60) || null,
    input.excerpt?.trim().slice(0, 1_000) || null,
    html,
    input.contentJson,
    new Date().toISOString(),
    input.postId,
    input.expectedVersion
  ).run()
  if ((result.meta.changes || 0) === 0) throw new Error('CONTENT_VERSION_CONFLICT')
  return input.expectedVersion + 1
}

/**
 * Publica post
 */
export async function publishPost(db: D1Database, id: number): Promise<void> {
  const now = new Date().toISOString()

  await db.prepare(`
    UPDATE posts 
    SET status = 'published', published_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(now, now, id).run()
}

/**
 * Agenda post para publicação futura
 */
export async function schedulePost(db: D1Database, id: number, scheduledAt: string): Promise<void> {
  const now = new Date().toISOString()

  // Valida que scheduledAt é futuro
  if (new Date(scheduledAt) <= new Date()) {
    throw new Error('scheduled_at must be in the future')
  }

  await db.prepare(`
    UPDATE posts 
    SET status = 'published', scheduled_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(scheduledAt, now, id).run()
}

/**
 * Arquiva post
 */
export async function archivePost(db: D1Database, id: number): Promise<void> {
  const now = new Date().toISOString()

  await db.prepare(`
    UPDATE posts 
    SET status = 'archived', updated_at = ?
    WHERE id = ?
  `).bind(now, id).run()
}

/**
 * Deleta post
 */
export async function deletePost(db: D1Database, id: number): Promise<void> {
  // Production databases may contain historical rows created before all cascade
  // constraints were in place, so clear known dependents before deleting posts.
  await db.prepare('DELETE FROM posts_tags WHERE post_id = ?').bind(id).run()
  await db.prepare('DELETE FROM post_revisions WHERE post_id = ?').bind(id).run()
  await db.prepare('DELETE FROM live_blog_updates WHERE post_id = ?').bind(id).run()
  await db.prepare('DELETE FROM post_views WHERE post_id = ?').bind(id).run()
  await db.prepare('DELETE FROM paywall_views WHERE post_id = ?').bind(id).run()
  await db.prepare('DELETE FROM liveblog_entries WHERE liveblog_id IN (SELECT id FROM liveblogs WHERE post_id = ?)').bind(id).run()
  await db.prepare('DELETE FROM liveblogs WHERE post_id = ?').bind(id).run()
  await db.prepare('DELETE FROM hub_blocks WHERE hub_id IN (SELECT id FROM hubs WHERE post_id = ?)').bind(id).run()
  await db.prepare('DELETE FROM hubs WHERE post_id = ?').bind(id).run()
  await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run()
}
