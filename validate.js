#!/usr/bin/env node
/**
 * Validation Script
 * 
 * Verifica integridade do projeto antes de deploy
 */

import { readFile } from 'fs/promises'
import { join } from 'path'
import { execSync } from 'child_process'

const errors = []
const warnings = []

console.log('🔍 Validando projeto...\n')

// ============================================================================
// 1. Node Version
// ============================================================================

const nodeVersion = process.version
const requiredMajor = 20

const currentMajor = parseInt(nodeVersion.slice(1).split('.')[0])

if (currentMajor < requiredMajor) {
  errors.push(`Node.js ${requiredMajor}+ necessário. Atual: ${nodeVersion}`)
} else {
  console.log(`✅ Node.js version: ${nodeVersion}`)
}

// ============================================================================
// 2. Environment Variables
// ============================================================================

try {
  const envExample = await readFile('.dev.vars.example', 'utf-8')
  const requiredVars = [
    'JWT_SECRET',
    'ADMIN_BOOTSTRAP_EMAIL',
    'ADMIN_BOOTSTRAP_PASSWORD',
    'N8N_WEBHOOK_SECRET',
    'R2_BUCKET_NAME',
    'PUBLIC_BASE_URL',
    'CF_ENV',
  ]

  const missingVars = requiredVars.filter(v => !envExample.includes(v))
  
  if (missingVars.length > 0) {
    errors.push(`Variáveis obrigatórias ausentes no .dev.vars.example: ${missingVars.join(', ')}`)
  } else {
    console.log('✅ Environment variables template OK')
  }

  // Check ASAAS_BOOTSTRAP in production
  if (process.env.CF_ENV === 'prod' && process.env.ASAAS_BOOTSTRAP_API_KEY) {
    errors.push('ASAAS_BOOTSTRAP_API_KEY não deve estar presente em produção!')
  }
} catch (error) {
  errors.push('.dev.vars.example não encontrado')
}

// ============================================================================
// 3. TypeScript Check
// ============================================================================

try {
  console.log('\n🔎 Verificando TypeScript...')
  execSync('npm run typecheck', { stdio: 'inherit' })
  console.log('✅ TypeScript OK')
} catch (error) {
  errors.push('TypeScript typecheck falhou')
}

// ============================================================================
// 4. Essential Routes
// ============================================================================

const essentialRoutes = [
  '/api/health',
  '/robots.txt',
  '/sitemap-index.xml',
  '/sitemap.xml',
  '/',
]

console.log('\n🔎 Verificando rotas essenciais...')

// Simple check: verify routes are defined in functions/index.ts
try {
  const functionsIndex = await readFile('functions/index.ts', 'utf-8')
  
  const routeChecks = {
    '/api/health': functionsIndex.includes("'/api/health'"),
    '/robots.txt': functionsIndex.includes("'/robots.txt'"),
    '/sitemap-index.xml': functionsIndex.includes("'/sitemap-index.xml'"),
    '/sitemap.xml': functionsIndex.includes("'/sitemap.xml'"),
    '/': functionsIndex.includes("app.get('/'"),
  }

  for (const [route, exists] of Object.entries(routeChecks)) {
    if (exists) {
      console.log(`✅ Rota ${route} definida`)
    } else {
      errors.push(`Rota ${route} não encontrada`)
    }
  }

  // Check critical endpoints
  const criticalEndpoints = [
    '/api/webhooks/asaas',
    '/i/:key',
    '/noticia/:slug',
  ]

  for (const endpoint of criticalEndpoints) {
    const pattern = endpoint.replace(':key', '').replace(':slug', '')
    if (functionsIndex.includes(pattern)) {
      console.log(`✅ Endpoint ${endpoint} definido`)
    } else {
      errors.push(`Endpoint ${endpoint} não encontrado`)
    }
  }
} catch (error) {
  errors.push('Não foi possível verificar rotas: functions/index.ts não encontrado')
}

// ============================================================================
// 5. Migrations
// ============================================================================

console.log('\n🔎 Verificando migrations...')

try {
  const migration = await readFile('migrations/0001_initial_schema.sql', 'utf-8')
  
  const requiredTables = [
    'users',
    'posts',
    'categories',
    'tags',
    'media',
    'plans',
    'entitlements',
    'asaas_subscriptions',
    'webhook_events',
    'settings',
    'audit_log',
  ]

  for (const table of requiredTables) {
    if (migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) {
      console.log(`✅ Tabela ${table} definida`)
    } else {
      errors.push(`Tabela ${table} não encontrada na migration`)
    }
  }
} catch (error) {
  errors.push('Migration 0001_initial_schema.sql não encontrada')
}

// ============================================================================
// 6. Build Check
// ============================================================================

console.log('\n🔎 Verificando build...')

try {
  execSync('npm run build', { stdio: 'inherit' })
  console.log('✅ Build OK')
} catch (error) {
  errors.push('Build falhou')
}

// ============================================================================
// 7. Security Check
// ============================================================================

console.log('\n🔎 Verificando segurança...')

try {
  const authMiddleware = await readFile('packages/core/middleware/auth.ts', 'utf-8')
  const securityMiddleware = await readFile('packages/core/middleware/security.ts', 'utf-8')
  
  if (!authMiddleware.includes('authMiddleware') || !authMiddleware.includes('verifyJWT')) {
    errors.push('Auth middleware incompleto')
  } else {
    console.log('✅ Auth middleware OK')
  }

  if (!securityMiddleware.includes('securityHeaders') || !securityMiddleware.includes('Content-Security-Policy')) {
    errors.push('Security headers middleware incompleto')
  } else {
    console.log('✅ Security headers OK')
  }
} catch (error) {
  errors.push('Não foi possível verificar middlewares de segurança')
}

// ============================================================================
// Results
// ============================================================================

console.log('\n' + '='.repeat(60))

if (errors.length > 0) {
  console.log('\n❌ ERROS ENCONTRADOS:\n')
  errors.forEach(err => console.log(`  - ${err}`))
  console.log('\n')
  process.exit(1)
}

if (warnings.length > 0) {
  console.log('\n⚠️  AVISOS:\n')
  warnings.forEach(warn => console.log(`  - ${warn}`))
}

console.log('\n✅ VALIDAÇÃO CONCLUÍDA COM SUCESSO!\n')
console.log('Projeto pronto para deploy.\n')

process.exit(0)
