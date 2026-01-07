/**
 * Password Hashing & Verification Module
 * 
 * Uses PBKDF2-SHA256 with WebCrypto API (100% compatible with Cloudflare Workers/Pages)
 * Maintains backward compatibility with bcrypt via automatic rehashing
 */

// ============================================================================
// Constants
// ============================================================================

const PBKDF2_ITERATIONS = 100000 // Cloudflare Workers maximum (OWASP 2021 minimum)
const SALT_LENGTH = 16 // bytes
const KEY_LENGTH = 32 // bytes (256 bits)
const PBKDF2_PREFIX = 'pbkdf2_sha256$'

// ============================================================================
// Base64URL Encoding/Decoding (RFC 4648)
// ============================================================================

function base64UrlEncode(buffer: Uint8Array): string {
  const bytes = Array.from(buffer)
  const binary = String.fromCharCode(...bytes)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function base64UrlDecode(str: string): Uint8Array {
  // Sanitize: trim whitespace and remove internal spaces/newlines
  str = (str || '').trim().replace(/\s+/g, '')
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) str += '='
  const binary = atob(str)
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

// ============================================================================
// Timing-Safe Comparison
// ============================================================================

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}

// ============================================================================
// PBKDF2 Hashing (WebCrypto API)
// ============================================================================

export async function hashPassword(password: string): Promise<string> {
  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  
  // Encode password
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)
  
  // Import key
  const key = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  
  // Derive key bits
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    KEY_LENGTH * 8 // bits
  )
  
  const derivedKey = new Uint8Array(derivedBits)
  
  // Format: pbkdf2_sha256$<iterations>$<salt_b64url>$<key_b64url>
  const saltEncoded = base64UrlEncode(salt)
  const keyEncoded = base64UrlEncode(derivedKey)
  
  return `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${saltEncoded}$${keyEncoded}`
}

// ============================================================================
// Password Verification (PBKDF2 + bcrypt fallback)
// ============================================================================

export interface VerifyResult {
  ok: boolean
  needsRehash: boolean
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<VerifyResult> {
  // Sanitize stored hash (trim whitespace, remove quotes if jsonified)
  storedHash = (storedHash || '').trim()
  
  if (storedHash.startsWith('"') && storedHash.endsWith('"')) {
    storedHash = storedHash.slice(1, -1).trim()
  }
  
  // Case 1: PBKDF2 hash
  if (storedHash.startsWith(PBKDF2_PREFIX)) {
    try {
      const isValid = await verifyPBKDF2(password, storedHash)
      return { ok: isValid, needsRehash: false }
    } catch (error) {
      console.error('[Password] PBKDF2 verification error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        hashLength: storedHash.length,
        hashPrefix: storedHash.substring(0, 30),
      })
      return { ok: false, needsRehash: false }
    }
  }
  
  // Case 2: bcrypt hash (legacy) - auto-rehash on success
  if (storedHash.match(/^\$2[aby]\$/)) {
    try {
      // Dynamic import bcryptjs (only when needed for legacy hashes)
      const bcrypt = await import('bcryptjs')
      const isValid = await bcrypt.compare(password, storedHash)
      
      if (isValid) {
        // Password correct, but hash needs upgrade
        return { ok: true, needsRehash: true }
      }
      
      return { ok: false, needsRehash: false }
    } catch (error) {
      console.error('[Password] bcrypt verification error (legacy hash):', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return { ok: false, needsRehash: false }
    }
  }
  
  // Unknown hash format
  console.error('[Password] Unknown hash format')
  return { ok: false, needsRehash: false }
}

// ============================================================================
// PBKDF2 Verification (Internal)
// ============================================================================

async function verifyPBKDF2(password: string, storedHash: string): Promise<boolean> {
  // Sanitize hash
  storedHash = storedHash.trim()
  
  // Parse hash: pbkdf2_sha256$<iterations>$<salt_b64url>$<key_b64url>
  const parts = storedHash.split('$').map(p => p.trim())
  
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') {
    throw new Error('Invalid PBKDF2 hash format')
  }
  
  const iterations = parseInt(parts[1], 10)
  const saltEncoded = parts[2]
  const keyEncoded = parts[3]
  
  if (isNaN(iterations) || iterations < 1000) {
    throw new Error('Invalid PBKDF2 iterations')
  }
  
  // Decode salt and stored key
  const salt = base64UrlDecode(saltEncoded)
  const storedKey = base64UrlDecode(keyEncoded)
  
  // DEBUG: Log lengths
  console.log('[PBKDF2 Debug]', {
    parts: parts.length,
    iters: iterations,
    saltLen: salt.length,
    keyLen: storedKey.length,
    saltEncoded: saltEncoded.substring(0, 10),
    keyEncoded: keyEncoded.substring(0, 10),
  })
  
  // Validate key length
  if (storedKey.length !== KEY_LENGTH) {
    throw new Error(`Invalid stored key length: ${storedKey.length}, expected ${KEY_LENGTH}`)
  }
  
  if (salt.length !== SALT_LENGTH) {
    throw new Error(`Invalid salt length: ${salt.length}, expected ${SALT_LENGTH}`)
  }
  
  // Encode password
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)
  
  try {
    // Import key
    const key = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    )
    
    // Derive key bits
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: salt,
        iterations: iterations,
      },
      key,
      KEY_LENGTH * 8 // bits
    )
    
    const derivedKey = new Uint8Array(derivedBits)
    
    // DEBUG: Log derived key prefix (safe for debugging)
    const derivedHex = Array.from(derivedKey.slice(0, 8))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    const storedHex = Array.from(storedKey.slice(0, 8))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    console.log('[PBKDF2 Compare]', {
      derivedPrefix: derivedHex,
      storedPrefix: storedHex,
      match: derivedHex === storedHex
    })
    
    // Timing-safe comparison
    return timingSafeEqual(derivedKey, storedKey)
  } catch (error) {
    console.error('[PBKDF2 Crypto Error]', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error
  }
}

// ============================================================================
// Utility: Mask Email for Logging
// ============================================================================

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '***'
  
  if (local.length <= 1) {
    return `${local[0]}***@${domain}`
  }
  
  return `${local[0]}***@${domain}`
}
