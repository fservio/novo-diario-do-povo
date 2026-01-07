/**
 * Basic Tests - Health & Core
 */

import { describe, it, expect } from 'vitest'

describe('Core Utilities', () => {
  it('should generate request ID', () => {
    const { generateRequestId } = await import('../packages/core/types')
    const id = generateRequestId()
    
    expect(id).toBeDefined()
    expect(id).toMatch(/^req_/)
    expect(id.length).toBeGreaterThan(10)
  })
})

describe('Auth Module', () => {
  it('should hash password correctly', async () => {
    const { hashPassword, verifyPassword } = await import('../packages/core/auth')
    
    const password = 'TestPassword123!'
    const hash = await hashPassword(password)
    
    expect(hash).toBeDefined()
    expect(hash.length).toBe(64) // SHA-256 hex
    
    const isValid = await verifyPassword(password, hash)
    expect(isValid).toBe(true)
    
    const isInvalid = await verifyPassword('WrongPassword', hash)
    expect(isInvalid).toBe(false)
  })
})

// TODO: Adicionar mais testes
// - JWT sign/verify
// - Paywall access check
// - ASAAS client mock
// - Middleware (auth, rate limit)
// - Database repos
// - R2 storage
