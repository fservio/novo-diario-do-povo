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
    expect(hash).toMatch(/^pbkdf2_sha256\$/)
    
    const validResult = await verifyPassword(password, hash)
    expect(validResult.ok).toBe(true)
    
    const invalidResult = await verifyPassword('WrongPassword', hash)
    expect(invalidResult.ok).toBe(false)
  })
})

// TODO: Adicionar mais testes
// - JWT sign/verify
// - Paywall access check
// - ASAAS client mock
// - Middleware (auth, rate limit)
// - Database repos
// - R2 storage
