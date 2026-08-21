/**
 * Staff Users Repository
 * Gerenciamento de usuários do CMS (director, editor, writer)
 */

import type { Env } from '../types'
import { hashPassword } from '../auth/password'
import { ensureAuthorForAdminUser } from './authors'

// ============================================================================
// Types
// ============================================================================

export interface StaffUser {
  id: number
  email: string
  name: string
  role: 'director' | 'editor' | 'writer' | 'admin' // 'admin' legacy = 'director'
  is_active: number
  must_change_password: number
  last_login_at: string | null
  created_at: string
  updated_at: string
  author_id?: number | null
  author_name?: string | null
  author_is_active?: number | null
}

export interface StaffUserReferenceSummary {
  total: number
  resources: Array<{ label: string; count: number }>
}

export interface CreateStaffUserPayload {
  email: string
  password: string
  name: string
  role: 'director' | 'editor' | 'writer'
  must_change_password?: boolean
}

export interface UpdateStaffUserPayload {
  email?: string
  name?: string
  role?: 'director' | 'editor' | 'writer'
}

export interface ListStaffUsersFilters {
  q?: string // search query (email or name)
  role?: 'director' | 'editor' | 'writer' | 'admin'
  active?: boolean
  limit?: number
  offset?: number
}

// ============================================================================
// Role Utilities
// ============================================================================

/**
 * Get role rank (higher = more permissions)
 */
export function roleRank(role: string): number {
  const normalized = normalizeRole(role)
  switch (normalized) {
    case 'director': return 3
    case 'editor': return 2
    case 'writer': return 1
    default: return 0
  }
}

/**
 * Normalize role (admin -> director)
 */
export function normalizeRole(role: string): 'director' | 'editor' | 'writer' {
  if (role === 'admin') return 'director'
  if (role === 'director' || role === 'editor' || role === 'writer') return role
  return 'writer' // fallback
}

/**
 * Check if user has at least the required role
 */
export function hasRole(userRole: string, requiredRole: 'director' | 'editor' | 'writer'): boolean {
  return roleRank(userRole) >= roleRank(requiredRole)
}

// ============================================================================
// Repository
// ============================================================================

/**
 * List staff users with filters
 */
export async function listStaffUsers(
  env: Env,
  filters: ListStaffUsersFilters = {}
): Promise<StaffUser[]> {
  let query = `
    SELECT u.*, a.id AS author_id, a.name AS author_name, a.is_active AS author_is_active
    FROM users u
    LEFT JOIN authors a ON a.user_id = u.id
    WHERE 1=1
  `
  const bindings: any[] = []

  // Filter by search query
  if (filters.q) {
    query += ' AND (u.email LIKE ? OR u.name LIKE ?)'
    const searchPattern = `%${filters.q}%`
    bindings.push(searchPattern, searchPattern)
  }

  // Filter by role
  if (filters.role) {
    if (normalizeRole(filters.role) === 'director') {
      query += " AND u.role IN ('director', 'admin')"
    } else {
      query += ' AND u.role = ?'
      bindings.push(filters.role)
    }
  }

  // Filter by active status
  if (filters.active !== undefined) {
    query += ' AND u.is_active = ?'
    bindings.push(filters.active ? 1 : 0)
  }

  // Order by created_at DESC
  query += ' ORDER BY u.is_active DESC, u.name COLLATE NOCASE ASC'

  // Pagination
  if (filters.limit) {
    query += ' LIMIT ?'
    bindings.push(filters.limit)
  }

  if (filters.offset) {
    query += ' OFFSET ?'
    bindings.push(filters.offset)
  }

  const stmt = env.DB.prepare(query)
  const result = await stmt.bind(...bindings).all<StaffUser>()
  return result.results || []
}

/**
 * Get staff user by ID
 */
