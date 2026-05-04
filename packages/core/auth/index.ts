/**
 * Authentication & JWT Module
 * 
 * Responsável por autenticação de admin/editor e leitores (assinantes)
 */

import type { Env, User, ReaderUser } from '../types'

import { hashPassword, verifyPassword } from './password'

export { hashPassword, verifyPassword } from './password'

// ============================================================================
// JWT (usando Web Crypto API)
// ============================================================================

interface JWTPayload {
  sub: string // user ID ou reader ID
  type: 'admin' | 'reader'
  email: string
  role?: string
  sid?: string // session ID (para CSRF bound)
  iat: number
  exp: number
}

function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) {
    str += '='
  }
  return atob(str)
}

export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string, expiresIn: number = 86400): Promise<string> {
  if (!secret) {
    throw new Error('JWT secret is required')
  }

  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
  }

  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload))

  const data = `${encodedHeader}.${encodedPayload}`
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)))

  return `${data}.${encodedSignature}`
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  if (!secret) {
    throw new Error('JWT secret is required')
  }

  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [encodedHeader, encodedPayload, encodedSignature] = parts
    const data = `${encodedHeader}.${encodedPayload}`

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const signatureData = Uint8Array.from(base64UrlDecode(encodedSignature), c => c.charCodeAt(0))
    const isValid = await crypto.subtle.verify('HMAC', key, signatureData, encoder.encode(data))

    if (!isValid) return null

    const payload: JWTPayload = JSON.parse(base64UrlDecode(encodedPayload))

    // Verificar expiração
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp < now) return null

    return payload
  } catch (error) {
    console.error('JWT verification error:', error)
    return null
  }
}

// ============================================================================
// Auth Helpers
// ============================================================================

export async function authenticateUser(env: Env, email: string, password: string): Promise<User | null> {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured')
  }

  const result = await env.DB.prepare(
    'SELECT * FROM users WHERE email = ? AND is_active = 1'
  ).bind(email).first<User>()

  if (!result) return null

  const { ok: isValid } = await verifyPassword(password, result.password_hash)
  if (!isValid) return null

  return result
}

export async function authenticateReader(env: Env, email: string, password: string): Promise<ReaderUser | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM reader_users WHERE email = ? AND is_verified = 1'
  ).bind(email).first<ReaderUser>()

  if (!result || !result.password_hash) return null

  const { ok: isValid } = await verifyPassword(password, result.password_hash)
  if (!isValid) return null

  // Atualizar last_login_at
  await env.DB.prepare(
    'UPDATE reader_users SET last_login_at = ? WHERE id = ?'
  ).bind(new Date().toISOString(), result.id).run()

  return result
}

export async function createAdminToken(user: User, env: Env): Promise<string> {
  return signJWT(
    {
      sub: user.id.toString(),
      type: 'admin',
      email: user.email,
      role: user.role,
    },
    env.JWT_SECRET,
    86400 * 7 // 7 dias
  )
}

export async function createReaderToken(reader: ReaderUser, env: Env): Promise<string> {
  return signJWT(
    {
      sub: reader.id.toString(),
      type: 'reader',
      email: reader.email,
    },
    env.JWT_SECRET,
    86400 * 30 // 30 dias
  )
}

// ============================================================================
// Bootstrap Admin (primeira execução - idempotente)
// ============================================================================

export async function bootstrapAdmin(env: Env): Promise<void> {
  // Check KV flag first (fast path)
  const bootstrapped = await env.KV.get('bootstrap:done')
  if (bootstrapped === '1') {
    return
  }

  // Double-check DB
  const existingAdmin = await env.DB.prepare(
    'SELECT id FROM users WHERE role = ? LIMIT 1'
  ).bind('admin').first()

  if (existingAdmin) {
    // Set flag to avoid future checks
    await env.KV.put('bootstrap:done', '1')
    return
  }

  // Create admin
  const passwordHash = await hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD)
  await env.DB.prepare(`
    INSERT INTO users (email, password_hash, name, role, is_active)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    env.ADMIN_BOOTSTRAP_EMAIL,
    passwordHash,
    'Administrador',
    'admin',
    1
  ).run()

  // Set flag
  await env.KV.put('bootstrap:done', '1')
  console.log('Admin user created successfully')
}

// ============================================================================
// Magic Link (Reader Login sem senha)
// ============================================================================

export async function generateMagicLinkToken(): Promise<string> {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

export async function createMagicLink(env: Env, email: string): Promise<string> {
  const token = await generateMagicLinkToken()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 min

  // Salvar token temporário no KV
  await env.KV.put(`magic:${token}`, email, { expirationTtl: 900 }) // 15 min

  return `${env.PUBLIC_BASE_URL || ''}/reader/auth/magic?token=${token}`
}

export async function verifyMagicLink(env: Env, token: string): Promise<string | null> {
  const email = await env.KV.get(`magic:${token}`)
  if (!email) return null

  // Deletar token usado
  await env.KV.delete(`magic:${token}`)
  return email
}
