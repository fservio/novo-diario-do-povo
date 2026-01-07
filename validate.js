#!/usr/bin/env node

/**
 * Portal Jornalístico - Script de Validação Completo
 * 
 * Valida toda infraestrutura antes do deploy:
 * - TypeScript (sem erros)
 * - Build (Vite SSR)
 * - Rotas principais
 * - SEO (sitemaps, RSS, JSON-LD)
 * - Paywall (cookie, snippet)
 * - Webhook Asaas (auth, idempotência)
 * - Segurança
 * - Performance
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync, statSync } from 'fs'
import { resolve } from 'path'

const errors = []
const warnings = []

function error(msg) {
  errors.push(`❌ ${msg}`)
}

function warning(msg) {
  warnings.push(`⚠️  ${msg}`)
}

function success(msg) {
  console.log(`✅ ${msg}`)
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('='.repeat(60))
}

// ============================================================================
// 1. TYPESCRIPT
// ============================================================================
section('1. TypeScript Type Check')

try {
  execSync('npm run typecheck', { stdio: 'pipe' })
  success('TypeScript: Sem erros de tipo')
} catch (e) {
  error('TypeScript: Erros encontrados (execute npm run typecheck)')
}

// ============================================================================
// 2. BUILD
// ============================================================================
section('2. Build Production')

try {
  execSync('npm run build', { stdio: 'pipe' })
  success('Build: Sucesso')
  
  if (!existsSync('./dist/_worker.js')) {
    error('Build: Faltando dist/_worker.js')
  } else {
    const size = statSync('./dist/_worker.js').size
    success(`Build: _worker.js gerado (${(size / 1024).toFixed(2)} KB)`)
    
    if (size > 5 * 1024 * 1024) {
      warning('Build: Worker muito grande (>5MB), otimizar')
    }
  }
  
  if (!existsSync('./dist/_routes.json')) {
    warning('Build: Faltando dist/_routes.json (rotas não otimizadas)')
  }
} catch (e) {
  error('Build: Falhou (execute npm run build)')
}

// ============================================================================
// 3. ESTRUTURA DE ARQUIVOS
// ============================================================================
section('3. Estrutura de Arquivos')

const requiredFiles = [
  'wrangler.jsonc',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  '.dev.vars.example',
  'README.md',
  'migrations/0001_initial_schema.sql',
  'scripts/seed.sql',
  'functions/index.ts',
  'packages/core/types.ts',
  'packages/core/auth/index.ts',
  'packages/core/db/index.ts',
  'packages/core/middleware/index.ts',
  'packages/core/storage/index.ts',
  'packages/core/paywall/index.ts',
  'packages/core/paywall/helpers.ts',
  'packages/core/paywall/snippet.ts',
  'packages/core/seo/index.ts',
  'packages/core/integrations/asaas/index.ts',
  'packages/core/ads/index.ts',
  'packages/core/admin/ui.ts',
  'packages/core/admin/settings.ts',
  'packages/core/admin/asaas.ts',
  'packages/core/admin/ads.ts',
  'packages/core/middleware/requireAdmin.ts',
  'public/static/styles.css',
  'public/static/app.js'
]

requiredFiles.forEach(file => {
  if (existsSync(file)) {
    success(`Arquivo: ${file}`)
  } else {
    error(`Arquivo faltando: ${file}`)
  }
})

// ============================================================================
// 4. CONFIGURAÇÃO WRANGLER
// ============================================================================
section('4. Configuração Wrangler')

try {
  const wranglerContent = readFileSync('./wrangler.jsonc', 'utf-8')
  const config = JSON.parse(
    wranglerContent.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  )
  
  if (!config.name) error('wrangler.jsonc: Faltando "name"')
  else success(`wrangler.jsonc: name="${config.name}"`)
  
  if (!config.compatibility_date) error('wrangler.jsonc: Faltando "compatibility_date"')
  else success(`wrangler.jsonc: compatibility_date="${config.compatibility_date}"`)
  
  if (!config.d1_databases || config.d1_databases.length === 0) {
    warning('wrangler.jsonc: Nenhum banco D1 configurado')
  } else {
    success(`wrangler.jsonc: ${config.d1_databases.length} banco(s) D1 configurado(s)`)
  }
  
  if (!config.kv_namespaces || config.kv_namespaces.length === 0) {
    warning('wrangler.jsonc: Nenhum KV namespace configurado')
  } else {
    success(`wrangler.jsonc: ${config.kv_namespaces.length} KV namespace(s) configurado(s)`)
  }
  
  if (!config.r2_buckets || config.r2_buckets.length === 0) {
    warning('wrangler.jsonc: Nenhum bucket R2 configurado')
  } else {
    success(`wrangler.jsonc: ${config.r2_buckets.length} bucket(s) R2 configurado(s)`)
  }
} catch (e) {
  error(`wrangler.jsonc: Erro ao parsear (${e.message})`)
}

// ============================================================================
// 5. MIGRATIONS
// ============================================================================
section('5. Migrations SQL')

const migrationFile = './migrations/0001_initial_schema.sql'
if (existsSync(migrationFile)) {
  const sql = readFileSync(migrationFile, 'utf-8')
  
  const requiredTables = [
    'categories', 'tags', 'authors', 'posts', 'posts_tags',
    'pages', 'menus', 'editorial_hubs', 'liveblogs', 'liveblog_entries',
    'stories', 'story_pages', 'media', 'media_variants',
    'ads_slots', 'ads_campaigns', 'ads_targeting_rules',
    'reader_users', 'plans', 'entitlements', 'asaas_customers',
    'asaas_subscriptions', 'paywall_rules', 'paywall_views',
    'newsletter_subscribers', 'push_subscriptions',
    'webhook_events', 'settings', 'audit_log'
  ]
  
  requiredTables.forEach(table => {
    if (sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      success(`Migration: tabela "${table}"`)
    } else {
      error(`Migration: faltando tabela "${table}"`)
    }
  })
} else {
  error('Migration: arquivo 0001_initial_schema.sql não encontrado')
}

// ============================================================================
// 6. ROTAS PRINCIPAIS
// ============================================================================
section('6. Rotas Principais')

const indexFile = './functions/index.ts'
if (existsSync(indexFile)) {
  const code = readFileSync(indexFile, 'utf-8')
  
  const routes = [
    { path: "app.get('/', ", desc: 'Homepage SSR' },
    { path: "app.get('/noticia/:slug', ", desc: 'Artigo com paywall' },
    { path: "app.get('/categoria/:slug', ", desc: 'Categoria (listagem)' },
    { path: "app.get('/tag/:slug', ", desc: 'Tag (listagem)' },
    { path: "app.get('/autor/:slug', ", desc: 'Autor (listagem)' },
    { path: "app.get('/assinar', ", desc: 'Página de assinatura' },
    { path: "app.get('/conta', ", desc: 'Área do leitor' },
    { path: "app.get('/api/health', ", desc: 'Healthcheck' },
    { path: "app.get('/robots.txt', ", desc: 'Robots.txt' },
    { path: "app.get('/sitemap.xml', ", desc: 'Sitemap geral' },
    { path: "app.get('/sitemap-news.xml', ", desc: 'Sitemap Google News' },
    { path: "app.get('/rss.xml', ", desc: 'RSS geral' },
    { path: "app.post('/api/webhooks/asaas', ", desc: 'Webhook Asaas' },
    { path: "/i/:key", desc: 'Serving R2 imagens' },
    { path: "app.get('/admin/login', ", desc: 'Admin Login' },
    { path: "app.post('/admin/login', ", desc: 'Admin Login POST' },
    { path: "app.get('/admin', ", desc: 'Admin Dashboard' },
    { path: "app.get('/admin/settings', ", desc: 'Admin Settings' },
    { path: "app.get('/admin/asaas', ", desc: 'Admin Asaas' },
    { path: "app.get('/admin/ads', ", desc: 'Admin Ads' }
  ]
  
  routes.forEach(({ path, desc }) => {
    if (code.includes(path)) {
      success(`Rota: ${desc}`)
    } else {
      error(`Rota faltando: ${desc} (${path})`)
    }
  })
} else {
  error('Arquivo functions/index.ts não encontrado')
}

// ============================================================================
// 7. SEO
// ============================================================================
section('7. SEO Features')

if (existsSync(indexFile)) {
  const code = readFileSync(indexFile, 'utf-8')
  
  // Sitemap News
  if (code.includes('/sitemap-news.xml')) {
    success('SEO: Sitemap Google News')
  } else {
    error('SEO: Faltando /sitemap-news.xml')
  }
  
  // RSS
  if (code.includes('/rss.xml')) {
    success('SEO: RSS Feed')
  } else {
    error('SEO: Faltando /rss.xml')
  }
  
  // RSS por seção
  if (code.includes("/rss/:section.xml'") || code.includes('/rss/:section.xml')) {
    success('SEO: RSS por seção')
  } else {
    warning('SEO: RSS por seção não encontrado')
  }
  
  // JSON-LD
  if (code.includes('application/ld+json') || code.includes('generateJsonLD')) {
    success('SEO: JSON-LD (Schema.org)')
  } else {
    warning('SEO: JSON-LD não encontrado')
  }
  
  // Canonical
  if (code.includes('rel="canonical"') || code.includes('canonical')) {
    success('SEO: Canonical URL')
  } else {
    warning('SEO: Canonical URL não encontrado')
  }
}

// ============================================================================
// 8. PAYWALL
// ============================================================================
section('8. Paywall')

const paywallHelpers = './packages/core/paywall/helpers.ts'
const paywallSnippet = './packages/core/paywall/snippet.ts'

if (existsSync(paywallHelpers)) {
  const code = readFileSync(paywallHelpers, 'utf-8')
  
  if (code.includes('signPaywallCookie') && code.includes('verifyPaywallCookie')) {
    success('Paywall: Cookie assinado (HMAC)')
  } else {
    error('Paywall: Faltando funções de cookie assinado')
  }
  
  if (code.includes('getReaderContext')) {
    success('Paywall: Reader context')
  } else {
    error('Paywall: Faltando getReaderContext')
  }
} else {
  error('Paywall: arquivo helpers.ts não encontrado')
}

if (existsSync(paywallSnippet)) {
  const code = readFileSync(paywallSnippet, 'utf-8')
  
  if (code.includes('extractSecureSnippet')) {
    success('Paywall: Snippet seguro (sem cortar HTML)')
  } else {
    error('Paywall: Faltando extractSecureSnippet')
  }
} else {
  error('Paywall: arquivo snippet.ts não encontrado')
}

// ============================================================================
// 9. WEBHOOK ASAAS
// ============================================================================
section('9. Webhook Asaas')

if (existsSync(indexFile)) {
  const code = readFileSync(indexFile, 'utf-8')
  
  // Autenticação
  if (code.includes('x-asaas-token') || code.includes('X-ASAAS-TOKEN')) {
    success('Webhook: Autenticação via header')
  } else {
    error('Webhook: Faltando autenticação x-asaas-token')
  }
  
  // Zod validation
  if (code.includes('asaasWebhookSchema') || code.includes('.safeParse(')) {
    success('Webhook: Validação Zod')
  } else {
    warning('Webhook: Validação Zod não detectada')
  }
  
  // Idempotência
  if (code.includes('sha256') || code.includes('payload_hash')) {
    success('Webhook: Idempotência (SHA-256)')
  } else {
    error('Webhook: Faltando idempotência SHA-256')
  }
  
  // Audit log
  if (code.includes('audit_log') || code.includes('webhook_events')) {
    success('Webhook: Audit log')
  } else {
    warning('Webhook: Audit log não detectado')
  }
}

// ============================================================================
// 10. SEGURANÇA
// ============================================================================
section('10. Segurança')

const securityMw = './packages/core/middleware/security.ts'
if (existsSync(securityMw)) {
  const code = readFileSync(securityMw, 'utf-8')
  
  if (code.includes('X-Frame-Options')) {
    success('Segurança: X-Frame-Options')
  } else {
    warning('Segurança: Faltando X-Frame-Options')
  }
  
  if (code.includes('Content-Security-Policy')) {
    success('Segurança: CSP')
  } else {
    warning('Segurança: Faltando CSP')
  }
  
  if (code.includes('Strict-Transport-Security')) {
    success('Segurança: HSTS')
  } else {
    warning('Segurança: Faltando HSTS')
  }
  
  if (code.includes('X-Content-Type-Options')) {
    success('Segurança: X-Content-Type-Options')
  } else {
    warning('Segurança: Faltando X-Content-Type-Options')
  }
} else {
  error('Segurança: arquivo security.ts não encontrado')
}

// Rate limiting
const rateLimitMw = './packages/core/middleware/ratelimit.ts'
if (existsSync(rateLimitMw)) {
  success('Segurança: Rate limiting configurado')
} else {
  warning('Segurança: Rate limiting não encontrado')
}

// ============================================================================
// 11. BOOTSTRAP ADMIN
// ============================================================================
section('11. Bootstrap Admin')

if (existsSync(indexFile)) {
  const code = readFileSync(indexFile, 'utf-8')
  
  // Idempotência
  if (code.includes('bootstrap:done') || code.includes('BOOTSTRAP_FLAG')) {
    success('Bootstrap: Idempotente (flag KV)')
  } else {
    error('Bootstrap: Não é idempotente')
  }
  
  // Posição (antes das rotas)
  const bootstrapPos = code.indexOf('bootstrapAdmin')
  const firstRoutePos = code.indexOf("app.get('/'")
  
  if (bootstrapPos > -1 && firstRoutePos > -1) {
    if (bootstrapPos < firstRoutePos) {
      success('Bootstrap: Executado antes das rotas')
    } else {
      error('Bootstrap: Deve ser executado ANTES das rotas')
    }
  }
}

// ============================================================================
// 12. CSS BUILD
// ============================================================================
section('12. CSS Build-Time')

const cssFile = './public/static/styles.css'
if (existsSync(cssFile)) {
  const css = readFileSync(cssFile, 'utf-8')
  
  if (css.includes('tailwind') || css.includes('cdn.tailwindcss.com')) {
    error('CSS: Ainda usa Tailwind CDN (deve usar build-time)')
  } else {
    success('CSS: Build-time (sem CDN)')
  }
  
  const size = statSync(cssFile).size
  success(`CSS: ${(size / 1024).toFixed(2)} KB`)
  
  if (size > 100 * 1024) {
    warning('CSS: Arquivo muito grande (>100KB), considerar purge')
  }
} else {
  error('CSS: arquivo styles.css não encontrado')
}

// Verificar HTML não tem Tailwind CDN
if (existsSync(indexFile)) {
  const code = readFileSync(indexFile, 'utf-8')
  if (code.includes('cdn.tailwindcss.com')) {
    error('HTML: Ainda usa Tailwind CDN')
  } else {
    success('HTML: Sem Tailwind CDN')
  }
}

// ============================================================================
// 13. 404 HANDLER
// ============================================================================
section('13. 404 Handler')

if (existsSync(indexFile)) {
  const code = readFileSync(indexFile, 'utf-8')
  
  if (code.includes('app.notFound')) {
    success('404: Handler configurado')
    
    // Verificar se retorna JSON para /api
    if (code.includes('/api') && code.includes('c.json(')) {
      success('404: Retorna JSON para rotas /api')
    } else {
      warning('404: Não detectado retorno JSON para /api')
    }
    
    // Verificar se retorna HTML para outras rotas
    if (code.includes('c.html(')) {
      success('404: Retorna HTML para outras rotas')
    } else {
      warning('404: Não detectado retorno HTML')
    }
  } else {
    error('404: Handler não configurado')
  }
}

// ============================================================================
// 14. ADMIN & ADS ENGINE
// ============================================================================

section('14. Admin & Ads Engine')

// Check admin modules
const adminModules = [
  'packages/core/admin/ui.ts',
  'packages/core/admin/settings.ts',
  'packages/core/admin/asaas.ts',
  'packages/core/admin/ads.ts',
  'packages/core/middleware/requireAdmin.ts'
]

adminModules.forEach(file => {
  if (existsSync(file)) {
    success(`Admin: ${file.split('/').pop()}`)
  } else {
    error(`Admin: faltando ${file}`)
  }
})

// Check ads module
const adsFile = 'packages/core/ads/index.ts'
if (existsSync(adsFile)) {
  const code = readFileSync(adsFile, 'utf-8')
  
  if (code.includes('export function renderAdSlot')) {
    success('Ads: renderAdSlot() exportado')
  } else {
    error('Ads: renderAdSlot() não encontrado')
  }
  
  if (code.includes('export async function findActiveSlotsByTemplate')) {
    success('Ads: findActiveSlotsByTemplate() exportado')
  } else {
    error('Ads: findActiveSlotsByTemplate() não encontrado')
  }
  
  if (code.includes('export async function generateAdsLoaderScript')) {
    success('Ads: generateAdsLoaderScript() exportado')
  } else {
    error('Ads: generateAdsLoaderScript() não encontrado')
  }
} else {
  error('Ads: packages/core/ads/index.ts não encontrado')
}

// ============================================================================
// 15. SECURITY TESTS (CSP, CSRF, Webhook)
// ============================================================================

section('15. Security Tests (CSP, CSRF, Webhook)')

// Test 1: CSP não contém cdn.tailwindcss.com
const securityFile = 'packages/core/middleware/security.ts'
if (existsSync(securityFile)) {
  const secCode = readFileSync(securityFile, 'utf-8')
  
  // Remove comments before checking
  const codeNoComments = secCode.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  
  if (codeNoComments.includes('cdn.tailwindcss.com')) {
    error('CSP: contém cdn.tailwindcss.com (deve ser removido)')
  } else {
    success('CSP: não contém cdn.tailwindcss.com')
  }
  
  // Test 2: CSP nonce instead of 'unsafe-inline' for script-src
  if (codeNoComments.includes("'nonce-")) {
    // Extract only the script-src directive line
    const lines = secCode.split('\n')
    const scriptSrcLine = lines.find(l => l.trim().startsWith('`script-src'))
    
    if (scriptSrcLine && scriptSrcLine.includes("'unsafe-inline'")) {
      error("CSP: contém 'unsafe-inline' em script-src (deve usar nonce)")
    } else {
      success("CSP: usa nonce (sem 'unsafe-inline' em script-src)")
    }
  } else {
    error("CSP: nonce não detectado em script-src")
  }
  
  // Test 3: 'unsafe-eval' controlado por setting
  if (secCode.includes("'unsafe-eval'") && secCode.includes('allowUnsafeEval')) {
    success("CSP: 'unsafe-eval' controlado por setting")
  } else if (secCode.includes("'unsafe-eval'")) {
    warning("CSP: 'unsafe-eval' presente mas não controlado por setting")
  } else {
    success("CSP: 'unsafe-eval' não presente")
  }
  
  // Test 4: CSP por diretiva (script/frame/connect/img)
  if (secCode.includes('ads.csp.script_hosts') && 
      secCode.includes('ads.csp.frame_hosts') &&
      secCode.includes('ads.csp.connect_hosts') &&
      secCode.includes('ads.csp.img_hosts')) {
    success('CSP: lê allowlist por diretiva (script/frame/connect/img)')
  } else {
    error('CSP: não lê allowlist por diretiva')
  }
  
  // Test 5: CSRF aceita form field
  if (secCode.includes('parseBody') && secCode.includes("body['csrf']")) {
    success('CSRF: aceita form field csrf')
  } else {
    error('CSRF: não aceita form field csrf (apenas header)')
  }
  
  // Test 6: CSRF bound à sessão (verifica owner)
  if (secCode.includes('adminUser.id') && (secCode.includes('uid !== adminUser.id') || secCode.includes('storedData'))) {
    success('CSRF: bound à sessão (verifica owner)')
  } else {
    error('CSRF: não bound à sessão')
  }
} else {
  error('Security: packages/core/middleware/security.ts não encontrado')
}

// Test 7: Webhook Asaas usa arrayBuffer para hash
const functionsIndexFile = 'functions/index.ts'
if (existsSync(functionsIndexFile)) {
  const indexCode = readFileSync(functionsIndexFile, 'utf-8')
  
  if (indexCode.includes('arrayBuffer()') && indexCode.includes('crypto.subtle.digest')) {
    success('Webhook: usa arrayBuffer() + SHA-256')
  } else if (indexCode.includes('req.text()')) {
    warning('Webhook: usa req.text() (arrayBuffer é mais robusto)')
  } else {
    error('Webhook: método de hash não detectado')
  }
  
  // Test 8: payload_hash tem 64 hex chars
  if (indexCode.includes('padStart(2') && indexCode.includes("join('')")) {
    success('Webhook: payload_hash formato hex correto')
  } else {
    warning('Webhook: formato de hash não confirmado')
  }
  
  // Test 9: Webhook stable_key (hybrid idempotency)
  if (indexCode.includes('stable_key') && indexCode.includes('stableKey')) {
    success('Webhook: idempotência híbrida (payload_hash + stable_key)')
  } else {
    error('Webhook: sem idempotência híbrida (stable_key ausente)')
  }
}

// Test 10: Seed ads contém settings CSP por diretiva
const seedAdsFile = 'scripts/seed_ads.sql'
if (existsSync(seedAdsFile)) {
  const seedCode = readFileSync(seedAdsFile, 'utf-8')
  
  if (seedCode.includes('ads.csp_allow_unsafe_eval')) {
    success('Seed: ads.csp_allow_unsafe_eval presente')
  } else {
    warning('Seed: ads.csp_allow_unsafe_eval ausente')
  }
  
  if (seedCode.includes('ads.csp.script_hosts') &&
      seedCode.includes('ads.csp.frame_hosts') &&
      seedCode.includes('ads.csp.connect_hosts') &&
      seedCode.includes('ads.csp.img_hosts')) {
    success('Seed: CSP por diretiva (script/frame/connect/img)')
  } else {
    error('Seed: CSP por diretiva ausente')
  }
}

// Test 11: Migration stable_key (0003)
const webhookMigrationFile = 'migrations/0003_webhook_stable_key.sql'
if (existsSync(webhookMigrationFile)) {
  success('Migration: 0003_webhook_stable_key.sql presente')
} else {
  error('Migration: 0003_webhook_stable_key.sql ausente')
}

// Test 12: Migration webhook_idempotency (0004) - RACE-FREE
const idempotencyMigrationFile = 'migrations/0004_webhook_idempotency.sql'
if (existsSync(idempotencyMigrationFile)) {
  const migCode = readFileSync(idempotencyMigrationFile, 'utf-8')
  if (migCode.includes('PRIMARY KEY (provider, stable_key)')) {
    success('Migration: 0004_webhook_idempotency.sql com PRIMARY KEY race-free')
  } else {
    error('Migration: 0004 existe mas sem PRIMARY KEY correto')
  }
} else {
  error('Migration: 0004_webhook_idempotency.sql ausente')
}

// Test 13: renderScript helper com nonce
const uiFile = 'packages/core/admin/ui.ts'
if (existsSync(uiFile)) {
  const uiCode = readFileSync(uiFile, 'utf-8')
  if (uiCode.includes('renderScript') && uiCode.includes('nonce')) {
    success('UI: renderScript helper com nonce presente')
  } else {
    warning('UI: renderScript helper não detectado')
  }
}

// ============================================================================
// 16. MICRO-AJUSTES OPERACIONAIS (3 critical)
// ============================================================================

section('16. Micro-Ajustes Operacionais (Nonce, CSRF, Webhook)')

// MICRO-AJUSTE 1: Nonce helper seguro (sem spread)
const cryptoFile = 'packages/core/utils/crypto.ts'
if (existsSync(cryptoFile)) {
  const cryptoCode = readFileSync(cryptoFile, 'utf-8')
  
  // Test 1.1: randomBytes sem spread
  if (cryptoCode.includes('String.fromCharCode(...bytes)')) {
    error('MICRO 1: crypto.ts usa spread operator (...bytes) - risco de stack overflow')
  } else if (cryptoCode.includes('randomBytes') && cryptoCode.includes('for (let i = 0; i < len; i++)')) {
    success('MICRO 1: crypto.ts usa loop seguro (sem spread operator)')
  } else {
    warning('MICRO 1: crypto.ts não confirmado com loop seguro')
  }
  
  // Test 1.2: toBase64 sem spread
  if (cryptoCode.includes('toBase64') && cryptoCode.includes('for (let i = 0; i < len; i++)')) {
    success('MICRO 1: toBase64 usa loop seguro')
  } else {
    error('MICRO 1: toBase64 não usa loop seguro')
  }
  
  // Test 1.3: randomHex presente
  if (cryptoCode.includes('randomHex') && cryptoCode.includes('toHex')) {
    success('MICRO 1: randomHex helper presente')
  } else {
    error('MICRO 1: randomHex helper ausente')
  }
} else {
  error('MICRO 1: packages/core/utils/crypto.ts ausente')
}

// MICRO-AJUSTE 2: CSRF por sessão (não por request)
const requireAdminFile = 'packages/core/middleware/requireAdmin.ts'
if (existsSync(requireAdminFile)) {
  const reqAdminCode = readFileSync(requireAdminFile, 'utf-8')
  
  // Test 2.1: requireAdmin lê cookie admin_csrf (não gera)
  if (reqAdminCode.includes('admin_csrf') && reqAdminCode.includes('csrfMatch')) {
    success('MICRO 2: requireAdmin lê cookie admin_csrf (não gera por request)')
  } else {
    error('MICRO 2: requireAdmin não lê cookie admin_csrf')
  }
  
  // Test 2.2: Não gera CSRF em requireAdmin
  if (reqAdminCode.includes('generateCSRFToken')) {
    error('MICRO 2: requireAdmin ainda gera CSRF (deve ser gerado no login)')
  } else {
    success('MICRO 2: requireAdmin não gera CSRF (correto)')
  }
} else {
  error('MICRO 2: packages/core/middleware/requireAdmin.ts ausente')
}

// Test 2.3: Login gera sessionId e CSRF
if (existsSync(functionsIndexFile)) {
  const indexCode = readFileSync(functionsIndexFile, 'utf-8')
  
  if (indexCode.includes('randomHex(16)') && 
      indexCode.includes('sid: sessionId') &&
      indexCode.includes('admin_csrf')) {
    success('MICRO 2: Login gera sessionId + CSRF e seta cookie admin_csrf')
  } else {
    error('MICRO 2: Login não gera sessionId/CSRF corretamente')
  }
  
  // Test 2.4: csrfProtection valida {uid, sid}
  if (securityFile && existsSync(securityFile)) {
    const secCode = readFileSync(securityFile, 'utf-8')
    if (secCode.includes('uid !== adminUser.id') && secCode.includes('sid !== sessionId')) {
      success('MICRO 2: csrfProtection valida uid + sid (CSRF bound à sessão)')
    } else {
      error('MICRO 2: csrfProtection não valida uid + sid')
    }
  }
}

// MICRO-AJUSTE 3: Webhook stable_key race-free
if (existsSync(functionsIndexFile)) {
  const indexCode = readFileSync(functionsIndexFile, 'utf-8')
  
  // Test 3.1: INSERT race-free em webhook_idempotency
  if (indexCode.includes('INSERT INTO webhook_idempotency') && 
      indexCode.includes('UNIQUE constraint failed')) {
    success('MICRO 3: Webhook usa INSERT race-free em webhook_idempotency')
  } else {
    error('MICRO 3: Webhook não usa INSERT race-free (ainda tem race condition)')
  }
  
  // Test 3.2: PRIMARY KEY collision detection
  if (indexCode.includes('already processed (stable_key race-free)')) {
    success('MICRO 3: Webhook detecta PRIMARY KEY collision (race-free)')
  } else {
    warning('MICRO 3: Webhook não retorna mensagem de collision específica')
  }
  
  // ========================================================================
  // AJUSTE FINAL 1: admin_csrf HttpOnly
  // ========================================================================
  if (indexCode.includes('admin_csrf=') && indexCode.includes('HttpOnly')) {
    success('AJUSTE FINAL 1: Cookie admin_csrf é HttpOnly (SSR-only)')
  } else {
    error('AJUSTE FINAL 1: Cookie admin_csrf não é HttpOnly')
  }
}

// ========================================================================
// AJUSTE FINAL 2: CSP Nonce base64url
// ========================================================================
if (securityFile && existsSync(securityFile)) {
  const secCode = readFileSync(securityFile, 'utf-8')
  
  // Check if generateNonce uses toBase64Url
  if (secCode.includes('toBase64Url')) {
    success('AJUSTE FINAL 2: CSP nonce usa base64url (URL-safe)')
  } else if (secCode.includes('toBase64(')) {
    error('AJUSTE FINAL 2: CSP nonce ainda usa base64 (não URL-safe)')
  } else {
    warning('AJUSTE FINAL 2: Método de nonce não detectado')
  }
}

// ============================================================================
// RESUMO FINAL
// ============================================================================
section('Resumo Final')

console.log('')
if (errors.length > 0) {
  console.log('❌ ERROS CRÍTICOS:')
  errors.forEach(e => console.log(`   ${e}`))
  console.log('')
}

if (warnings.length > 0) {
  console.log('⚠️  AVISOS:')
  warnings.forEach(w => console.log(`   ${w}`))
  console.log('')
}

const total = errors.length + warnings.length
if (total === 0) {
  console.log('✅ TUDO OK! Projeto pronto para deploy.')
  console.log('')
  console.log('Próximos passos:')
  console.log('  1. npm run db:migrate:local')
  console.log('  2. npm run db:seed')
  console.log('  3. npm run build')
  console.log('  4. pm2 start ecosystem.config.cjs')
  console.log('  5. npm run deploy')
  console.log('')
  process.exit(0)
} else {
  console.log(`⚠️  ${errors.length} erro(s) e ${warnings.length} aviso(s) encontrados.`)
  console.log('')
  if (errors.length > 0) {
    console.log('Corrija os erros antes do deploy.')
    process.exit(1)
  } else {
    console.log('Avisos não bloqueiam deploy, mas devem ser revisados.')
    process.exit(0)
  }
}
