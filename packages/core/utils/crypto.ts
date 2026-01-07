// ============================================================================
// Crypto Utilities - Production-Grade
// ============================================================================
// IMPORTANT: No spread operator to avoid stack overflow with large arrays

/**
 * Generate cryptographically secure random bytes
 * @param length Number of bytes to generate
 * @returns Uint8Array of random bytes
 */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}

/**
 * Convert bytes to base64 string (without spread operator)
 * @param bytes Uint8Array to convert
 * @returns Base64 string
 */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.length
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert bytes to base64url string (URL-safe)
 * @param bytes Uint8Array to convert
 * @returns Base64url string
 */
export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Convert bytes to hexadecimal string
 * @param bytes Uint8Array to convert
 * @returns Hex string
 */
export function toHex(bytes: Uint8Array): string {
  const hexArray = []
  for (let i = 0; i < bytes.length; i++) {
    const hex = bytes[i].toString(16).padStart(2, '0')
    hexArray.push(hex)
  }
  return hexArray.join('')
}

/**
 * Generate random hex string
 * @param length Number of bytes (hex string will be 2x length)
 * @returns Hex string
 */
export function randomHex(length: number): string {
  const bytes = randomBytes(length)
  return toHex(bytes)
}

/**
 * Generate random base64 string
 * @param length Number of bytes to generate
 * @returns Base64 string
 */
export function randomBase64(length: number): string {
  const bytes = randomBytes(length)
  return toBase64(bytes)
}

/**
 * Generate random base64url string (URL-safe)
 * @param length Number of bytes to generate
 * @returns Base64url string
 */
export function randomBase64Url(length: number): string {
  const bytes = randomBytes(length)
  return toBase64Url(bytes)
}

/**
 * SHA-256 hash of data
 * @param data String or ArrayBuffer to hash
 * @returns Hex string of hash
 */
export async function sha256Hex(data: string | ArrayBuffer): Promise<string> {
  const buffer = typeof data === 'string' 
    ? new TextEncoder().encode(data) 
    : data
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = new Uint8Array(hashBuffer)
  return toHex(hashArray)
}