export async function getStaffUserById(env: Env, id: number): Promise<StaffUser | null> {
  const stmt = env.DB.prepare(`
    SELECT u.*, a.id AS author_id, a.name AS author_name, a.is_active AS author_is_active
    FROM users u
    LEFT JOIN authors a ON a.user_id = u.id
    WHERE u.id = ?
    LIMIT 1
  `)
  return await stmt.bind(id).first<StaffUser>()
}

/**
 * Get staff user by email
 */
export async function getStaffUserByEmail(env: Env, email: string): Promise<StaffUser | null> {
  const stmt = env.DB.prepare('SELECT * FROM users WHERE email = ?')
  return await stmt.bind(email).first<StaffUser>()
}

/**
 * Create staff user
 */
export async function createStaffUser(
  env: Env,
  payload: CreateStaffUserPayload,
  createdByUserId: number
): Promise<number> {
  // Hash password
  const passwordHash = await hashPassword(payload.password)
  
  // Insert user
  const stmt = env.DB.prepare(`
    INSERT INTO users (
      email, 
      password_hash, 
      name, 
      role, 
      must_change_password,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  
  const now = new Date().toISOString()
  const result = await stmt.bind(
    payload.email.toLowerCase().trim(),
    passwordHash,
    payload.name.trim(),
    payload.role,
    payload.must_change_password ? 1 : 0,
    now,
    now
  ).run()

  const userId = result.meta.last_row_id

  await ensureAuthorForAdminUser(env, {
    id: userId,
    email: payload.email.toLowerCase().trim(),
    name: payload.name.trim(),
    role: payload.role,
    is_active: 1,
  })

  // Log audit
  await logAudit(env, {
    user_id: createdByUserId,
    action: 'staff.create',
    resource_type: 'user',
    resource_id: userId,
    details: JSON.stringify({
      email: payload.email,
      name: payload.name,
      role: payload.role,
    }),
  })

  return userId
}

/**
 * Update staff user
 */
export async function updateStaffUser(
  env: Env,
  id: number,
  patch: UpdateStaffUserPayload,
  updatedByUserId: number
): Promise<void> {
  const currentUser = await getStaffUserById(env, id)
  if (!currentUser) throw new Error('Usuário não encontrado.')

  if (
    patch.role !== undefined &&
    normalizeRole(currentUser.role) === 'director' &&
    normalizeRole(patch.role) !== 'director' &&
    currentUser.is_active === 1
  ) {
    await assertAnotherActiveDirector(env, id, 'Não é possível rebaixar o último diretor ativo.')
  }

  const updates: string[] = []
  const bindings: any[] = []

  if (patch.email !== undefined) {
    updates.push('email = ?')
    bindings.push(patch.email.toLowerCase().trim())
  }

  if (patch.name !== undefined) {
    updates.push('name = ?')
    bindings.push(patch.name.trim())
  }

  if (patch.role !== undefined) {
    updates.push('role = ?')
    bindings.push(patch.role)
  }

  if (updates.length === 0) return

  updates.push('updated_at = ?')
  bindings.push(new Date().toISOString())
  bindings.push(id)

  const stmt = env.DB.prepare(`
    UPDATE users 
    SET ${updates.join(', ')}
    WHERE id = ?
  `)

  await stmt.bind(...bindings).run()

  if (patch.email !== undefined || patch.name !== undefined) {
    const authorUpdates: string[] = []
    const authorBindings: unknown[] = []
    if (patch.email !== undefined) {
      authorUpdates.push('email = ?')
      authorBindings.push(patch.email.toLowerCase().trim())
    }
    if (patch.name !== undefined) {
      authorUpdates.push('name = ?')
      authorBindings.push(patch.name.trim())
    }
    if (authorUpdates.length > 0) {
      await env.DB.prepare(`UPDATE authors SET ${authorUpdates.join(', ')}, updated_at = datetime('now') WHERE user_id = ?`)
        .bind(...authorBindings, id).run()
    }
  }

  // Log audit
  await logAudit(env, {
    user_id: updatedByUserId,
    action: 'staff.update',
    resource_type: 'user',
    resource_id: id,
    details: JSON.stringify(patch),
  })
}

/**
 * Set staff password
 */
export async function setStaffPassword(
  env: Env,
  id: number,
  newPassword: string,
  resetByUserId: number
): Promise<void> {
  const passwordHash = await hashPassword(newPassword)
  
  const stmt = env.DB.prepare(`
    UPDATE users 
    SET password_hash = ?, must_change_password = 1, updated_at = ?
    WHERE id = ?
  `)

  await stmt.bind(passwordHash, new Date().toISOString(), id).run()

  // Log audit
  await logAudit(env, {
    user_id: resetByUserId,
    action: 'staff.reset_password',
    resource_type: 'user',
    resource_id: id,
    details: JSON.stringify({ reset_by: resetByUserId }),
  })
}

/**
 * Set staff active status
 */
export async function setStaffActive(
  env: Env,
  id: number,
  active: boolean,
  changedByUserId: number
): Promise<void> {
  const user = await getStaffUserById(env, id)
  if (!user) throw new Error('Usuário não encontrado.')

  if (!active && id === changedByUserId) {
    throw new Error('Você não pode desativar o próprio acesso.')
  }

  // Check: Don't allow disabling the last director
  if (!active) {
    if (normalizeRole(user.role) === 'director') {
      await assertAnotherActiveDirector(env, id, 'Não é possível desativar o último diretor ativo.')
    }
  }

  const stmt = env.DB.prepare(`
    UPDATE users 
    SET is_active = ?, updated_at = ?
    WHERE id = ?
  `)

  await stmt.bind(active ? 1 : 0, new Date().toISOString(), id).run()

  // Log audit
  await logAudit(env, {
    user_id: changedByUserId,
    action: active ? 'staff.enable' : 'staff.disable',
    resource_type: 'user',
    resource_id: id,
    details: JSON.stringify({ active }),
  })
}

const STAFF_USER_REFERENCE_TABLES = [
  { table: 'post_revisions', column: 'changed_by_user_id', label: 'revisões de matérias' },
  { table: 'settings', column: 'updated_by_user_id', label: 'configurações' },
  { table: 'media', column: 'uploaded_by_user_id', label: 'arquivos de mídia' },
  { table: 'newsletter_campaigns', column: 'created_by_user_id', label: 'newsletters' },
  { table: 'instagram_publications', column: 'created_by_user_id', label: 'publicações sociais' },
  { table: 'editorial_ai_sources', column: 'created_by_user_id', label: 'fontes da Redação IA' },
  { table: 'editorial_ai_workspaces', column: 'created_by_user_id', label: 'pautas da Redação IA' },
  { table: 'editorial_ai_workspaces', column: 'assigned_editor_user_id', label: 'pautas atribuídas' },
  { table: 'editorial_ai_workspaces', column: 'approved_by_user_id', label: 'aprovações editoriais' },
  { table: 'editorial_ai_materials', column: 'created_by_user_id', label: 'materiais editoriais' },
  { table: 'editorial_ai_runs', column: 'requested_by_user_id', label: 'execuções de IA' },
  { table: 'editorial_ai_revisions', column: 'created_by_user_id', label: 'revisões de IA' },
  { table: 'editorial_ai_claims', column: 'reviewer_user_id', label: 'checagens editoriais' },
] as const

/** Retorna os vínculos que exigem preservar a conta para auditoria. */
export async function getStaffUserReferenceSummary(env: Env, id: number): Promise<StaffUserReferenceSummary> {
  const existing = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>()
  const existingNames = new Set((existing.results || []).map(row => row.name))
  const applicable = STAFF_USER_REFERENCE_TABLES.filter(item => existingNames.has(item.table))
  const resources: Array<{ label: string; count: number }> = []

  for (const item of applicable) {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${item.table} WHERE ${item.column} = ?`)
      .bind(id).first<{ count: number }>()
    const count = Number(row?.count || 0)
    if (count > 0) resources.push({ label: item.label, count })
  }

  return {
    total: resources.reduce((sum, item) => sum + item.count, 0),
    resources,
  }
}

