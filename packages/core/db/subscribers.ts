/**
 * Subscriber Repository
 * Handles readers, authentication, and sessions
 */

import type { Env } from '../types'
import { hashPassword } from '../auth/password'

// ============================================================================
// Types
// ============================================================================

export interface Subscriber {
    id: number
    email: string
    name: string | null
    phone: string | null
    asaas_customer_id: string | null
    status: 'active' | 'blocked'
    created_at: string
    last_login_at: string | null
}

export interface SubscriberSession {
    id: number
    subscriber_id: number
    token_hash: string
    expires_at: string
    created_at: string
}

export interface CreateSubscriberPayload {
    email: string
    password: string
    name?: string
    phone?: string
}

// ============================================================================
// Repository
// ============================================================================

/**
 * Create a new subscriber
 */
export async function createSubscriber(env: Env, payload: CreateSubscriberPayload): Promise<number> {
    const passwordHash = await hashPassword(payload.password)
    const now = new Date().toISOString()

    const stmt = env.DB.prepare(`
    INSERT INTO subscribers (email, password_hash, name, phone, status, created_at)
    VALUES (?, ?, ?, ?, 'active', ?)
  `)

    // Normalize email
    const email = payload.email.toLowerCase().trim()

    const result = await stmt.bind(
        email,
        passwordHash,
        payload.name?.trim() || null,
        payload.phone?.trim() || null,
        now
    ).run()

    return result.meta.last_row_id
}

/**
 * Get subscriber by email (for login)
 * Includes password_hash for verification
 */
export async function getSubscriberByEmail(env: Env, email: string): Promise<(Subscriber & { password_hash: string }) | null> {
    const stmt = env.DB.prepare('SELECT * FROM subscribers WHERE email = ?')
    return await stmt.bind(email.toLowerCase().trim()).first()
}

/**
 * Get subscriber by ID (for session hydration)
 */
export async function getSubscriberById(env: Env, id: number): Promise<Subscriber | null> {
    const stmt = env.DB.prepare('SELECT * FROM subscribers WHERE id = ?')
    return await stmt.bind(id).first()
}

/**
 * Update Subscriber Profile (name, phone)
 */
