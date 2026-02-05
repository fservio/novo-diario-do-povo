/**
 * ASAAS Integration Module
 *
 * Cliente HTTP para ASAAS + webhook handler
 * Updated for Sprint 1 Subscriber Portal
 */

import type { Env } from '../../types'
import { getSetting } from '../../db'
import { z } from 'zod'

// ============================================================================
// Zod Schema for Webhook Validation
// ============================================================================

export const asaasWebhookSchema = z.object({
  event: z.string(),
  payment: z.object({
    id: z.string(),
    customer: z.string(),
    subscription: z.string().optional(),
    value: z.number(),
    netValue: z.number().optional(),
    status: z.enum(['PENDING', 'CONFIRMED', 'RECEIVED', 'OVERDUE', 'REFUNDED', 'CANCELED', 'REFUND_REQUESTED', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE']),
    billingType: z.string(),
    dueDate: z.string(),
    confirmedDate: z.string().nullable().optional(),
    externalReference: z.string().nullable().optional(),
  }).passthrough(),
}).passthrough()

export type AsaasWebhookEvent = z.infer<typeof asaasWebhookSchema>

// ============================================================================
// ASAAS Configuration (from CMS settings)
// ============================================================================

export interface AsaasConfig {
  apiKey: string
  environment: 'sandbox' | 'production'
  baseUrl: string
}

export async function getAsaasConfig(env: Env): Promise<AsaasConfig> {
  // Try CMS settings first (production)
  const settings = await getSetting(env, 'asaas_config', 'private')

  if (settings?.apiKey && settings?.environment) {
    return {
      apiKey: settings.apiKey,
      environment: settings.environment,
      baseUrl: settings.environment === 'production'
        ? 'https://api.asaas.com/v3'
        : 'https://sandbox.asaas.com/api/v3',
    }
  }

  // Try individual settings (alternate CMS format)
  const apiKey = await getSetting(env, 'asaas.api_key', 'private')
  const environment = await getSetting(env, 'asaas.environment', 'public')

  if (apiKey && environment) {
    return {
      apiKey,
      environment,
      baseUrl: environment === 'production'
        ? 'https://api.asaas.com/v3'
        : 'https://sandbox.asaas.com/api/v3',
    }
  }

  // Fallback to bootstrap env vars (dev/staging only)
  if (env.ASAAS_BOOTSTRAP_API_KEY) {
    return {
      apiKey: env.ASAAS_BOOTSTRAP_API_KEY,
      environment: env.ASAAS_BOOTSTRAP_ENVIRONMENT || 'sandbox',
      baseUrl: (env.ASAAS_BOOTSTRAP_ENVIRONMENT || 'sandbox') === 'production'
        ? 'https://api.asaas.com/v3'
        : 'https://sandbox.asaas.com/api/v3',
    }
  }

  throw new Error('ASAAS configuration not found. Configure via CMS or provide ASAAS_BOOTSTRAP_API_KEY.')
}

// ============================================================================
// ASAAS HTTP Client
// ============================================================================

export class AsaasClient {
  private config: AsaasConfig

  constructor(config: AsaasConfig) {
    this.config = config
  }

  private async request<T>(
    method: string,
    path: string,
    body?: any
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'access_token': this.config.apiKey,
        'User-Agent': 'Jornal/1.0',
      },
    }

    if (body) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`ASAAS API error (${response.status}): ${error}`)
    }

    return response.json()
  }

  // ============================================================================
  // Customers
  // ============================================================================

  async createCustomer(data: {
    name: string
    email: string
    cpfCnpj?: string
    phone?: string
    externalReference?: string
  }): Promise<any> {
    return this.request('POST', '/customers', data)
  }

  async getCustomer(customerId: string): Promise<any> {
    return this.request('GET', `/customers/${customerId}`)
  }

  // ============================================================================
  // Subscriptions
  // ============================================================================

  async createSubscription(data: {
    customer: string // customerId
    billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX'
    value: number // em reais
    nextDueDate: string // YYYY-MM-DD
    cycle: 'MONTHLY' | 'YEARLY'
    description?: string
    externalReference?: string
  }): Promise<any> {
    return this.request('POST', '/subscriptions', data)
  }

  async getSubscription(subscriptionId: string): Promise<any> {
    return this.request('GET', `/subscriptions/${subscriptionId}`)
  }

  // ============================================================================
  // Payments
  // ============================================================================

  async getPayment(paymentId: string) {
    return this.request('GET', `/payments/${paymentId}`)
  }
}

