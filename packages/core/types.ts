/**
 * Core Types & Schemas
 * 
 * Definições de tipos TypeScript e schemas Zod para validação
 */

import { z } from 'zod'

// ============================================================================
// Environment & Bindings
// ============================================================================

export interface Env {
  // Cloudflare Bindings
  DB: D1Database
  KV: KVNamespace
  CACHE: KVNamespace // Alias para KV (bootstrap cache)
  R2: R2Bucket

  // Environment Variables
  JWT_SECRET: string
  ADMIN_BOOTSTRAP_EMAIL: string
  ADMIN_BOOTSTRAP_PASSWORD: string
  ADMIN_BOOTSTRAP_TOKEN?: string
  ALLOW_ADMIN_BOOTSTRAP?: string
  N8N_WEBHOOK_SECRET: string
  N8N_API_KEY: string
  R2_BUCKET_NAME: string
  PUBLIC_BASE_URL: string
  CF_ENV: 'dev' | 'staging' | 'prod'

  // Push (VAPID)
  PUSH_VAPID_PUBLIC_KEY?: string
  PUSH_VAPID_PRIVATE_KEY?: string
  PUSH_VAPID_SUBJECT?: string

  // ASAAS Bootstrap (APENAS dev/staging)
  ASAAS_BOOTSTRAP_API_KEY?: string
  ASAAS_BOOTSTRAP_ENVIRONMENT?: 'sandbox' | 'production'

  // Opcionais (controláveis via CMS)
  ADSENSE_CLIENT_ID?: string
  GAM_NETWORK_CODE?: string
  NEWSLETTER_PROVIDER?: 'mailchimp' | 'sendgrid' | 'internal' | 'smtp'
  NEWSLETTER_API_KEY?: string
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USERNAME?: string
  SMTP_PASSWORD?: string
  SMTP_FROM_EMAIL?: string
  SMTP_FROM_NAME?: string
  NEWSLETTER_DAILY_LIMIT?: string
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string
  WHATSAPP_ACCESS_TOKEN?: string
  WHATSAPP_APP_SECRET?: string
  WHATSAPP_VERIFY_TOKEN?: string
  WHATSAPP_PHONE_NUMBER_ID?: string
  WHATSAPP_WABA_ID?: string
  WHATSAPP_BUSINESS_NUMBER?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
}

