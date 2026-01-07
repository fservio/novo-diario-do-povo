/**
 * Staff Users Repository
 * Gerenciamento de usuários do CMS (director, editor, writer)
 */

import type { Env } from '../types'
import { hashPassword } from '../auth/password'

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
  let query = 'SELECT * FROM users WHERE 1=1'
  const bindings: any[] = []

  // Filter by search query
  if (filters.q) {
    query += ' AND (email LIKE ? OR name LIKE ?)'
    const searchPattern = `%${filters.q}%`
    bindings.push(searchPattern, searchPattern)
  }

  // Filter by role
  if (filters.role) {
    query += ' AND role = ?'
    bindings.push(filters.role)
  }

  // Filter by active status
  if (filters.active !== undefined) {
    query += ' AND is_active = ?'
    bindings.push(filters.active ? 1 : 0)
  }

  // Order by created_at DESC
  query += ' ORDER BY created_at DESC'

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
  const stmt = env.DB.prepare('SELECT * FROM users WHERE id = ?')
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
  // Check: Don't allow disabling the last director
  if (!active) {
    const user = await getStaffUserById(env, id)
    if (user && normalizeRole(user.role) === 'director') {
      const directors = await listStaffUsers(env, { role: 'director', active: true })
      const activeDirectorCount = directors.filter(d => d.id !== id && d.is_active === 1).length
      
      if (activeDirectorCount === 0) {
        throw new Error('Cannot disable the last active director')
      }
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
    // Check if audit_logs table exists
    const checkStmt = env.DB.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='audit_logs'
    `)
    const tableExists = await checkStmt.first()
    
    if (!tableExists) {
      console.warn('[Audit] audit_logs table does not exist, skipping log')
      return
    }

    const stmt = env.DB.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    await stmt.bind(
      entry.user_id,
      entry.action,
      entry.resource_type,
      entry.resource_id,
      entry.details,
      new Date().toISOString()
    ).run()
  } catch (error) {
    console.error('[Audit] Failed to log:', error)
    // Don't throw - audit failures shouldn't block operations
  }
}
