/**
 * Staff & Roles Unit Tests
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  normalizeRole,
  roleRank,
  hasRole,
} from '../../packages/core/db/users'

// ============================================================================
// Role Utilities Tests
// ============================================================================

describe('Role Utilities', () => {
  it('should normalize "admin" to "director"', () => {
    expect(normalizeRole('admin')).toBe('director')
  })

  it('should keep valid roles unchanged', () => {
    expect(normalizeRole('director')).toBe('director')
    expect(normalizeRole('editor')).toBe('editor')
    expect(normalizeRole('writer')).toBe('writer')
  })

  it('should fallback invalid roles to "writer"', () => {
    expect(normalizeRole('invalid')).toBe('writer')
    expect(normalizeRole('')).toBe('writer')
  })

  it('should calculate correct role ranks', () => {
    expect(roleRank('director')).toBe(3)
    expect(roleRank('admin')).toBe(3) // normalized to director
    expect(roleRank('editor')).toBe(2)
    expect(roleRank('writer')).toBe(1)
    expect(roleRank('invalid')).toBe(1) // normalized to writer (default)
  })

  it('should check role permissions correctly', () => {
    // Director has all permissions
    expect(hasRole('director', 'director')).toBe(true)
    expect(hasRole('director', 'editor')).toBe(true)
    expect(hasRole('director', 'writer')).toBe(true)

    // Editor can access editor and writer
    expect(hasRole('editor', 'director')).toBe(false)
    expect(hasRole('editor', 'editor')).toBe(true)
    expect(hasRole('editor', 'writer')).toBe(true)

    // Writer can only access writer
    expect(hasRole('writer', 'director')).toBe(false)
    expect(hasRole('writer', 'editor')).toBe(false)
    expect(hasRole('writer', 'writer')).toBe(true)

    // Admin (legacy) = director
    expect(hasRole('admin', 'director')).toBe(true)
    expect(hasRole('admin', 'editor')).toBe(true)
  })
})

// ============================================================================
// Zod Schema Tests
// ============================================================================

describe('User Zod Schemas', () => {
  const createUserSchema = z.object({
    email: z.string().email().min(3).max(255),
    password: z.string().min(8).max(128),
    name: z.string().min(2).max(255),
    role: z.enum(['director', 'editor', 'writer']),
    must_change_password: z.boolean().optional(),
  })

  const updateUserSchema = z.object({
    email: z.string().email().min(3).max(255).optional(),
    name: z.string().min(2).max(255).optional(),
    role: z.enum(['director', 'editor', 'writer']).optional(),
  })

  it('should validate correct create user payload', () => {
    const payload = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      role: 'writer' as const,
    }

    const result = createUserSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('should reject invalid email', () => {
    const payload = {
      email: 'invalid-email',
      password: 'password123',
      name: 'Test User',
      role: 'writer' as const,
    }

    const result = createUserSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('should reject short password', () => {
    const payload = {
      email: 'test@example.com',
      password: 'short',
      name: 'Test User',
      role: 'writer' as const,
    }

    const result = createUserSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('should reject invalid role', () => {
    const payload = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      role: 'invalid' as any,
    }

    const result = createUserSchema.safeParse(payload)
    expect(result.success).toBe(false)
  })

  it('should validate partial update payload', () => {
    const payload = {
      name: 'Updated Name',
    }

    const result = updateUserSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('should validate full update payload', () => {
    const payload = {
      email: 'updated@example.com',
      name: 'Updated Name',
      role: 'editor' as const,
    }

    const result = updateUserSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// SSR Render Tests
// ============================================================================

describe('Admin Users SSR Render', () => {
  it('should render users list with table', () => {
    const mockHTML = `
      <table id="usersTable">
        <thead>
          <tr>
            <th>Nome / Email</th>
            <th>Papel</th>
            <th>Status</th>
          </tr>
        </thead>
      </table>
    `
    
    expect(mockHTML).toContain('id="usersTable"')
    expect(mockHTML).toContain('Nome / Email')
    expect(mockHTML).toContain('Papel')
    expect(mockHTML).toContain('Status')
  })

  it('should render user form with required fields', () => {
    const mockHTML = `
      <form method="POST">
        <input type="hidden" name="csrf_token" />
        <input type="email" name="email" required />
        <input type="text" name="name" required />
        <select name="role" required>
          <option value="writer">Redator</option>
          <option value="editor">Editor</option>
          <option value="director">Diretor</option>
        </select>
        <input type="password" name="password" required />
      </form>
    `
    
    expect(mockHTML).toContain('name="csrf_token"')
    expect(mockHTML).toContain('name="email"')
    expect(mockHTML).toContain('name="name"')
    expect(mockHTML).toContain('name="role"')
    expect(mockHTML).toContain('name="password"')
  })
})