export const envSchema = z.object({
  DB: z.custom<D1Database>(),
  KV: z.custom<KVNamespace>(),
  R2: z.custom<R2Bucket>(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email('Invalid ADMIN_BOOTSTRAP_EMAIL'),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(8, 'ADMIN_BOOTSTRAP_PASSWORD must be at least 8 characters'),
  ADMIN_BOOTSTRAP_TOKEN: z.string().min(32, 'ADMIN_BOOTSTRAP_TOKEN must be at least 32 characters').optional(),
  ALLOW_ADMIN_BOOTSTRAP: z.string().optional(),
  N8N_WEBHOOK_SECRET: z.string().min(32, 'N8N_WEBHOOK_SECRET must be at least 32 characters'),
  R2_BUCKET_NAME: z.string().min(1, 'R2_BUCKET_NAME is required'),
  PUBLIC_BASE_URL: z.string().url('Invalid PUBLIC_BASE_URL'),
  CF_ENV: z.enum(['dev', 'staging', 'prod']),
  PUSH_VAPID_PUBLIC_KEY: z.string().optional(),
  PUSH_VAPID_PRIVATE_KEY: z.string().optional(),
  PUSH_VAPID_SUBJECT: z.string().optional(),
  ASAAS_BOOTSTRAP_API_KEY: z.string().optional(),
  ASAAS_BOOTSTRAP_ENVIRONMENT: z.enum(['sandbox', 'production']).optional(),
  ADSENSE_CLIENT_ID: z.string().optional(),
  GAM_NETWORK_CODE: z.string().optional(),
  NEWSLETTER_PROVIDER: z.enum(['mailchimp', 'sendgrid', 'internal', 'smtp']).optional(),
  NEWSLETTER_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().email().optional(),
  SMTP_FROM_NAME: z.string().optional(),
  NEWSLETTER_DAILY_LIMIT: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_WABA_ID: z.string().optional(),
  WHATSAPP_BUSINESS_NUMBER: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
})

// ============================================================================
// Context (Hono context extensions)
// ============================================================================

export interface AppContext {
  requestId: string
  cspNonce?: string  // CSP nonce for script-src
  csrfToken?: string  // CSRF token for admin forms
  formData?: FormData  // FormData for multipart/form-data uploads
  user?: {
    id: number
    email: string
    role: 'admin' | 'editor'
  }
  adminUser?: {
    id: number
    email: string
    role: string
    is_active?: number
    name?: string
  }
  readerUser?: {
    id: number
    email: string
    isSubscriber: boolean
  }
  subscriber?: {
    id: number
    email: string
    name: string | null
    phone: string | null
    cpf: string | null
    status: 'active' | 'blocked'
    created_at: string
  } | null
  parsedBody?: any // Cached parsed body for CSRF validation
}

export interface AdminUser {
  id: number
  email: string
  role: string
  name?: string
  is_active?: number
}

// ============================================================================
// Database Models
// ============================================================================

export interface User {
  id: number
  email: string
  password_hash: string
  name: string
  role: 'admin' | 'editor'
  is_active: number
  created_at: string
  updated_at: string
}

export interface Author {
  id: number
  slug: string
  name: string
  bio?: string
  avatar_media_id?: number
  email?: string
  social_twitter?: string
  social_instagram?: string
  social_linkedin?: string
  is_active: number
  author_type: 'staff' | 'columnist' | 'editorial' | 'contributor'
  created_at: string
  updated_at: string
}

export interface Category {
  id: number
  slug: string
  name: string
  description?: string
  parent_id?: number
  seo_title?: string
  seo_description?: string
  is_active: number
  display_order: number
  created_at: string
  updated_at: string
}

export interface Tag {
  id: number
  slug: string
  name: string
  description?: string
  seo_noindex: number
  social_title?: string
  social_description?: string
  social_share_text?: string
  social_image_media_id?: number
  social_image_position_x?: number
  social_image_position_y?: number
  created_at: string
  updated_at: string
}

export interface Post {
  id: number
  slug: string
  title: string
  hat?: string
  excerpt?: string
  content: string
  content_markdown?: string
  content_json?: string
  content_format?: 'legacy' | 'markdown' | 'visual'
  content_version?: number
  category_id: number
  author_id: number
  cover_media_id?: number
  status: 'draft' | 'review' | 'published' | 'archived'
  template: 'article' | 'liveblog' | 'hub' | 'story'
  opinion_type?: 'news' | 'editorial' | 'article' | 'column'
  opinion_featured?: number
  seo_title?: string
  seo_description?: string
  seo_canonical?: string
  seo_noindex: number
  is_premium: number
  paywall_tier?: 'hard' | 'metered' | 'free'
  metering_exempt: number
  breaking_until?: string
  published_at?: string
  scheduled_at?: string
  is_live: number
  original_link?: string
  created_at: string
  updated_at: string
}

export interface Media {
  id: number
  r2_key: string
  filename: string
  mime_type: string
  size_bytes: number
  width?: number
  height?: number
  alt?: string
  credits?: string
  variants_json?: string
  placeholder?: string
  uploaded_by_user_id?: number
  uploaded_at: string
}

export interface ReaderUser {
  id: number
  email: string
  name?: string
  password_hash?: string
  is_verified: number
  verification_token?: string
  reset_token?: string
  reset_expires_at?: string
  last_login_at?: string
  created_at: string
  updated_at: string
}

export interface Plan {
  id: number
  slug: string
  name: string
  description?: string
  price_cents: number
  currency: string
  billing_cycle: 'monthly' | 'yearly'
  trial_days: number
  benefits_json?: string
  asaas_external_ref?: string
  is_active: number
  display_order: number
  created_at: string
  updated_at: string
}

export interface Entitlement {
  id: number
  reader_user_id: number
  plan_id: number
  status: 'active' | 'suspended' | 'canceled' | 'expired'
  current_period_start?: string
  current_period_end?: string
  cancel_at_period_end: number
  canceled_at?: string
  created_at: string
  updated_at: string
}

// ============================================================================
// Validation Schemas
// ============================================================================

// Auth
export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

// Posts
export const createPostSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200),
  excerpt: z.string().max(500).optional(),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  category_id: z.number().int().positive(),
  author_id: z.number().int().positive(),
  cover_media_id: z.number().int().positive().optional(),
  author_type: z.enum(['staff', 'columnist', 'editorial', 'contributor']).default('staff'),
  status: z.enum(['draft', 'review', 'published', 'archived']).default('draft'),
  template: z.enum(['article', 'liveblog', 'hub', 'story']).default('article'),
  opinion_type: z.enum(['news', 'editorial', 'article', 'column']).default('news'),
  opinion_featured: z.number().int().min(0).max(1).default(0),
  seo_title: z.string().max(70).optional(),
  seo_description: z.string().max(160).optional(),
  is_premium: z.number().int().min(0).max(1).default(0),
  paywall_tier: z.enum(['hard', 'metered', 'free']).optional(),
  tags: z.array(z.number().int().positive()).optional(),
  scheduled_at: z.string().datetime().optional(),
})

