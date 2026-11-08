import { describe, expect, it, vi } from 'vitest'
import app from '../../functions/index'

describe('public archive sitemap endpoints', () => {
  function env() {
    const bind = vi.fn().mockReturnThis()
    const statement = {
      bind,
      all: async () => ({ results: [] }),
      first: async () => null,
      run: async () => ({ success: true })
    }
    bind.mockReturnValue(statement)
    return {
      DB: { prepare: vi.fn().mockReturnValue(statement) },
      CACHE: { get: async (key: string) => key === 'bootstrap:done' ? 'true' : null, put: async () => {} },
      PUBLIC_BASE_URL: 'https://diario.dopovo.com.br',
      bind
    } as any
  }

  it('parses the .xml filename and passes pagination to the database', async () => {
    const bindings = env()
    const response = await app.request('https://diario.dopovo.com.br/sitemap/archive/2026/02.xml?page=2', {}, bindings)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/xml')
    expect(await response.text()).toContain('<urlset ')
    expect(bindings.bind).toHaveBeenCalledWith('2026-02-01T00:00:00', '2026-03-01T00:00:00', 10000, 10000)
  })

  it.each(['2026/13.xml', '2026/02.txt', '2026/02.xml?page=-1'])('rejects invalid archive %s', async path => {
    const response = await app.request(`https://diario.dopovo.com.br/sitemap/archive/${path}`, {}, env())
    expect(response.status).toBe(404)
  })
})
