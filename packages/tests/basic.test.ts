/**
 * Basic Tests - Health & Core
 */

import { describe, it, expect } from 'vitest'
import { generateRequestId } from '../core/types'
import { hashPassword, verifyPassword } from '../core/auth'

describe('Core Utilities', () => {
  it('should generate request ID', () => {
    const id = generateRequestId()
    
    expect(id).toBeDefined()
    expect(id).toMatch(/^req_/)
    expect(id.length).toBeGreaterThan(10)
  })
})

describe('Auth Module', () => {
  it('should hash password correctly', async () => {
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
