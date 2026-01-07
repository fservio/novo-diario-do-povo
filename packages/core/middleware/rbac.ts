/**
 * RBAC Middleware
 * Role-Based Access Control for Admin CMS
 */

import type { Context, Next } from 'hono'
import type { Env, AppContext } from '../types'
import { normalizeRole, roleRank } from '../db/users'

// ============================================================================
// Middleware: Require Staff (any role)
// ============================================================================

/**
 * Require valid staff session (any role: director, editor, writer)
 */
export async function requireStaff(c: Context<{ Bindings: Env; Variables: AppContext }>, next: Next): Promise<Response | void> {
  const user = c.get('adminUser')

  if (!user) {
    console.log('[RBAC] requireStaff: No user in context')
    return c.redirect('/admin/login', 302)
  }

  if (user.is_active !== undefined && !user.is_active) {
    console.log('[RBAC] requireStaff: User is inactive', { userId: user.id })
    return c.html('<h1>Account Disabled</h1><p>Your account has been disabled. Contact an administrator.</p>', 403)
  }

  await next()
}

// ============================================================================
// Middleware: Require Director
// ============================================================================

/**
 * Require director role (or legacy admin)
 */
export async function requireDirector(c: Context<{ Bindings: Env; Variables: AppContext }>, next: Next): Promise<Response | void> {
  const user = c.get('adminUser')

  if (!user) {
    console.log('[RBAC] requireDirector: No user in context')
    return c.redirect('/admin/login', 302)
  }

  const normalized = normalizeRole(user.role)
  
  if (normalized !== 'director') {
    console.log('[RBAC] requireDirector: Insufficient permissions', {
      userId: user.id,
      role: user.role,
      normalized,
    })
    return c.html('<h1>Access Denied</h1><p>You need director permissions to access this page.</p>', 403)
  }

  if (user.is_active !== undefined && !user.is_active) {
    console.log('[RBAC] requireDirector: User is inactive', { userId: user.id })
    return c.html('<h1>Account Disabled</h1><p>Your account has been disabled.</p>', 403)
  }

  await next()
}

// ============================================================================
// Middleware: Require Editor or Higher
// ============================================================================

/**
 * Require editor or director role
 */
export async function requireEditor(c: Context<{ Bindings: Env; Variables: AppContext }>, next: Next): Promise<Response | void> {
  const user = c.get('adminUser')

  if (!user) {
    console.log('[RBAC] requireEditor: No user in context')
    return c.redirect('/admin/login', 302)
  }

  const normalized = normalizeRole(user.role)
  
  if (roleRank(normalized) < roleRank('editor')) {
    console.log('[RBAC] requireEditor: Insufficient permissions', {
      userId: user.id,
      role: user.role,
      normalized,
    })
    return c.html('<h1>Access Denied</h1><p>You need editor or director permissions to access this page.</p>', 403)
  }

  if (user.is_active !== undefined && !user.is_active) {
    console.log('[RBAC] requireEditor: User is inactive', { userId: user.id })
    return c.html('<h1>Account Disabled</h1><p>Your account has been disabled.</p>', 403)
  }

  await next()
}

// ============================================================================
// Helper: Check Permission
// ============================================================================

/**
 * Check if user has permission for a specific action
 */
export function hasPermission(
  userRole: string,
  action: 'view' | 'create' | 'edit' | 'delete' | 'publish' | 'manage_users' | 'manage_settings'
): boolean {
  const normalized = normalizeRole(userRole)
  const rank = roleRank(normalized)

  switch (action) {
    case 'view':
      return rank >= 1 // All roles can view

    case 'create':
    case 'edit':
      return rank >= 1 // All roles can create/edit

    case 'delete':
      return rank >= 2 // Editor or higher

    case 'publish':
      return rank >= 2 // Editor or higher

    case 'manage_users':
    case 'manage_settings':
      return rank >= 3 // Director only

    default:
      return false
  }
}

/**
 * Check if user can edit another user's content
 */
export function canEditUser(currentUserRole: string, targetUserId: number, currentUserId: number): boolean {
  // Directors can edit anyone
  if (normalizeRole(currentUserRole) === 'director') {
    return true
  }

  // Editors can edit writers
  if (normalizeRole(currentUserRole) === 'editor') {
    return true // In real app, check targetUser.role < editor
  }

  // Writers can only edit their own content
  return currentUserId === targetUserId
}
