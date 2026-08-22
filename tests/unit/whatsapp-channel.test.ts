import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeWhatsAppTopics, verifyWhatsAppSignature } from '../../packages/core/whatsapp/service'

describe('Canal editorial do WhatsApp', () => {
  it('aceita cobertura nacional e regional sem duplicar preferências', () => {
    expect(normalizeWhatsAppTopics(['brasil', 'mundo', 'piaui', 'brasil', 'invalido'])).toEqual(['brasil', 'mundo', 'piaui'])
  })

  it('valida a assinatura HMAC enviada pela Meta', async () => {
    const secret = 'segredo-de-teste-whatsapp'
    const body = JSON.stringify({ object: 'whatsapp_business_account' })
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    const signature = `sha256=${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
    expect(await verifyWhatsAppSignature({ WHATSAPP_APP_SECRET: secret } as any, body, signature)).toBe(true)
    expect(await verifyWhatsAppSignature({ WHATSAPP_APP_SECRET: secret } as any, body + 'x', signature)).toBe(false)
  })

  it('mantém os segredos fora do banco de dados', () => {
    const migration = readFileSync(new URL('../../migrations/0041_whatsapp_audience.sql', import.meta.url), 'utf8')
    expect(migration).not.toContain('access_token')
    expect(migration).not.toContain('app_secret')
    expect(migration).not.toContain('verify_token')
  })

  it('registra landing page, webhook e fluxo administrativo', () => {
    const routes = readFileSync(new URL('../../functions/index.ts', import.meta.url), 'utf8')
    expect(routes).toContain("app.get('/whatsapp'")
    expect(routes).toContain("app.post('/api/webhooks/whatsapp'")
    expect(routes).toContain("app.get('/admin/whatsapp'")
    expect(routes).toContain("app.post('/admin/whatsapp/campanhas/:id{[0-9]+}/enviar'")
  })

  it('apresenta cobertura do Piauí, Brasil e mundo', () => {
    const landing = readFileSync(new URL('../../packages/core/web/whatsapp.ts', import.meta.url), 'utf8')
    expect(landing).toContain('do Piauí, do Brasil e do mundo')
    expect(landing).toContain("['brasil', 'Brasil'")
    expect(landing).toContain("['mundo', 'Mundo'")
  })
})
