/**
 * Paywall Helpers
 * Cookie management e reader context extraction
 */

import type { Context } from 'hono'
import type { Env } from '../types'
import {
  signMeteringCookie,
  verifyMeteringCookie,
  generateMeteringIdentifier
} from './index'

// Aliases para validação
export const signPaywallCookie = signMeteringCookie
export const verifyPaywallCookie = verifyMeteringCookie

// ============================================================================
// Cookie Helper
// ============================================================================

const COOKIE_NAME = 'meter_id'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

export async function getOrCreateMeteringCookie(
  c: Context<{ Bindings: Env }>,
  env: Env
): Promise<string> {
  // Try to read existing cookie
  const existingCookie = c.req.header('cookie')
  if (existingCookie) {
    const match = existingCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
    if (match) {
      const cookieValue = match[1]
      const verified = await verifyMeteringCookie(env, cookieValue)
      if (verified) {
        return verified.identifier
      }
    }
  }

  // Generate new identifier
  const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '127.0.0.1'
  const userAgent = c.req.header('user-agent') || 'unknown'
  const identifier = generateMeteringIdentifier(ipAddress, userAgent)

  // Sign cookie
  const signedCookie = await signMeteringCookie(env, identifier)

  // Set cookie in response
  c.header('Set-Cookie', `${COOKIE_NAME}=${signedCookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`)

  return identifier
}

// ============================================================================
// Reader Context from Token
// ============================================================================

export async function getReaderContext(
  c: Context<{ Bindings: Env }>
): Promise<{ readerId?: number; isSubscriber: boolean; anonIdentifier?: string; subscriber?: any }> {
  // 1. Try Subscriber Session Cookie (Portal Auth)
  const { getCookie } = await import('hono/cookie')
  const { getSubscriberSession, getSubscriberById } = await import('../db')

  const subscriberToken = getCookie(c, 'subscriber_session')

  if (subscriberToken) {
    const session = await getSubscriberSession(c.env, subscriberToken)
    if (session) {
      const subscriber = await getSubscriberById(c.env, session.subscriber_id)
      if (subscriber) {
        return {
          readerId: subscriber.id,
          isSubscriber: true, // We will refine this with isPremium check in access logic
          subscriber
        }
      }
    }
  }

  // 2. Try App Authorization Header (Legacy/Mobile App)
  const authHeader = c.req.header('Authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const { verifyJWT } = await import('../auth')
    const token = authHeader.substring(7)
    const payload = await verifyJWT(token, c.env.JWT_SECRET)

    if (payload && payload.type === 'reader') {
      const readerId = parseInt(payload.sub, 10)

      // Check subscription legacy
      const { hasActiveSubscription } = await import('../db')
      const isSubscriber = await hasActiveSubscription(c.env, readerId)

      return { readerId, isSubscriber }
    }
  }

  // 3. Fallback to anonymous
  const anonIdentifier = await getOrCreateMeteringCookie(c, c.env)
  return { isSubscriber: false, anonIdentifier }
}