export const updatePostSchema = createPostSchema.partial()

// Media Upload
export const uploadMediaSchema = z.object({
  file: z.custom<File>(),
  alt: z.string().max(200).optional(),
  credits: z.string().max(200).optional(),
})

// Settings
export const settingSchema = z.object({
  key: z.string().min(1).max(100),
  value_json: z.string().min(1), // JSON stringified
  scope: z.enum(['public', 'private']).default('public'),
})

// Plans
export const createPlanSchema = z.object({
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  price_cents: z.number().int().min(0),
  currency: z.string().length(3).default('BRL'),
  billing_cycle: z.enum(['monthly', 'yearly']),
  trial_days: z.number().int().min(0).default(0),
  benefits_json: z.string().optional(),
  asaas_external_ref: z.string().max(100).optional(),
})

export const updatePlanSchema = createPlanSchema.partial()

// Reader Registration
export const readerRegisterSchema = z.object({
  email: z.string().email('Email inválido'),
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100).optional(),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').optional(),
})

export const readerLoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6).optional(), // opcional se usar magic link
})

// Newsletter
export const newsletterSubscribeSchema = z.object({
  email: z.string().email('Email inválido'),
  name: z.string().min(2).max(100).optional(),
  segments: z.array(z.string()).optional(),
})

// Push Subscription
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  segments: z.array(z.string()).optional(),
})

// n8n Webhook
export const n8nWebhookSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  entity: z.enum(['post', 'media']),
  data: z.record(z.any()),
  media_urls: z.array(z.string().url()).optional(),
})

// ASAAS Webhook
export const asaasWebhookSchema = z.object({
  event: z.string(),
  payment: z.object({
    id: z.string(),
    customer: z.string(),
    subscription: z.string().optional(),
    status: z.string(),
    value: z.number().optional(),
    netValue: z.number().optional(),
    confirmedDate: z.string().optional(),
  }).passthrough(),
})

// ============================================================================
// Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  meta?: Record<string, any>
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    page: number
    perPage: number
    total: number
    totalPages: number
  }
}

// ============================================================================
// Paywall Types
// ============================================================================

export interface PaywallRule {
  mode: 'free' | 'metered' | 'hard' | 'hybrid'
  meter_limit?: number
  meter_window?: 'monthly'
  meter_soft_cta_at?: number
  lock_after_ratio_mobile?: number
  lock_after_ratio_desktop?: number
  exempt_templates?: string[]
}

export interface MeteringState {
  identifier: string
  identifierType: 'anon' | 'user'
  count: number
  limit: number
  remaining: number
  isLocked: boolean
}

// ============================================================================
// Logging
// ============================================================================

export interface LogContext {
  requestId: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  meta?: Record<string, any>
}

export function createLogger(requestId: string) {
  const log = (level: LogContext['level'], message: string, meta?: Record<string, any>) => {
    const ctx: LogContext = {
      requestId,
      timestamp: new Date().toISOString(),
      level,
      message,
      meta,
    }
    // Em produção, enviar para serviço externo ou Cloudflare Logs
    console.log(JSON.stringify(ctx))
  }

  return {
    debug: (message: string, meta?: Record<string, any>) => log('debug', message, meta),
    info: (message: string, meta?: Record<string, any>) => log('info', message, meta),
    warn: (message: string, meta?: Record<string, any>) => log('warn', message, meta),
    error: (message: string, meta?: Record<string, any>) => log('error', message, meta),
  }
}

// ============================================================================
// Utility Types
// ============================================================================

export type Nullable<T> = T | null
export type Optional<T> = T | undefined

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}
