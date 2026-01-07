/**
 * ASAAS Integration Module
 * 
 * Cliente HTTP para ASAAS + webhook handler
 */

import type { Env } from '../../types'
import { getSetting } from '../../db'
import { z } from 'zod'

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
  }) {
    return this.request('POST', '/customers', data)
  }

  async getCustomer(customerId: string) {
    return this.request('GET', `/customers/${customerId}`)
  }

  async updateCustomer(customerId: string, data: Partial<{
    name: string
    email: string
    cpfCnpj: string
    phone: string
  }>) {
    return this.request('PUT', `/customers/${customerId}`, data)
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
  }) {
    return this.request('POST', '/subscriptions', data)
  }

  async getSubscription(subscriptionId: string) {
    return this.request('GET', `/subscriptions/${subscriptionId}`)
  }

  async cancelSubscription(subscriptionId: string) {
    return this.request('DELETE', `/subscriptions/${subscriptionId}`)
  }

  // ============================================================================
  // Payments
  // ============================================================================

  async getPayment(paymentId: string) {
    return this.request('GET', `/payments/${paymentId}`)
  }
}

// ============================================================================
// ASAAS Service Layer
// ============================================================================

export async function createOrUpdateAsaasCustomer(
  env: Env,
  readerUserId: number,
  data: {
    name: string
    email: string
  }
): Promise<string> {
  const config = await getAsaasConfig(env)
  const client = new AsaasClient(config)

  // Check if customer already exists
  const existing = await env.DB.prepare(
    'SELECT asaas_customer_id FROM asaas_customers WHERE reader_user_id = ? AND asaas_environment = ?'
  ).bind(readerUserId, config.environment).first<{ asaas_customer_id: string }>()

  if (existing) {
    // Update
    await client.updateCustomer(existing.asaas_customer_id, data)
    return existing.asaas_customer_id
  }

  // Create new
  const result = await client.createCustomer(data)
  const asaasCustomerId = result.id

  // Save to DB
  await env.DB.prepare(`
    INSERT INTO asaas_customers (reader_user_id, asaas_customer_id, asaas_environment, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).bind(readerUserId, asaasCustomerId, config.environment).run()

  return asaasCustomerId
}

export async function createAsaasSubscription(
  env: Env,
  readerUserId: number,
  planId: number
): Promise<{ subscriptionId: string; nextDueDate: string }> {
  const config = await getAsaasConfig(env)
  const client = new AsaasClient(config)

  // Get plan
  const plan = await env.DB.prepare('SELECT * FROM plans WHERE id = ?')
    .bind(planId)
    .first<any>()

  if (!plan) {
    throw new Error('Plano não encontrado')
  }

  // Get or create customer
  const reader = await env.DB.prepare('SELECT * FROM reader_users WHERE id = ?')
    .bind(readerUserId)
    .first<any>()

  if (!reader) {
    throw new Error('Leitor não encontrado')
  }

  const asaasCustomerId = await createOrUpdateAsaasCustomer(env, readerUserId, {
    name: reader.name || reader.email,
    email: reader.email,
  })

  // Create subscription
  const value = plan.price_cents / 100
  const nextDueDate = new Date()
  nextDueDate.setDate(nextDueDate.getDate() + (plan.trial_days || 0))

  const subscription = await client.createSubscription({
    customer: asaasCustomerId,
    billingType: 'PIX', // Default; pode ser configurável
    value,
    nextDueDate: nextDueDate.toISOString().split('T')[0],
    cycle: plan.billing_cycle === 'monthly' ? 'MONTHLY' : 'YEARLY',
    description: `Assinatura ${plan.name}`,
  })

  // Save to DB
  await env.DB.prepare(`
    INSERT INTO asaas_subscriptions (
      reader_user_id, plan_id, asaas_subscription_id, asaas_customer_id,
      status, current_period_end, asaas_environment, price_cents, billing_cycle,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    readerUserId,
    planId,
    subscription.id,
    asaasCustomerId,
    'pending',
    nextDueDate.toISOString(),
    config.environment,
    plan.price_cents,
    plan.billing_cycle
  ).run()

  return {
    subscriptionId: subscription.id,
    nextDueDate: nextDueDate.toISOString().split('T')[0],
  }
}

// ============================================================================
// ASAAS Webhook Schemas
// ============================================================================

export const asaasWebhookEventSchema = z.object({
  event: z.string(),
  payment: z.object({
    id: z.string(),
    customer: z.string(),
    subscription: z.string().optional(),
    billingType: z.string(),
    value: z.number().optional(),
    netValue: z.number().optional(),
    status: z.string(),
    confirmedDate: z.string().optional(),
    dueDate: z.string().optional(),
  }).passthrough(),
})

export type AsaasWebhookEvent = z.infer<typeof asaasWebhookEventSchema>

// ============================================================================
// ASAAS Webhook Handler
// ============================================================================

export async function handleAsaasWebhook(
  env: Env,
  event: AsaasWebhookEvent,
  requestId: string
): Promise<void> {
  const eventType = event.event
  const payment = event.payment

  // Verificar se subscription exists
  if (!payment.subscription) {
    console.log('Webhook sem subscription, ignorando')
    return
  }

  // Buscar subscription no DB
  const subscription = await env.DB.prepare(
    'SELECT * FROM asaas_subscriptions WHERE asaas_subscription_id = ?'
  ).bind(payment.subscription).first<any>()

  if (!subscription) {
    console.warn('Subscription não encontrada:', payment.subscription)
    return
  }

  // Aplicar mudanças baseado no evento
  switch (eventType) {
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_CONFIRMED':
      await activateSubscription(env, subscription, requestId)
      break

    case 'PAYMENT_OVERDUE':
      await suspendSubscription(env, subscription, requestId)
      break

    case 'PAYMENT_REFUNDED':
      await cancelSubscription(env, subscription, requestId)
      break

    default:
      console.log('Evento ASAAS não tratado:', eventType)
  }
}

async function activateSubscription(env: Env, subscription: any, requestId: string): Promise<void> {
  // Update subscription status
  await env.DB.prepare(`
    UPDATE asaas_subscriptions 
    SET status = 'active', updated_at = datetime('now')
    WHERE id = ?
  `).bind(subscription.id).run()

  // Create or update entitlement
  const periodEnd = new Date()
  if (subscription.billing_cycle === 'monthly') {
    periodEnd.setMonth(periodEnd.getMonth() + 1)
  } else {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  }

  await env.DB.prepare(`
    INSERT INTO entitlements (
      reader_user_id, plan_id, status, 
      current_period_start, current_period_end,
      created_at, updated_at
    ) VALUES (?, ?, 'active', datetime('now'), ?, datetime('now'), datetime('now'))
    ON CONFLICT(reader_user_id) DO UPDATE SET
      status = 'active',
      plan_id = excluded.plan_id,
      current_period_start = datetime('now'),
      current_period_end = excluded.current_period_end,
      updated_at = datetime('now')
  `).bind(subscription.reader_user_id, subscription.plan_id, periodEnd.toISOString()).run()

  // Audit log
  await env.DB.prepare(`
    INSERT INTO audit_log (
      entity_type, entity_id, action, actor_type, actor_id,
      details_json, request_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    'subscription',
    subscription.id.toString(),
    'activate',
    'webhook',
    'asaas',
    JSON.stringify({ event: 'PAYMENT_CONFIRMED' }),
    requestId
  ).run()
}

async function suspendSubscription(env: Env, subscription: any, requestId: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE asaas_subscriptions 
    SET status = 'suspended', updated_at = datetime('now')
    WHERE id = ?
  `).bind(subscription.id).run()

  await env.DB.prepare(`
    UPDATE entitlements 
    SET status = 'suspended', updated_at = datetime('now')
    WHERE reader_user_id = ?
  `).bind(subscription.reader_user_id).run()

  // Audit log
  await env.DB.prepare(`
    INSERT INTO audit_log (
      entity_type, entity_id, action, actor_type, actor_id,
      details_json, request_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    'subscription',
    subscription.id.toString(),
    'suspend',
    'webhook',
    'asaas',
    JSON.stringify({ event: 'PAYMENT_OVERDUE' }),
    requestId
  ).run()
}

async function cancelSubscription(env: Env, subscription: any, requestId: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE asaas_subscriptions 
    SET status = 'canceled', updated_at = datetime('now')
    WHERE id = ?
  `).bind(subscription.id).run()

  await env.DB.prepare(`
    UPDATE entitlements 
    SET status = 'canceled', canceled_at = datetime('now'), updated_at = datetime('now')
    WHERE reader_user_id = ?
  `).bind(subscription.reader_user_id).run()

  // Audit log
  await env.DB.prepare(`
    INSERT INTO audit_log (
      entity_type, entity_id, action, actor_type, actor_id,
      details_json, request_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    'subscription',
    subscription.id.toString(),
    'cancel',
    'webhook',
    'asaas',
    JSON.stringify({ event: 'PAYMENT_REFUNDED' }),
    requestId
  ).run()
}
