/**
 * Authors Repository
 * Gerencia autores do jornal (authors table)
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
}

/**
 * Lista todos os autores ativos
 */
export async function listActiveAuthors(env: Env): Promise<Author[]> {
  const result = await env.DB.prepare(`
    SELECT 
      id, slug, name, bio, avatar_media_id, email,
      social_twitter, social_instagram, social_linkedin,
      is_active, created_at, updated_at
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
      is_active, created_at, updated_at
    FROM authors
    WHERE email = ?
    LIMIT 1
  `).bind(email).first<Author>()
  
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
      is_active, created_at, updated_at
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
      is_active, created_at, updated_at
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
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    data.slug,
    data.name,
    data.bio || null,
    data.avatar_media_id || null,
    data.email || null,
    data.social_twitter || null,
    data.social_instagram || null,
    data.social_linkedin || null,
    data.is_active ?? 1
  ).run()
  
  if (!result.success || !result.meta.last_row_id) {
    throw new Error('Failed to create author')
  }
  
  return result.meta.last_row_id
}

/**
 * Garante que existe um autor para o usuário admin logado
 * Se não existir, cria automaticamente usando o email
 */
export async function ensureAuthorForAdminUser(env: Env, adminUser: AdminUser): Promise<Author | null> {
  if (!adminUser.email) {
    return null
  }
  
  // Tenta buscar autor existente pelo email
  let author = await findAuthorByEmail(env, adminUser.email)
  
  if (author) {
    return author
  }
  
  // Não existe, cria novo autor
  // Nome: usa adminUser.name se existir, senão usa parte antes do @
  const name = adminUser.name || adminUser.email.split('@')[0]
  
  // Gera slug único
  const slug = await generateUniqueSlug(env, name)
  
  // Cria o autor
  const authorId = await createAuthor(env, {
    slug,
    name,
    email: adminUser.email,
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
