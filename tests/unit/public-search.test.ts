import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'
import routes from '../../packages/core/web/routes-v1'
import type { Env } from '../../packages/core/types'

vi.mock('../../packages/core/db/categories-cache', () => ({
  getActiveCategories: async () => [{ name: 'Cultura', slug: 'cultura' }]
}))

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

afterEach(() => vi.useRealTimers())

it('serves the dedicated search page, then filters and paginates the requested period', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-08T21:00:00Z'))
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`
      CREATE TABLE posts(id INTEGER PRIMARY KEY, title TEXT, slug TEXT, published_at TEXT,
                         status TEXT, seo_noindex INTEGER);
      CREATE INDEX idx_posts_public_latest ON posts(status, seo_noindex, published_at DESC);
      INSERT INTO posts VALUES
        (1,'Teresina recente','recente','2026-11-02T10:00:00Z','published',0),
        (2,'Teresina antiga','antiga','2025-10-15 10:00:00','published',0),
        (3,'Teresina futura','futura','2026-11-08T22:00:00Z','published',0);
    `)
    const insert = db.prepare("INSERT INTO posts VALUES(NULL, ?, ?, '2025-10-14 10:00:00', 'published', 0)")
    for (let index = 0; index < 20; index++) insert.run('Teresina no arquivo', `arquivo-${index}`)
    const prepare = vi.fn((sql: string) => ({
      bind: (...args: Array<string | number>) => ({
        all: async () => ({ results: db.prepare(sql).all(...args) })
      })
    }))
    const env = { DB: { prepare } } as unknown as Env

    const landing = await routes.request('/busca', {}, env)
    expect(landing.status).toBe(200)
    expect(landing.headers.get('X-Robots-Tag')).toContain('noindex')
    expect(await landing.text()).toContain('<form action="/busca"')
    expect(prepare).not.toHaveBeenCalled()

    const recent = await (await routes.request('/busca?q=Teresina', {}, env)).text()
    expect(recent).toContain('Teresina recente')
    expect(recent).not.toContain('Teresina antiga')
    expect(recent).not.toContain('Teresina futura')

    const archive = await (await routes.request('/busca?q=Teresina&period=2025-10', {}, env)).text()
    expect(archive).toContain('Teresina antiga')
    expect(archive).not.toContain('Teresina recente')
    expect(archive).toContain('period=2025-10&amp;page=2')
  } finally {
    db.close()
  }
})
