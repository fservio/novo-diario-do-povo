/**
 * Paywall Module
 * 
 * Implementa paywall metered/hard com entitlements e anti-bypass
 */

import type { Env, Post, PaywallRule, MeteringState } from '../types'
import { getSetting } from '../db'

// ============================================================================
// Paywall Rules Engine
// ============================================================================

export async function getPaywallRules(env: Env): Promise<PaywallRule> {
  const rules = await getSetting(env, 'paywall_rules', 'public')
  
  // Defaults
  return {
    mode: rules?.mode || 'metered',
    meter_limit: rules?.meter_limit || 5,
    meter_window: rules?.meter_window || 'monthly',
    meter_soft_cta_at: rules?.meter_soft_cta_at || 2,
    lock_after_ratio_mobile: rules?.lock_after_ratio_mobile || 0.22,
    lock_after_ratio_desktop: rules?.lock_after_ratio_desktop || 0.30,
    exempt_templates: rules?.exempt_templates || ['live', 'stories'],
  }
}

export async function getCategoryPaywallRules(env: Env, categorySlug: string): Promise<Partial<PaywallRule> | null> {
  const categoryRules = await getSetting(env, `paywall_rules_category_${categorySlug}`, 'public')
  return categoryRules || null
}

// ============================================================================
// Metering State (Anon + User)
// ============================================================================

export async function getMeteringState(
  env: Env,
  identifier: string,
  identifierType: 'anon' | 'user'
): Promise<MeteringState> {
  const rules = await getPaywallRules(env)
  const monthYear = new Date().toISOString().substring(0, 7) // YYYY-MM

  // Buscar contador
  const counter = await env.DB.prepare(`
    SELECT count FROM metering_counters
    WHERE identifier = ? AND identifier_type = ? AND month_year = ?
  `).bind(identifier, identifierType, monthYear).first<{ count: number }>()

  const count = counter?.count || 0
  const limit = rules.meter_limit || 5
  const remaining = Math.max(0, limit - count)

  return {
    identifier,
    identifierType,
    count,
    limit,
    remaining,
    isLocked: count >= limit,
  }
}

export async function incrementMeteringCounter(
  env: Env,
  identifier: string,
  identifierType: 'anon' | 'user'
): Promise<void> {
  const monthYear = new Date().toISOString().substring(0, 7)

  await env.DB.prepare(`
    INSERT INTO metering_counters (identifier, identifier_type, month_year, count, last_incremented_at)
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(identifier, identifier_type, month_year) DO UPDATE SET
      count = count + 1,
      last_incremented_at = datetime('now')
  `).bind(identifier, identifierType, monthYear).run()
}

// ============================================================================
// Check Access (post + user state)
// ============================================================================

export interface AccessCheckResult {
  allowed: boolean
  reason?: string
  paywallMode?: 'free' | 'metered' | 'hard'
  meteringState?: MeteringState
  lockRatio?: number
  showSoftCta?: boolean
}

export async function checkPostAccess(
  env: Env,
  post: Post,
  context: {
    isSubscriber: boolean
    readerUserId?: number
    anonIdentifier?: string
  }
): Promise<AccessCheckResult> {
  // 1. Subscriber tem acesso total
  if (context.isSubscriber) {
    return { allowed: true }
  }

  // 2. Post não-premium é livre
  if (!post.is_premium) {
    return { allowed: true, paywallMode: 'free' }
  }

  // 3. Breaking news temporariamente livre
  if (post.breaking_until) {
    const breakingDate = new Date(post.breaking_until)
    if (breakingDate > new Date()) {
      return { allowed: true, paywallMode: 'free' }
    }
  }

  // 4. Metering exempt
  if (post.metering_exempt) {
    return { allowed: true, paywallMode: 'free' }
  }

  // 5. Buscar regras do post
  const globalRules = await getPaywallRules(env)
  
  // Exempted templates
  if (globalRules.exempt_templates?.includes(post.template)) {
    return { allowed: true, paywallMode: 'free' }
  }

  // 6. Determinar modo (tier do post ou categoria)
  let mode: 'free' | 'metered' | 'hard' = globalRules.mode as any
  
  if (post.paywall_tier) {
    mode = post.paywall_tier as any
  }

  // 7. Hard paywall
  if (mode === 'hard') {
    return {
      allowed: false,
      reason: 'hard_paywall',
      paywallMode: 'hard',
      lockRatio: 0, // Bloquear imediatamente ou após excerpt
    }
  }

  // 8. Metered paywall
  if (mode === 'metered') {
    const identifier = context.readerUserId?.toString() || context.anonIdentifier || 'unknown'
    const identifierType = context.readerUserId ? 'user' : 'anon'

    const meteringState = await getMeteringState(env, identifier, identifierType)

    if (meteringState.isLocked) {
      return {
        allowed: false,
        reason: 'metering_limit_reached',
        paywallMode: 'metered',
        meteringState,
        lockRatio: globalRules.lock_after_ratio_mobile || 0.22,
      }
    }

    // Permitir mas mostrar soft CTA se próximo do limite
    const showSoftCta = meteringState.count >= (globalRules.meter_soft_cta_at || 2)

    return {
      allowed: true,
      paywallMode: 'metered',
      meteringState,
      showSoftCta,
    }
  }

  // 9. Free (fallback)
  return { allowed: true, paywallMode: 'free' }
}

// ============================================================================
// Generate Metering Identifier (anon user)
// ============================================================================

export function generateMeteringIdentifier(ipAddress: string, userAgent: string): string {
  // Hash simples (pode ser melhorado com fingerprinting mais robusto)
  const data = `${ipAddress}:${userAgent}`
  const encoder = new TextEncoder()
  const buffer = encoder.encode(data)
  
  // Usar apenas primeiros 16 bytes do hash para não armazenar PII completo
  return Array.from(buffer.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('')
}

// ============================================================================
// Signed Metering Cookie (anti-bypass)
// ============================================================================

export async function signMeteringCookie(
  env: Env,
  identifier: string
): Promise<string> {
  const monthYear = new Date().toISOString().substring(0, 7)
  const data = `${identifier}:${monthYear}`
  
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(env.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  const sig = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('')
  
  return `${identifier}.${monthYear}.${sig}`
}

export async function verifyMeteringCookie(
  env: Env,
  cookie: string
): Promise<{ identifier: string; monthYear: string } | null> {
  try {
    const parts = cookie.split('.')
    if (parts.length !== 3) return null

    const [identifier, monthYear, providedSig] = parts
    const data = `${identifier}:${monthYear}`
    
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
    const expectedSig = Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('')
    
    if (expectedSig !== providedSig) return null

    return { identifier, monthYear }
  } catch (error) {
    return null
  }
}
