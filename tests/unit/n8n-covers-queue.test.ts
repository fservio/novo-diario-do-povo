import { beforeEach, describe, expect, it, vi } from 'vitest'

let handleCoverQueue: (c: any) => Promise<Response>

beforeEach(async () => {
  // getSetting keeps a per-module memory cache: reload so each test sees its own settings.
  vi.resetModules()
  const mod = await import('../../packages/core/web/n8n-covers')
  handleCoverQueue = mod.handleCoverQueue
})

function fakeContext(settings: Record<string, unknown>, rows: any[], generated = 0) {
  const env: any = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({
          first: async () => ({ total: generated }),
          all: async () => (sql.includes('FROM settings')
            ? { results: args.slice(1).filter(k => String(k) in settings).map(k => ({ key: k, value_json: JSON.stringify(settings[String(k)]) })) }
            : { results: rows })
        })
      })
    },
    KV: { get: async () => null, put: async () => {}, delete: async () => {} }
  }
  const headers: Record<string, string> = {}
  return {
    env,
    req: { query: (name: string) => (name === 'limit' ? '5' : undefined) },
    header: (k: string, v: string) => { headers[k] = v },
    json: (body: any, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  } as any
}

const post = { id: 7, title: 'Título', hat: 'ECONOMIA', excerpt: 'Resumo', opinion_type: 'news', slug: 't', published_at: '2026-11-10T00:00:00Z', category_name: 'Economia', category_slug: 'economia' }

describe('AI cover queue', () => {
  it('uses the default daily limit when the setting does not exist', async () => {
    const res = await handleCoverQueue(fakeContext({}, [post]))
    const body: any = await res.json()
    expect(body.daily_limit).toBe(120)
    expect(body.remaining_today).toBe(120)
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({ id: 7, kind: 'news', category_slug: 'economia' })
  })

  it('stops handing out work after the daily cap and when disabled', async () => {
    const capped: any = await (await handleCoverQueue(fakeContext({ 'media.ai_cover.daily_limit': 10 }, [post], 10))).json()
    expect(capped.remaining_today).toBe(0)
    expect(capped.data).toEqual([])
    const off: any = await (await handleCoverQueue(fakeContext({ 'media.ai_cover.enabled': false }, [post]))).json()
    expect(off.enabled).toBe(false)
    expect(off.data).toEqual([])
  })

  it('classifies opinion columns', async () => {
    const body: any = await (await handleCoverQueue(fakeContext({}, [{ ...post, opinion_type: 'column' }]))).json()
    expect(body.data[0].kind).toBe('column')
  })
})