// ============================================================================
// Service Layer
// ============================================================================

/**
 * Ensure an Asaas customer exists for the subscriber
 */
export async function ensureAsaasCustomer(
  env: Env,
  subscriberId: number
): Promise<string> {
  const config = await getAsaasConfig(env)
  const client = new AsaasClient(config)

  // 1. Check local DB
  const subscriber = await env.DB.prepare('SELECT * FROM subscribers WHERE id = ?')
    .bind(subscriberId)
    .first<any>()

  if (!subscriber) throw new Error('Subscriber not found')

  if (subscriber.asaas_customer_id) {
    return subscriber.asaas_customer_id
  }

  // 2. Create in Asaas
  const result = await client.createCustomer({
    name: subscriber.name || subscriber.email,
    email: subscriber.email,
    phone: subscriber.phone || undefined,
    cpfCnpj: subscriber.cpf || undefined,
    externalReference: subscriberId.toString()
  }) as { id: string }

  // 3. Update local DB
  await env.DB.prepare('UPDATE subscribers SET asaas_customer_id = ? WHERE id = ?')
    .bind(result.id, subscriberId)
    .run()

  return result.id
}

/**
 * Create a new subscription (Checkout start)
 */
export async function createSubscriptionFlow(
  env: Env,
  subscriberId: number,
  planSlug: 'mensal' | 'anual'
): Promise<{ subscriptionId: string; paymentUrl?: string }> {
  // Configs (Hardcoded for MVP, ideally from plans table)
  const plans = {
    mensal: { value: 9.90, cycle: 'MONTHLY' as const, name: 'Assinatura Mensal' },
    anual: { value: 94.90, cycle: 'YEARLY' as const, name: 'Assinatura Anual' }
  }

  const plan = plans[planSlug]
  if (!plan) throw new Error('Invalid plan')

  const asaasCustomerId = await ensureAsaasCustomer(env, subscriberId)

  // Check if we already have a pending subscription for this user and plan
  const existing = await env.DB.prepare(`
    SELECT asaas_subscription_id FROM subscriptions
    WHERE subscriber_id = ? AND plan_type = ? AND status = 'pending'
    LIMIT 1
  `).bind(subscriberId, planSlug).first<{ asaas_subscription_id: string }>()

  if (existing) {
    console.log(`[Asaas] Reusing existing pending subscription: ${existing.asaas_subscription_id}`)
    return { subscriptionId: existing.asaas_subscription_id }
  }

  const config = await getAsaasConfig(env)
  const client = new AsaasClient(config)

  // Calculate next due date (today)
  const nextDueDate = new Date().toISOString().split('T')[0]

  // Call Asaas
  const sub = await client.createSubscription({
    customer: asaasCustomerId,
    billingType: 'PIX', // Default MVP
    value: plan.value,
    nextDueDate,
    cycle: plan.cycle,
    description: plan.name,
    externalReference: `sub_${subscriberId}_${planSlug}`
  }) // Returns subscription object

  // Save to DB
  await env.DB.prepare(`
    INSERT INTO subscriptions (
      subscriber_id, plan_type, status, asaas_subscription_id, 
      created_at
    ) VALUES (?, ?, 'pending', ?, datetime('now'))
  `).bind(subscriberId, planSlug, sub.id).run()

  // Note: Asaas subscription creation doesn't immediately give payment URL for PIX often, 
  // needs fetching the first payment. But usually `sub` response has details.
  // For MVP let's assume valid creation.

  return { subscriptionId: sub.id }
}

