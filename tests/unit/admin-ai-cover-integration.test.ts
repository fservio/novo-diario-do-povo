import { expect, it, vi } from 'vitest'
import app from '../../functions/index'
import { signJWT } from '../../packages/core/auth'

vi.mock('../../packages/core/newsletter/smtp', () => ({ sendSmtpMessage: vi.fn() }))

it('configures the n8n cover integration through the CMS without exposing or clearing the secret', async () => {
  const settings = new Map<string, { scope: string; value_json: string }>()
  let role = 'director'
  function statement(sql: string, args: unknown[] = []): any {
    return {
      bind: (...values: unknown[]) => statement(sql, values),
      first: async () => sql.includes('FROM users') ? { id: 1, email: 'test@example.com', role, is_active: 1 } : null,
      all: async () => ({
        results: sql.includes('FROM settings')
          ? [...settings].filter(([key, value]) => value.scope === args[0] && (args.length === 1 || args.includes(key)))
            .map(([key, value]) => ({ key, ...value }))
          : []
      }),
      run: async () => {
        if (sql.includes('INSERT INTO settings')) {
          const [key, value_json, scope] = args as string[]
          settings.set(key, { value_json, scope })
        }
        return { meta: { changes: 1 } }
      }
    }
  }
  const env = {
    DB: { prepare: statement },
    CACHE: { get: async () => 'true' },
    KV: { get: async (key: string) => key === 'csrf:cover-token' ? JSON.stringify({ uid: 1, sid: 'test-session' }) : null, put: async () => {}, delete: async () => {} },
    PUBLIC_BASE_URL: 'https://diario.example.com',
    JWT_SECRET: 'test-only-cover-integration-session-secret'
  } as any
  const jwt = await signJWT({ sub: '1', type: 'admin', sid: 'test-session' } as any, env.JWT_SECRET)
  const request = (path: string, fields?: Record<string, string>) => app.request(path.split('#')[0], {
    method: fields ? 'POST' : 'GET',
    headers: { cookie: `admin_session=${jwt}; admin_csrf=cover-token` },
    body: fields ? new URLSearchParams(fields) : undefined
  }, env)

  const settingsPage = await request('/admin/settings')
  expect(settingsPage.status).toBe(200)
  const shortcut = (await settingsPage.text()).match(/href="([^"]+#capas-ia)"/)?.[1]
  expect(shortcut).toBe('/admin/integrations#capas-ia')
  const integrationPage = await request(shortcut!)
  expect(integrationPage.status).toBe(200)
  const html = await integrationPage.text()
  expect(html).toContain('Configuração incompleta')
  const action = html.match(/action="([^"]+\/ai-cover)"/)?.[1]
  expect(action).toBe('/admin/integrations/ai-cover')

  const secret = 'confidential-cover-credential'
  const fields = { webhook_url: 'https://n8n.example.com/webhook/covers', webhook_secret: secret, daily_limit: '35', enabled: '1' }
  expect((await request(action!, fields)).status).toBe(403)
  const invalid = await request(action!, { ...fields, daily_limit: '1.5', csrf: 'cover-token' })
  expect(invalid.headers.get('location')).toContain('cover_error=')
  expect(settings.size).toBe(0)

  const saved = await request(action!, { ...fields, csrf: 'cover-token' })
  expect(saved.status).toBe(303)
  expect(Object.fromEntries(settings)).toEqual({
    'ai_cover.webhook_secret': { scope: 'private', value_json: JSON.stringify(secret) },
    'ai_cover.webhook_url': { scope: 'private', value_json: JSON.stringify(fields.webhook_url) },
    'media.ai_cover.daily_limit': { scope: 'public', value_json: '35' },
    'media.ai_cover.enabled': { scope: 'public', value_json: 'true' }
  })
  const savedHtml = await (await request(saved.headers.get('location')!)).text()
  expect(savedHtml).toContain('Webhook configurado')
  expect(savedHtml).toContain('Configurações de capas por IA salvas.')
  expect(savedHtml).not.toContain(secret)
  expect((await request('/admin/settings/private/ai_cover.webhook_secret')).headers.get('location')).toBe(shortcut)

  await request(action!, { webhook_url: fields.webhook_url, webhook_secret: '', daily_limit: '0', csrf: 'cover-token' })
  expect(settings.get('ai_cover.webhook_secret')?.value_json).toBe(JSON.stringify(secret))
  expect(settings.get('media.ai_cover.enabled')?.value_json).toBe('false')
  expect(await (await request(shortcut!)).text()).toContain('Geração pausada')

  role = 'editor'
  expect((await request(action!, { ...fields, csrf: 'cover-token' })).status).toBe(403)
  expect(settings.get('media.ai_cover.daily_limit')?.value_json).toBe('0')
})
