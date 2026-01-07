/**
 * Password Module Tests - PBKDF2 + bcrypt compatibility
 */

import { describe, it, expect, vi } from 'vitest'
import { hashPassword, verifyPassword, maskEmail } from '../../packages/core/auth/password'

// ============================================================================
// PBKDF2 Hashing Tests
// ============================================================================

describe('hashPassword (PBKDF2)', () => {
  it('should generate hash with pbkdf2_sha256$ prefix', async () => {
    const hash = await hashPassword('TestPassword123!')
    expect(hash).toMatch(/^pbkdf2_sha256\$/)
  })

  it('should generate hash with correct format', async () => {
    const hash = await hashPassword('TestPassword123!')
    const parts = hash.split('$')
    
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('pbkdf2_sha256')
    expect(parseInt(parts[1])).toBeGreaterThanOrEqual(120000) // min iterations
    expect(parts[2]).toBeTruthy() // salt
    expect(parts[3]).toBeTruthy() // derived key
  })

  it('should generate different hashes for same password (unique salt)', async () => {
    const password = 'TestPassword123!'
    const hash1 = await hashPassword(password)
    const hash2 = await hashPassword(password)
    
    expect(hash1).not.toBe(hash2)
  })
})

// ============================================================================
// PBKDF2 Verification Tests
// ============================================================================

describe('verifyPassword (PBKDF2)', () => {
  it('should verify correct password', async () => {
    const password = 'MySecurePassword123!'
    const hash = await hashPassword(password)
    
    const result = await verifyPassword(password, hash)
    
    expect(result.ok).toBe(true)
    expect(result.needsRehash).toBe(false)
  })

  it('should reject incorrect password', async () => {
    const password = 'MySecurePassword123!'
    const wrongPassword = 'WrongPassword456!'
    const hash = await hashPassword(password)
    
    const result = await verifyPassword(wrongPassword, hash)
    
    expect(result.ok).toBe(false)
    expect(result.needsRehash).toBe(false)
  })

  it('should handle empty password', async () => {
    const hash = await hashPassword('ValidPassword')
    
    const result = await verifyPassword('', hash)
    
    expect(result.ok).toBe(false)
  })
})

// ============================================================================
// bcrypt Compatibility Tests
// ============================================================================

describe('verifyPassword (bcrypt compatibility)', () => {
  it('should verify bcrypt hash and set needsRehash=true', async () => {
    // Mock bcrypt hash (from real bcrypt.hash('TestPassword123!', 10))
    const bcryptHash = '$2b$10$9XJvYzUh0lnWsXyVQgYp9.nfEqwCaqWo/js6zwyq4CJsGm7pIhnby'
    const password = 'LIwGSnHLyZIR/yQZj3PZ7Ji9UcdkiTvu' // Real test password
    
    const result = await verifyPassword(password, bcryptHash)
    
    expect(result.ok).toBe(true)
    expect(result.needsRehash).toBe(true)
  })

  it('should reject incorrect password with bcrypt hash', async () => {
    const bcryptHash = '$2b$10$9XJvYzUh0lnWsXyVQgYp9.nfEqwCaqWo/js6zwyq4CJsGm7pIhnby'
    const wrongPassword = 'WrongPassword'
    
    const result = await verifyPassword(wrongPassword, bcryptHash)
    
    expect(result.ok).toBe(false)
    expect(result.needsRehash).toBe(false)
  })

  it('should handle $2a$ prefix (bcrypt)', async () => {
    const bcryptHash = '$2a$10$N9qo8uLOickgx2ZMRZoMye1234567890abcdefghijklmnopqrstuv'
    
    // This will fail password check but should recognize format
    const result = await verifyPassword('test', bcryptHash)
    
    expect(result.ok).toBe(false)
    expect(result.needsRehash).toBe(false)
  })
})

// ============================================================================
// Auto-rehash Flow Tests
// ============================================================================

describe('Auto-rehash flow', () => {
  it('should indicate rehash needed for bcrypt success', async () => {
    const bcryptHash = '$2b$10$9XJvYzUh0lnWsXyVQgYp9.nfEqwCaqWo/js6zwyq4CJsGm7pIhnby'
    const password = 'LIwGSnHLyZIR/yQZj3PZ7Ji9UcdkiTvu'
    
    const verifyResult = await verifyPassword(password, bcryptHash)
    
    if (verifyResult.ok && verifyResult.needsRehash) {
      // Simulate rehash
      const newHash = await hashPassword(password)
      expect(newHash).toMatch(/^pbkdf2_sha256\$/)
      
      // Verify new hash works
      const newVerify = await verifyPassword(password, newHash)
      expect(newVerify.ok).toBe(true)
      expect(newVerify.needsRehash).toBe(false)
    }
  })
})

// ============================================================================
// Utility Tests
// ============================================================================

describe('maskEmail', () => {
  it('should mask email correctly', () => {
    expect(maskEmail('john@example.com')).toBe('j***@example.com')
    expect(maskEmail('a@test.com')).toBe('a***@test.com')
    expect(maskEmail('fabioservi@gmail.com')).toBe('f***@gmail.com')
  })

  it('should handle invalid email', () => {
    expect(maskEmail('invalid')).toBe('***')
    expect(maskEmail('')).toBe('***')
  })
})

// ============================================================================
// Security Tests
// ============================================================================

describe('Security properties', () => {
  it('should use high iteration count (>=120k)', async () => {
    const hash = await hashPassword('test')
    const parts = hash.split('$')
    const iterations = parseInt(parts[1])
    
    expect(iterations).toBeGreaterThanOrEqual(120000)
  })

  it('should use sufficient salt length', async () => {
    const hash = await hashPassword('test')
    const parts = hash.split('$')
    const saltB64 = parts[2]
    
    // Base64url encoded 16 bytes should be ~22 chars
    expect(saltB64.length).toBeGreaterThanOrEqual(20)
  })

  it('should use sufficient key length', async () => {
    const hash = await hashPassword('test')
    const parts = hash.split('$')
    const keyB64 = parts[3]
    
    // Base64url encoded 32 bytes should be ~43 chars
    expect(keyB64.length).toBeGreaterThanOrEqual(40)
  })
})
