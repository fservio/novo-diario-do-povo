/**
 * Generate admin password hash for seeding
 * Run: node scripts/generate_admin_hash.mjs <password>
 */

const PBKDF2_ITERATIONS = 100000 // Cloudflare Workers maximum
const SALT_LENGTH = 16
const KEY_LENGTH = 32
const PBKDF2_PREFIX = 'pbkdf2_sha256$'

function base64UrlEncode(buffer) {
  const bytes = Array.from(buffer)
  const binary = String.fromCharCode(...bytes)
  return Buffer.from(binary, 'binary').toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)
  
  const key = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    KEY_LENGTH * 8
  )
  
  const derivedKey = new Uint8Array(derivedBits)
  const saltEncoded = base64UrlEncode(salt)
  const keyEncoded = base64UrlEncode(derivedKey)
  
  return `${PBKDF2_PREFIX}${PBKDF2_ITERATIONS}$${saltEncoded}$${keyEncoded}`
}

const password = process.argv[2] || 'AdminPass123!'
console.log('Generating PBKDF2 hash for password:', password)
hashPassword(password).then(hash => {
  console.log('\nHash:', hash)
  console.log('\nSQL:')
  console.log(`INSERT INTO users (email, password_hash, name, role) VALUES`)
  console.log(`  ('admin@portal.local', '${hash}', 'Admin', 'admin');`)
})
