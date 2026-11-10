import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let mod: typeof import('../../packages/core/web/n8n-covers')

beforeEach(async () => {
  vi.resetModules()
  mod = await import('../../packages/core/web/n8n-covers')
})
afterEach(() => vi.unstubAllGlobals())

const post = { id: 9, title: 'Título da matéria', excerpt: 'Resumo', hat: 'POLÍTICA', status: 'published', opinion_type: 'news', category_name: 'Política', category_slug: 'politica' }

function context(settings: Record<string, unknown>, body: unknown = { idea: '  um  farol   ' }) {
  const env: any = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => (sql.includes('FROM posts') ? post : { total: 0 }),
          all: async () => ({ results: args.slice(1).filter(k => String(k) in settings).map(k => ({ key: k, value_json: JSON.stringify(settings[String(k)]) })) }),
          run: async () => ({ meta: { changes: 1 } })
        })
      })
    },
    KV: { get: async () => null, put: async () => {}, delete: async () => {} }
  }
  return {
    env,
    req: { param: () => '9', json: async () => body },
    header: () => {},
    get: (key: string) => (key === 'adminUser' ? { id: 1 } : 'req-1'),
    json: (payload: any, status = 200) => new Response(JSON.stringify(payload), { status })
  } as any
}

describe('buildAdminCoverPayload', () => {
  it('normalizes the idea and classifies columns', () => {
    const payload = mod.buildAdminCoverPayload({ ...post, opinion_type: 'column' }, '  um   farol \n no mar ', 7)
    expect(payload).toMatchObject({ id: 9, kind: 'column', category_slug: 'politica', idea: 'um farol no mar', seed: 7 })
  })
})

describe('admin AI cover button endpoint', () => {
  it('explains when the n8n flow is not connected yet', async () => {
    const res = await mod.handleAdminAiCover(context({}))
    expect(res.status).toBe(503)
  })

  it('refuses when AI covers are disabled', async () => {
    const res = await mod.handleAdminAiCover(context({ 'media.ai_cover.enabled': false }))
    expect(res.status).toBe(403)
  })

  it('returns the generated cover on success and sends the secret and payload to n8n', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { media_id: 55, url: '/i/media/2026/11/x.webp' } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const res = await mod.handleAdminAiCover(context({ 'ai_cover.webhook_url': 'https://n8n.example.com/webhook/abc', 'ai_cover.webhook_secret': 'secret' }))
    const body: any = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, media_id: 55, url: '/i/media/2026/11/x.webp', credit: mod.AI_COVER_CREDIT })
    const [url, init] = fetchMock.mock.calls[0] as any
    expect(url).toBe('https://n8n.example.com/webhook/abc')
    expect(init.headers['X-Capa-Secret']).toBe('secret')
    expect(JSON.parse(init.body)).toMatchObject({ id: 9, idea: 'um farol', category_slug: 'politica' })
  })

  it('surfaces the reason when the flow fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: 'Limite diário de capas por IA atingido.' }), { status: 200 })))
    const res = await mod.handleAdminAiCover(context({ 'ai_cover.webhook_url': 'https://n8n.example.com/webhook/abc' }))
    const body: any = await res.json()
    expect(res.status).toBe(502)
    expect(body.error).toContain('Limite diário')
  })
})

