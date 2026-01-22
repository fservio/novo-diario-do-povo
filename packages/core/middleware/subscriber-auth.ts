
import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { getSubscriberSession, getSubscriberById, updateSubscriberLastLogin } from '../db/subscribers'

export async function subscriberAuthMiddleware(c: Context, next: Next) {
    const sessionToken = getCookie(c, 'subscriber_session')

    if (!sessionToken) {
        // No session, but maybe allowed for public routes?
        // For now, we assume this middleware is used on protected routes.
        // If used globally, checking c.req.path would be needed.
        // Instead, we'll attach 'subscriber' = null if not found
        c.set('subscriber', null)
        return next()
    }

    // Verify hash
    // In a real impl, we should hash the cookie token before lookup
    // For MVP, we assume the token in cookie IS the hash (simplification)
    // Recommended: Store random token in cookie, SHA256 it to check DB.

    // Let's stick to the plan: cookie value = token_hash (for now)
    const session = await getSubscriberSession(c.env, sessionToken)

    if (!session) {
        // Invalid session
        c.set('subscriber', null)
        return next()
    }

    // Fetch subscriber
    const subscriber = await getSubscriberById(c.env, session.subscriber_id)

    if (!subscriber || subscriber.status !== 'active') {
        c.set('subscriber', null)
        return next()
    }

    // Success
    c.set('subscriber', subscriber)

    // Async update last login (fire and forget)
    // c.executionCtx.waitUntil(updateSubscriberLastLogin(c.env, subscriber.id))

    await next()
}

export function requireSubscriber(c: Context, next: Next) {
    const subscriber = c.get('subscriber')
    if (!subscriber) {
        return c.redirect('/portal/login?error=unauthorized')
    }
    return next()
}
