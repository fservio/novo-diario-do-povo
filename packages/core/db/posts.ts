/**
 * Posts Repository
 * CRUD + workflow operations
 */

import type { D1Database } from '@cloudflare/workers-types'

export interface Post {
  id: number
  slug: string
  title: string
  excerpt: string | null
  content: string
  content_markdown: string | null // Markdown source (optional, for new editor)
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
  created_at: string
  updated_at: string
  
  // Joined
  category_name?: string
  author_name?: string
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
}

export interface CreatePostInput {
  title: string
  slug?: string
  excerpt?: string
  content: string
  content_markdown?: string
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
  tags?: number[]
}

export interface UpdatePostInput {
  title?: string
  slug?: string
  excerpt?: string
  content?: string
  content_markdown?: string
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
    const existing = await db.prepare(
      excludeId 
        ? 'SELECT id FROM posts WHERE slug = ? AND id != ? LIMIT 1'
        : 'SELECT id FROM posts WHERE slug = ? LIMIT 1'
    )
    .bind(excludeId ? slug : slug, excludeId || slug)
    .first()
    
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
    search,
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
  
  if (search) {
    whereConditions.push('(p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ?)')
    const searchTerm = `%${search}%`
    params.push(searchTerm, searchTerm, searchTerm)
  }
  
  const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : ''
  
  // Count total
  const countResult = await db.prepare(
    `SELECT COUNT(*) as count FROM posts p ${whereClause}`
  ).bind(...params).first<{ count: number }>()
  
  const total = countResult?.count || 0
  
  // Get posts
  const query = `
    SELECT 
      p.*,
      c.name as category_name,
      a.name as author_name,
      m.r2_key as cover_media_url
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN authors a ON a.id = p.author_id
    LEFT JOIN media m ON m.id = p.cover_media_id
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
      m.r2_key as cover_media_url
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN authors a ON a.id = p.author_id
    LEFT JOIN media m ON m.id = p.cover_media_id
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
      m.r2_key as cover_media_url
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN authors a ON a.id = p.author_id
    LEFT JOIN media m ON m.id = p.cover_media_id
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
  
  const result = await db.prepare(`
    INSERT INTO posts (
      slug, title, excerpt, content, category_id, author_id, cover_media_id,
      status, template,
      seo_title, seo_description, seo_canonical, seo_noindex,
      is_premium, paywall_tier, metering_exempt,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    slug,
    input.title,
    input.excerpt || null,
    input.content,
    input.category_id,
    input.author_id,
    input.cover_media_id || null,
    'draft',  // status sempre 'draft' ao criar
    input.template || 'article',
    input.seo_title || null,
    input.seo_description || null,
    input.seo_canonical || null,
    input.seo_noindex || 0,
    input.is_premium || 0,
    input.paywall_tier || null,
    input.metering_exempt || 0,
    now,
    now
  ).run()
  
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
  
  if (input.slug !== undefined) {
    const uniqueSlug = await generateUniqueSlug(db, input.slug, id)
    fields.push('slug = ?')
    values.push(uniqueSlug)
  }
  
  if (input.excerpt !== undefined) {
    fields.push('excerpt = ?')
    values.push(input.excerpt || null)
  }
  
  if (input.content !== undefined) {
    fields.push('content = ?')
    values.push(input.content)
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
    await db.prepare(
      `UPDATE posts SET ${fields.join(', ')} WHERE id = ?`
    ).bind(...values, id).run()
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
  // Tags serão deletadas automaticamente (CASCADE)
  await db.prepare('DELETE FROM posts WHERE id = ?').bind(id).run()
}
