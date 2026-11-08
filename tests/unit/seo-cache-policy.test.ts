import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { securityHeaders } from '../../packages/core/middleware/security'

vi.mock('../../packages/core/db', () => ({ getSetting: vi.fn(async () => null) }))

function setup(status = 200) {
  const app = new Hono<any>()
  app.use('*', securityHeaders)
  app.all('*', c => {
    c.header('Cache-Control', 'public, max-age=600')
    return c.json({ internal: true }, status as any)
  })
  return app
}

describe('Private cache policy for authenticated SEO automation', () => {
  it.each(['/api/n8n/seo', '/api/n8n/seo/claim', '/api/n8n/seo/dry-run', '/api/n8n/seo/stats', '/api/n8n/seo/jobs/7/result', '/api/n8n/seo/pilot/status'])('prevents public caching for %s', async path => {
    const response = await setup().request(path)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
  })

  it.each([401, 403, 422, 500])('also prevents caching an SEO error response %s', async status => {
    const response = await setup(status).request('/api/n8n/seo/claim', { method: 'POST' })
    expect(response.status).toBe(status)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
  })

  it.each([
    ['/api/n8n/posts', 'public, max-age=60, stale-while-revalidate=59'],
    ['/api/n8n/seo-other', 'public, max-age=60, stale-while-revalidate=59'],
    ['/static/admin-seo.css', 'public, max-age=31536000, immutable'],
    ['/sitemap.xml', 'public, max-age=3600, stale-while-revalidate=600'],
    ['/admin/posts/7/seo/history', 'private, no-store, max-age=0'],
  ])('preserves existing cache behavior for %s', async (path, expected) => {
    expect((await setup().request(path)).headers.get('Cache-Control')).toBe(expected)
  })
})
