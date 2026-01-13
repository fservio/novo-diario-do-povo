/**
 * Authors Repository
 * Gerencia autores do jornal (authors table)
 * 
 * ROLE-BASED PERMISSIONS (definidas em users.role):
 * 
 * - 'redator': 
 *   • Pode criar posts como draft
 *   • NÃO pode publicar posts
 *   • NÃO pode editar posts de outros
 *   • Apenas leitura em categorias
 * 
 * - 'editor':
 *   • Pode criar, editar e publicar posts
 *   • Pode editar posts de outros autores
 *   • Pode gerenciar tags
 *   • Apenas leitura em categorias
 * 
 * - 'diretor':
 *   • Todas as permissões de editor
 *   • Pode criar/editar/excluir categorias
 *   • Pode gerenciar autores
 *   • Acesso a analytics
 * 
 * - 'admin':
 *   • Acesso total (superuser)
 *   • Pode gerenciar users
 *   • Pode acessar settings
 *   • Pode gerenciar ads/paywall
 * 
 * IMPORTANTE: Todo user automaticamente tem um author vinculado (user_id).
 * Autores "editoriais" (Redação, Colunista) não têm user_id (null).
 */

import type { Env } from '../types'
import type { AdminUser } from '../types'

export interface Author {
  id: number
  slug: string
  name: string
  bio: string | null
  avatar_media_id: number | null
  email: string | null
  social_twitter: string | null
  social_instagram: string | null
  social_linkedin: string | null
  is_active: number
  is_columnist: number
  column_name: string | null
  column_description: string | null
  user_id: number | null
  created_at: string
  updated_at: string
}

export interface CreateAuthorInput {
  slug: string
  name: string
  bio?: string | null
  avatar_media_id?: number | null
  email?: string | null
  social_twitter?: string | null
  social_instagram?: string | null
  social_linkedin?: string | null
  is_active?: number
  is_columnist?: number
  column_name?: string | null
  column_description?: string | null
  user_id?: number | null
}

export interface UpdateAuthorInput {
  slug?: string
  name?: string
  bio?: string | null
  avatar_media_id?: number | null
  email?: string | null
  social_twitter?: string | null
  social_instagram?: string | null
  social_linkedin?: string | null
  is_active?: number
  is_columnist?: number
  column_name?: string | null
  column_description?: string | null
  user_id?: number | null
}

/**
 * Lista todos os autores ativos
 */
export async function listActiveAuthors(env: Env): Promise<Author[]> {
  const result = await env.DB.prepare(`
    SELECT 
      id, slug, name, bio, avatar_media_id, email,
      social_twitter, social_instagram, social_linkedin,
      is_active, is_columnist, column_name, column_description,
      user_id, created_at, updated_at
    FROM authors
    WHERE is_active = 1
    ORDER BY name ASC
  `).all<Author>()

  return result.results || []
}

/**
 * Busca autor por email
 */
export async function findAuthorByEmail(env: Env, email: string): Promise<Author | null> {
  const result = await env.DB.prepare(`
    SELECT 
      id, slug, name, bio, avatar_media_id, email,
      social_twitter, social_instagram, social_linkedin,
      is_active, is_columnist, column_name, column_description,
      user_id, created_at, updated_at
    FROM authors
    WHERE email = ?
    LIMIT 1
  `).bind(email).first<Author>()

  return result || null
}

/**
 * Busca autor por user_id
 */
export async function findAuthorByUserId(env: Env, userId: number): Promise<Author | null> {
  const result = await env.DB.prepare(`
    SELECT 
      id, slug, name, bio, avatar_media_id, email,
      social_twitter, social_instagram, social_linkedin,
      is_active, is_columnist, column_name, column_description,
      user_id, created_at, updated_at
    FROM authors
    WHERE user_id = ?
    LIMIT 1
  `).bind(userId).first<Author>()

  return result || null
}

/**
 * Busca autor por slug
 */
export async function findAuthorBySlug(env: Env, slug: string): Promise<Author | null> {
  const result = await env.DB.prepare(`
    SELECT 
      id, slug, name, bio, avatar_media_id, email,
      social_twitter, social_instagram, social_linkedin,
      is_active, is_columnist, column_name, column_description,
      user_id, created_at, updated_at
    FROM authors
    WHERE slug = ?
    LIMIT 1
  `).bind(slug).first<Author>()

  return result || null
}

/**
 * Busca autor por ID
 */
export async function findAuthorById(env: Env, id: number): Promise<Author | null> {
  const result = await env.DB.prepare(`
    SELECT 
      id, slug, name, bio, avatar_media_id, email,
      social_twitter, social_instagram, social_linkedin,
      is_active, is_columnist, column_name, column_description,
      user_id, created_at, updated_at
    FROM authors
    WHERE id = ?
    LIMIT 1
  `).bind(id).first<Author>()

  return result || null
}

/**
 * Gera slug único para autor
 */
