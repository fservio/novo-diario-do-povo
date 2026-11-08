import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../../packages/core/middleware/logging'

function appFor(message: string) {
  const app = new Hono()
  app.onError(errorHandler)
  app.all('*', c => {
    c.set('requestId', 'req-test')
    throw new Error(message)
  })
  return app
}

describe('D1 overload responses', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns a readable, uncached 503 for an HTML navigation without exposing SQL or stack', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await appFor('D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window').request('/admin/posts', { headers: { Accept: 'text/html' } })
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('15')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Content-Type')).toContain('text/html')
    const body = await response.text()
    expect(body).toContain('Tentar novamente')
    expect(body).toContain('req-test')
    expect(body).not.toMatch(/D1_ERROR|Stack:|bundledWorker/)
  })

  it.each(['GET', 'POST'])('returns a retryable JSON status for API %s without replaying the operation', async method => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await appFor('D1_ERROR: D1 DB is overloaded.').request('/api/n8n/posts', { method, headers: { Accept: 'text/html' } })
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('15')
    expect(await response.json()).toEqual({ success: false, error: expect.any(String), code: 'DB_TEMPORARILY_BUSY', requestId: 'req-test' })
  })

  it('keeps unrelated server failures as 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await appFor('SQLITE_ERROR: no such column').request('/api/n8n/posts', {}, { CF_ENV: 'prod' })
    expect(response.status).toBe(500)
    expect(response.headers.get('Retry-After')).toBeNull()
    expect(await response.json()).toEqual({ success: false, error: 'Erro interno do servidor' })
  })
})
