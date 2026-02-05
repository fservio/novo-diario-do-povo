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
  reason?: 'not_logged_in' | 'not_subscribed' | 'past_due' | 'metering_limit_reached' | 'hard_paywall'
  paywallMode?: 'free' | 'metered' | 'hard'
  cta?: {
    primary: 'login' | 'subscribe_monthly' | 'subscribe_annual' | 'pay_invoice' | 'reactivate'
    href?: string
  }
  meteringState?: MeteringState
  lockRatio?: number
  showSoftCta?: boolean
  graceUntil?: string
  subscriber?: any
}

export async function checkPostAccess(
  env: Env,
  post: Post,
  context: {
    isSubscriber: boolean
    readerUserId?: number
    anonIdentifier?: string
    subscriber?: any
  }
): Promise<AccessCheckResult> {
  // 0. Defaults
  const defaults: AccessCheckResult = { allowed: true, paywallMode: 'free', subscriber: context.subscriber }

  // 1. Check Subscriber Access (if logged in)
  if (context.readerUserId) {
    const { isPremium, getSubscriptionStatus } = await import('../db')
    const status = await getSubscriptionStatus(env, context.readerUserId)

    // Status Logic
    if (status.isPremium) {
      return { allowed: true, subscriber: context.subscriber }
    }

    // Logged in but NOT premium
    // Check specific states
    if (status.status === 'past_due') {
      return {
        allowed: false,
        reason: 'past_due',
        paywallMode: 'hard',
        cta: { primary: 'pay_invoice', href: '/portal' }, // Direct them to portal to pay
        subscriber: context.subscriber
      }
    }

    if (status.status === 'canceled') {
      return {
        allowed: false,
        reason: 'not_subscribed', // or canceled specific
        paywallMode: 'hard',
        cta: { primary: 'reactivate' },
        subscriber: context.subscriber
      }
    }

    // Just not subscribed (none)
    // We treat them as "metered" user potentially if we want meter for free users?
    // Usually logged in non-subscribers are treated as "hard" for premium content.
  }

  // 2. Post IS Free?
  if (!post.is_premium) {
    // Even if free, we might want to check metering if site is 100% metered? 
    // For now, free posts are free.
    return defaults
  }

  // 3. Breaking news overrides
  if (post.breaking_until) {
    const breakingDate = new Date(post.breaking_until)
    if (breakingDate > new Date()) {
      return defaults
    }
  }

  // 4. Metering exempt
  if (post.metering_exempt) {
    return defaults
  }

  // 5. Paywall Logic for Premium Content

  // If user is Logged In but NOT Premium (failed step 1 check)
  if (context.readerUserId) {
    return {
      allowed: false,
      reason: 'not_subscribed',
      paywallMode: 'hard',
      cta: { primary: 'subscribe_monthly' },
      subscriber: context.subscriber
    }
  }

  // If user is Anonymous (Not Logged In)
  // We can offer Metering here OR Hard Paywall if it's premium.
  // Requirement: "se is_premium && !isPremium -> teaser + CTA"
  // Assuming 'is_premium' means HARD paywall for non-subs.
  // If we support metered access to premium content, logic goes here.
  // For this project, 'is_premium' usually means Subscribers Only.

  // Check global rules to see if we allow metering for premium
  const globalRules = await getPaywallRules(env)

  // If exemptions apply
  if (globalRules.exempt_templates?.includes(post.template)) {
    return defaults
  }

  // Check specific post tier
  let mode: 'free' | 'metered' | 'hard' = globalRules.mode as any
  if (post.paywall_tier) {
    mode = post.paywall_tier as any
  }

  // If mode is METERED, we check limits for Anon
  if (mode === 'metered') {
    const identifier = context.anonIdentifier || 'unknown'
    const meteringState = await getMeteringState(env, identifier, 'anon')

    if (meteringState.isLocked) {
      return {
        allowed: false,
        reason: 'metering_limit_reached',
        paywallMode: 'metered',
        meteringState,
        lockRatio: globalRules.lock_after_ratio_mobile || 0.22,
        cta: { primary: 'subscribe_monthly' }, // Anon limit reached -> subscribe
        subscriber: context.subscriber
      }
    }

    return {
      allowed: true,
      paywallMode: 'metered',
      meteringState,
      showSoftCta: meteringState.count >= (globalRules.meter_soft_cta_at || 2),
      subscriber: context.subscriber
    }
  }

  // Default for premium content: HARD paywall (Not Logged In)
  return {
    allowed: false,
    reason: 'not_logged_in',
    paywallMode: 'hard',
    lockRatio: 0.2, // Show a bit of teaser
    cta: { primary: 'login' },
    subscriber: context.subscriber
  }
}

// ============================================================================
// Generate Metering Identifier (anon user)
// ============================================================================

export function generateMeteringIdentifier(ipAddress: string, userAgent: string): string {
  if (!ipAddress || !userAgent) {
    return 'unknown'
  }

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
    encoder.encode(env.JWT_SECRET || ''),
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
      encoder.encode(env.JWT_SECRET || ''),
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