async function generateUniqueSlug(env: Env, baseName: string): Promise<string> {
  // Slugify: lowercase, remove acentos, substitui espaços/especiais por -
  const baseSlug = baseName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') // remove - do início/fim
    || 'autor' // fallback se ficar vazio

  // Tenta slug base primeiro
  const existing = await findAuthorBySlug(env, baseSlug)
  if (!existing) {
    return baseSlug
  }

  // Se já existe, adiciona sufixo numérico
  let counter = 2
  while (counter < 100) {
    const candidateSlug = `${baseSlug}-${counter}`
    const exists = await findAuthorBySlug(env, candidateSlug)
    if (!exists) {
      return candidateSlug
    }
    counter++
  }

  // Fallback: adiciona timestamp
  return `${baseSlug}-${Date.now()}`
}

/**
 * Cria um novo autor
 */
export async function createAuthor(env: Env, data: CreateAuthorInput): Promise<number> {
  const result = await env.DB.prepare(`
    INSERT INTO authors (
      slug, name, bio, avatar_media_id, email,
      social_twitter, social_instagram, social_linkedin,
      is_active, is_columnist, column_name, column_description,
      user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    data.slug,
    data.name,
    data.bio || null,
    data.avatar_media_id || null,
    data.email || null,
    data.social_twitter || null,
    data.social_instagram || null,
    data.social_linkedin || null,
    data.is_active ?? 1,
    data.is_columnist ?? 0,
    data.column_name || null,
    data.column_description || null,
    data.user_id || null
  ).run()

  if (!result.success || !result.meta.last_row_id) {
    throw new Error('Failed to create author')
  }

  return result.meta.last_row_id
}

/**
 * Atualiza um autor existente
 */
export async function updateAuthor(env: Env, id: number, data: UpdateAuthorInput): Promise<void> {
  const fields: string[] = []
  const values: any[] = []

  if (data.slug !== undefined) {
    fields.push('slug = ?')
    values.push(data.slug)
  }

  if (data.name !== undefined) {
    fields.push('name = ?')
    values.push(data.name)
  }

  if (data.bio !== undefined) {
    fields.push('bio = ?')
    values.push(data.bio)
  }

  if (data.avatar_media_id !== undefined) {
    fields.push('avatar_media_id = ?')
    values.push(data.avatar_media_id)
  }

  if (data.email !== undefined) {
    fields.push('email = ?')
    values.push(data.email)
  }

  if (data.social_twitter !== undefined) {
    fields.push('social_twitter = ?')
    values.push(data.social_twitter)
  }

  if (data.social_instagram !== undefined) {
    fields.push('social_instagram = ?')
    values.push(data.social_instagram)
  }

  if (data.social_linkedin !== undefined) {
    fields.push('social_linkedin = ?')
    values.push(data.social_linkedin)
  }

  if (data.is_active !== undefined) {
    fields.push('is_active = ?')
    values.push(data.is_active)
  }

  if (data.is_columnist !== undefined) {
    fields.push('is_columnist = ?')
    values.push(data.is_columnist)
  }

  if (data.column_name !== undefined) {
    fields.push('column_name = ?')
    values.push(data.column_name)
  }

  if (data.column_description !== undefined) {
    fields.push('column_description = ?')
    values.push(data.column_description)
  }

  if (data.user_id !== undefined) {
    fields.push('user_id = ?')
    values.push(data.user_id)
  }

  if (fields.length === 0) {
    return
  }

  fields.push("updated_at = datetime('now')")

  await env.DB.prepare(`
    UPDATE authors 
    SET ${fields.join(', ')}
    WHERE id = ?
  `).bind(...values, id).run()
}

/**
 * Garante que existe um autor para o usuário admin logado
 * Usa user_id como vínculo principal (mais robusto que email)
 */
export async function ensureAuthorForAdminUser(env: Env, adminUser: AdminUser): Promise<Author | null> {
  if (!adminUser.id) {
    return null
  }

  // Tenta buscar autor existente pelo user_id
  let author = await findAuthorByUserId(env, adminUser.id)

  if (author) {
    return author
  }

  // Não existe, cria novo autor vinculado ao user
  // Nome: usa adminUser.name se existir, senão usa email antes do @
  const name = adminUser.name || (adminUser.email ? adminUser.email.split('@')[0] : `User${adminUser.id}`)

  // Gera slug único
  const slug = await generateUniqueSlug(env, name)

  // Cria o autor
  const authorId = await createAuthor(env, {
    slug,
    name,
    email: adminUser.email || null,
    user_id: adminUser.id,
    is_active: 1
  })

  // Busca o autor recém-criado
  author = await findAuthorById(env, authorId)

  return author
}

/**
 * Garante que existe um autor "Redação" (fallback editorial)
 */
export async function ensureDefaultRedacao(env: Env): Promise<Author> {
  const slug = 'redacao'

  // Tenta buscar
  let redacao = await findAuthorBySlug(env, slug)

  if (redacao) {
    return redacao
  }

  // Não existe, cria
  const authorId = await createAuthor(env, {
    slug: 'redacao',
    name: 'Redação',
    email: null,
    is_active: 1
  })

  redacao = await findAuthorById(env, authorId)

  if (!redacao) {
    throw new Error('Failed to create default Redacao author')
  }

  return redacao
}

/**
 * Valida se um autor existe e está ativo
 */
export async function validateAuthorId(env: Env, authorId: number): Promise<boolean> {
  const author = await findAuthorById(env, authorId)
  return author !== null && author.is_active === 1
}
