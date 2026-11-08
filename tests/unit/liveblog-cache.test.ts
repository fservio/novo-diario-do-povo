import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { securityHeaders } from '../../packages/core/middleware/security'

vi.mock('../../packages/core/db', () => ({ getSetting: vi.fn().mockResolvedValue(null) }))

describe('liveblog response cache', () => {
  it('does not cache the home HTML over editorial changes', async () => {
    const app = new Hono<any>()
    app.use('*', securityHeaders)
    app.get('/', c => c.text('home', 200, { 'Cache-Control': 'public, max-age=60' }))
    const response = await app.request('/', {}, {})
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
  it('keeps the live feed uncached after security middleware completes', async () => {
    const app = new Hono<any>()
    app.use('*', securityHeaders)
    app.get('/api/public/posts/:slug/live-updates', c => c.json({ success: true, data: [] }))
    const response = await app.request('/api/public/posts/cobertura/live-updates', {}, {})
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
