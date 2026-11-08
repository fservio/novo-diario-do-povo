import { describe, expect, it, vi } from 'vitest'
import app from '../../functions/index'

vi.mock('../../packages/core/middleware', async importOriginal => ({
  ...await importOriginal<any>(),
  requireAdmin: async (c: any, next: any) => {
    c.set('adminUser', { id: 1, name: 'Editor', email: 'editor@example.com', role: 'admin' })
    c.set('csrfToken', 'test')
    await next()
  }
}))

function bindings(total = 45) {
  const queries: { sql: string; args: any[] }[] = []
  function statement(sql: string, args: any[] = []): any {
    return {
      bind: (...values: any[]) => statement(sql, values),
      first: async () => { queries.push({ sql, args }); return sql.includes('COUNT(*)') ? { count: total } : null },
      all: async () => { queries.push({ sql, args }); return { results: [] } }
    }
  }
  return { queries, env: {
    DB: { prepare: statement },
    CACHE: { get: async () => 'true', put: async () => {} },
    KV: { get: async () => null, put: async () => {} },
    PUBLIC_BASE_URL: 'https://diario.dopovo.com.br'
  } as any }
}

describe('CMS post pagination', () => {
  it('counts all matching posts and keeps filters when navigating to another page', async () => {
    const t = bindings()
    const response = await app.request('https://diario.dopovo.com.br/admin/posts?search=pag-test&category_id=7&page=2', {}, t.env)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('Página 2</strong> de 3')
    expect(html).toContain('45 matérias encontradas')
    expect(html).toContain('Próxima ›')
    const links = [...html.matchAll(/href="(\/admin\/posts\?[^"]+)"/g)].map(match => new URL(match[1].replaceAll('&amp;', '&'), 'https://example.com'))
    expect(links.some(url => url.searchParams.get('page') === '3' && url.searchParams.get('search') === 'pag-test' && url.searchParams.get('category_id') === '7')).toBe(true)
    expect(links.every(url => !url.searchParams.has('offset') && !url.searchParams.has('includeCount'))).toBe(true)
    expect(t.queries.some(q => q.sql.includes('COUNT(*)'))).toBe(true)
    expect(t.queries.find(q => q.sql.includes('LIMIT ? OFFSET ?'))?.args.slice(-2)).toEqual([20, 20])
  })

  it('normalizes invalid page sizes and page numbers', async () => {
    const t = bindings()
    const response = await app.request('https://diario.dopovo.com.br/admin/posts?page=-1&limit=oops&search=invalid-page-test', {}, t.env)
    expect(response.status).toBe(200)
    expect(t.queries.find(q => q.sql.includes('LIMIT ? OFFSET ?'))?.args.slice(-2)).toEqual([20, 0])
  })

  it('redirects pages beyond the last result while retaining the search', async () => {
    const t = bindings()
    const response = await app.request('https://diario.dopovo.com.br/admin/posts?page=999&search=last-page-test', {}, t.env)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/admin/posts?page=3&search=last-page-test')
  })
})