/** Exclui somente contas sem histórico; autoria e conteúdo permanecem intactos. */
export async function deleteStaffUser(env: Env, id: number, deletedByUserId: number): Promise<void> {
  if (id === deletedByUserId) throw new Error('Você não pode excluir a própria conta.')

  const user = await getStaffUserById(env, id)
  if (!user) throw new Error('Usuário não encontrado.')
  if (normalizeRole(user.role) === 'director' && user.is_active === 1) {
    await assertAnotherActiveDirector(env, id, 'Não é possível excluir o último diretor ativo.')
  }

  const references = await getStaffUserReferenceSummary(env, id)
  if (references.total > 0) {
    const details = references.resources.map(item => `${item.count} ${item.label}`).join(', ')
    throw new Error(`Esta conta possui histórico editorial (${details}). Desative o acesso para preservar a auditoria.`)
  }

  await env.DB.batch([
    env.DB.prepare("UPDATE authors SET user_id = NULL, updated_at = datetime('now') WHERE user_id = ?").bind(id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ])

  await logAudit(env, {
    user_id: deletedByUserId,
    action: 'staff.delete',
    resource_type: 'user',
    resource_id: id,
    details: JSON.stringify({ email: user.email, name: user.name }),
  })
}

async function assertAnotherActiveDirector(env: Env, excludedId: number, message: string): Promise<void> {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM users
    WHERE role IN ('director', 'admin') AND is_active = 1 AND id <> ?
  `).bind(excludedId).first<{ count: number }>()
  if (Number(row?.count || 0) === 0) throw new Error(message)
}

/**
 * Update last login timestamp
 */
export async function updateLastLogin(env: Env, userId: number): Promise<void> {
  const stmt = env.DB.prepare(`
    UPDATE users 
    SET last_login_at = ?
    WHERE id = ?
  `)
  
  await stmt.bind(new Date().toISOString(), userId).run()
}

/**
 * Ensure at least one director exists (safety check)
 */
export async function ensureAtLeastOneDirectorRule(env: Env): Promise<boolean> {
  const directors = await listStaffUsers(env, { role: 'director', active: true })
  return directors.length > 0
}

/**
 * Count staff users by role
 */
export async function countStaffByRole(env: Env): Promise<Record<string, number>> {
  const stmt = env.DB.prepare(`
    SELECT role, COUNT(*) as count 
    FROM users 
    WHERE is_active = 1 
    GROUP BY role
  `)
  
  const result = await stmt.all<{ role: string; count: number }>()
  const counts: Record<string, number> = {}
  
  for (const row of result.results || []) {
    counts[row.role] = row.count
  }
  
  return counts
}

// ============================================================================
// Audit Log Helper
// ============================================================================

interface AuditLogEntry {
  user_id: number
  action: string
  resource_type: string
  resource_id: number | string
  details: string
}

async function logAudit(env: Env, entry: AuditLogEntry): Promise<void> {
  try {
    const tables = await env.DB.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('audit_log', 'audit_logs')
    `).all<{ name: string }>()
    const names = new Set((tables.results || []).map(row => row.name))
    const now = new Date().toISOString()

    if (names.has('audit_log')) {
      await env.DB.prepare(`
        INSERT INTO audit_log (entity_type, entity_id, action, actor_type, actor_id, details_json, created_at)
        VALUES (?, ?, ?, 'user', ?, ?, ?)
      `).bind(entry.resource_type, String(entry.resource_id), entry.action, String(entry.user_id), entry.details, now).run()
      return
    }

    if (names.has('audit_logs')) {
      await env.DB.prepare(`
        INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(entry.user_id, entry.action, entry.resource_type, entry.resource_id, entry.details, now).run()
    }
  } catch (error) {
    console.error('[Audit] Failed to log:', error)
    // Don't throw - audit failures shouldn't block operations
  }
}