export async function updateSubscriberProfile(env: Env, id: number, data: { name?: string, phone?: string }): Promise<void> {
    await env.DB.prepare('UPDATE subscribers SET name = ?, phone = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind(data.name || null, data.phone || null, id)
        .run()
}

/**
 * Update Subscriber Status (admin)
 */
export async function updateSubscriberStatus(env: Env, id: number, status: 'active' | 'blocked'): Promise<void> {
    await env.DB.prepare('UPDATE subscribers SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
        .bind(status, id)
        .run()
}

/**
 * List Subscribers (admin)
 */
export interface ListSubscribersFilters {
    status?: string
    q?: string
}

export async function listSubscribers(env: Env, filters: ListSubscribersFilters = {}): Promise<any[]> {
    let query = `
        SELECT s.*, 
        (SELECT status FROM subscriptions WHERE subscriber_id = s.id ORDER BY id DESC LIMIT 1) as subscription_status,
        (SELECT plan_type FROM subscriptions WHERE subscriber_id = s.id ORDER BY id DESC LIMIT 1) as plan_type
        FROM subscribers s
    `
    const conditions: string[] = []
    const params: any[] = []

    if (filters.status) {
        conditions.push('s.status = ?')
        params.push(filters.status)
    }

    if (filters.q) {
        conditions.push('(s.email LIKE ? OR s.name LIKE ?)')
        params.push(`%${filters.q}%`, `%${filters.q}%`)
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ')
    }

    query += ' ORDER BY s.created_at DESC'

    const stmt = env.DB.prepare(query)
    const result = await (params.length > 0 ? stmt.bind(...params) : stmt).all()
    return result.results
}

/**
 * Update Last Login
 */
export async function updateSubscriberLastLogin(env: Env, id: number): Promise<void> {
    await env.DB.prepare('UPDATE subscribers SET last_login_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), id)
        .run()
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a specialized session for subscribers
 */
export async function createSubscriberSession(env: Env, subscriberId: number, tokenHash: string, expiresAt: Date): Promise<void> {
    await env.DB.prepare(`
    INSERT INTO subscriber_sessions (subscriber_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `)
        .bind(subscriberId, tokenHash, expiresAt.toISOString())
        .run()
}

/**
 * Verify session token
 */
export async function getSubscriberSession(env: Env, tokenHash: string): Promise<SubscriberSession | null> {
    const stmt = env.DB.prepare(`
    SELECT * FROM subscriber_sessions 
    WHERE token_hash = ? AND expires_at > ?
  `)
    return await stmt.bind(tokenHash, new Date().toISOString()).first()
}

/**
 * Delete session (Logout)
 */
export async function deleteSubscriberSession(env: Env, tokenHash: string): Promise<void> {
    await env.DB.prepare('DELETE FROM subscriber_sessions WHERE token_hash = ?')
        .bind(tokenHash)
        .run()
}

/**
 * Clean up expired sessions (Maintenance)
 */
export async function cleanupExpiredSessions(env: Env): Promise<void> {
    await env.DB.prepare('DELETE FROM subscriber_sessions WHERE expires_at <= ?')
        .bind(new Date().toISOString())
        .run()
}

// ============================================================================
// Access Control (Paywall)
// ============================================================================

export interface SubscriptionStatus {
    isPremium: boolean
    status: 'active' | 'past_due' | 'canceled' | 'none'
    periodEnd: string | null
    planType: string | null
}

/**
 * Check if a subscriber has premium access
 * Single source of truth for Paywall
 */
export async function isPremium(env: Env, subscriberId: number): Promise<boolean> {
    const status = await getSubscriptionStatus(env, subscriberId)
    return status.isPremium
}

/**
 * Get detailed subscription status
 */
export async function getSubscriptionStatus(env: Env, subscriberId: number): Promise<SubscriptionStatus> {
    // 1. Check Subscriber Account Status
    const subscriber = await getSubscriberById(env, subscriberId)
    if (!subscriber || subscriber.status !== 'active') {
        return { isPremium: false, status: 'none', periodEnd: null, planType: null }
    }

    // 2. Check Active Subscription
    // We look for any subscription that is 'active' OR 'past_due' (within grace)
    // AND period_end > now
    const sub = await env.DB.prepare(`
    SELECT * FROM subscriptions 
    WHERE subscriber_id = ?
    ORDER BY CASE status
       WHEN 'active' THEN 1
       WHEN 'past_due' THEN 2
       ELSE 3
    END, current_period_end DESC
    LIMIT 1
  `).bind(subscriberId).first<{
        status: string,
        current_period_end: string,
        plan_type: string
    }>()

    if (!sub) {
        return { isPremium: false, status: 'none', periodEnd: null, planType: null }
    }

    const now = new Date()
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null

    // Basic Logic: Status must be active and period not expired
    // We can add more complex grace period logic here later
    const isValid =
        (sub.status === 'active' || sub.status === 'past_due') &&
        periodEnd !== null &&
        periodEnd > now

    return {
        isPremium: isValid,
        status: sub.status as any,
        periodEnd: sub.current_period_end,
        planType: sub.plan_type
    }
}

export interface Invoice {
    id: number
    subscriber_id: number
    asaas_payment_id: string
    status: string
    amount: number
    due_date: string
    payment_url: string | null
    paid_at: string | null
    created_at: string
}

/**
 * Get the latest open invoice (pending or overdue)
 */
export async function getLatestOpenInvoice(env: Env, subscriberId: number): Promise<Invoice | null> {
    return await env.DB.prepare(`
    SELECT * FROM invoices 
    WHERE subscriber_id = ? 
    AND status IN ('pending', 'overdue')
    ORDER BY due_date ASC
    LIMIT 1
  `).bind(subscriberId).first<Invoice>()
}