// ============================================================================
// Webhook Handler
// ============================================================================

export async function handleAsaasWebhook(
  env: Env,
  event: AsaasWebhookEvent,
  requestId: string
): Promise<void> {
  const eventType = event.event
  const payment = event.payment

  console.log(`[Asaas Webhook] Processing ${eventType} for payment ${payment.id}`)

  // 1. Upsert Invoice (Mirroring)
  // We try to find buyer by customer_id if possible
  const subscriber = await env.DB.prepare('SELECT id FROM subscribers WHERE asaas_customer_id = ?')
    .bind(payment.customer)
    .first<{ id: number }>()

  if (subscriber) {
    const statusMap: Record<string, string> = {
      'PENDING': 'pending',
      'RECEIVED': 'paid',
      'CONFIRMED': 'paid',
      'OVERDUE': 'overdue',
      'REFUNDED': 'refunded',
      'CANCELED': 'canceled'
    }

    const internalStatus = statusMap[payment.status] || payment.status.toLowerCase()

    // Upsert Invoice
    await env.DB.prepare(`
      INSERT INTO invoices (
        subscriber_id, asaas_payment_id, status, amount, due_date, payment_url, paid_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(asaas_payment_id) DO UPDATE SET
        status = excluded.status,
        payment_url = excluded.payment_url,
        paid_at = excluded.paid_at,
        amount = excluded.amount
    `).bind(
      subscriber.id,
      payment.id,
      internalStatus,
      payment.value,
      payment.dueDate,
      (payment as any).invoiceUrl || (payment as any).bankSlipUrl || null, // Fallback for URL
      payment.confirmedDate || null
    ).run()
  } else {
    console.warn(`[Asaas Webhook] Subscriber not found for customer ${payment.customer}`)
  }

  // 2. Handle Subscription Status Changes
  if (payment.subscription) {
    if (eventType === 'PAYMENT_RECEIVED' || eventType === 'PAYMENT_CONFIRMED') {
      await activateLocalSubscription(env, payment.subscription, requestId)
    } else if (eventType === 'PAYMENT_OVERDUE') {
      // Implement Grace Period logic here if needed
      await setSubscriptionStatus(env, payment.subscription, 'past_due')
    } else if (eventType === 'PAYMENT_REFUNDED' || eventType === 'PAYMENT_CANCELED') {
      await setSubscriptionStatus(env, payment.subscription, 'canceled')
    }
  }
}

async function activateLocalSubscription(env: Env, asaasSubscriptionId: string, requestId: string) {
  // Calculate new period end based on successful payment
  // Simple view: valid for 30 days from now (or 1 year)
  // Ideally we query the subscription from Asaas to get nextDueDate, but let's approximate or just mark active

  // We need to know if it's monthly or annual to set `current_period_end`
  const sub = await env.DB.prepare('SELECT plan_type FROM subscriptions WHERE asaas_subscription_id = ?')
    .bind(asaasSubscriptionId)
    .first<{ plan_type: string }>()

  if (!sub) return

  const now = new Date()
  const periodEnd = new Date(now)
  if (sub.plan_type === 'anual') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1)
  }

  await env.DB.prepare(`
    UPDATE subscriptions 
    SET status = 'active', current_period_end = ?, updated_at = datetime('now')
    WHERE asaas_subscription_id = ?
  `).bind(periodEnd.toISOString(), asaasSubscriptionId).run()

  console.log(`[Asaas] Activated subscription ${asaasSubscriptionId}`)
}

async function setSubscriptionStatus(env: Env, asaasSubscriptionId: string, status: string) {
  await env.DB.prepare(`
    UPDATE subscriptions 
    SET status = ?, updated_at = datetime('now')
    WHERE asaas_subscription_id = ?
  `).bind(status, asaasSubscriptionId).run()
}
