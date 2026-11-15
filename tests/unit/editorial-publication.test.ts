import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { D1Database } from '@cloudflare/workers-types'
import { expect, it, vi } from 'vitest'
import { publishRecommendedRevision, readPublicationSnapshot, stageEditorialDraftRevision } from '../../packages/core/editorial-ai/publication'

vi.mock('../../packages/core/seo/internal-links', () => ({
  publicationLinksRequired: async () => false
}))

it('requires the exact evaluated draft and atomically records publication', async () => {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY, status TEXT, scheduled_at TEXT, updated_at TEXT, published_at TEXT,
      content_version INTEGER, title TEXT, hat TEXT, slug TEXT, excerpt TEXT, content TEXT,
      content_markdown TEXT, content_json TEXT, content_format TEXT, category_id INTEGER,
      author_id INTEGER, cover_media_id INTEGER, social_image_media_id INTEGER, seo_title TEXT,
      seo_description TEXT
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT, scope TEXT, updated_at TEXT);
    INSERT INTO posts (id, status, title, content, content_version)
    VALUES (1, 'draft', 'Título inicial', '<p>Texto.</p>', 1);
  `)
  sqlite.exec(readFileSync(new URL('../../migrations/0061_editorial_publication_receipt.sql', import.meta.url), 'utf8'))

  function prepare(sql: string, values: unknown[] = []) {
    return {
      sql,
      values,
      bind: (...args: unknown[]) => prepare(sql, args),
      first: async () => sqlite.prepare(sql).get(...values) ?? null
    }
  }
  const db = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(({ sql, values }) => ({ results: sqlite.prepare(sql).all(...values) }))
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    }
  } as unknown as D1Database

  try {
    const draft = await readPublicationSnapshot(db, 1)
    const recommendation = {
      snapshot: String(draft?.snapshot),
      evaluated_title: 'Título inicial',
      evaluated_content: '<p>Texto.</p>',
      execution_id: 'exec-1',
      decision: 'recomendar_publicacao' as const,
      reason: 'Versão avaliada',
      blocking_issues: []
    }

    sqlite.exec("UPDATE posts SET title = 'Título alterado' WHERE id = 1")
    expect(await publishRecommendedRevision(db, 1, recommendation)).toEqual({ status: 'conflict' })
    expect(sqlite.prepare('SELECT key FROM settings').get()).toBeUndefined()

    const updated = await readPublicationSnapshot(db, 1)
    const current = { ...recommendation, snapshot: String(updated?.snapshot) }
    expect(await publishRecommendedRevision(db, 1, current)).toEqual({ status: 'conflict' })

    expect(await stageEditorialDraftRevision(db, 1, {
      snapshot: recommendation.snapshot, title: 'Tentativa antiga', content_markdown: 'Texto concorrente.'
    })).toBeNull()
    const staged = await stageEditorialDraftRevision(db, 1, {
      snapshot: current.snapshot, title: 'Título revisado', excerpt: 'Resumo com informação complementar.',
      content_markdown: 'Texto revisado.'
    })
    expect(staged?.content_version).toBe(2)
    expect(staged?.excerpt).toBe('Resumo com informação complementar.')
    expect(await publishRecommendedRevision(db, 1, current)).toEqual({ status: 'conflict' })
    const revised = { ...current, snapshot: String(staged?.snapshot),
      evaluated_title: 'Título revisado', evaluated_content: String(staged?.content),
      evaluated_excerpt: 'Resumo com informação complementar.' }
    expect(await publishRecommendedRevision(db, 1, {
      ...revised, evaluated_excerpt: 'Resumo diferente do gravado.'
    })).toEqual({ status: 'conflict' })
    expect((await publishRecommendedRevision(db, 1, revised)).status).toBe('published')
    const published = sqlite.prepare('SELECT status, editorial_publication_receipt FROM posts').get()
    expect(published.status).toBe('published')
    expect(JSON.parse(published.editorial_publication_receipt)).toMatchObject({ execution_id: 'exec-1' })
    const cache = sqlite.prepare('SELECT value_json FROM settings').get()
    expect(cache).toBeDefined()
    expect(await publishRecommendedRevision(db, 1, revised)).toEqual({ status: 'conflict' })
    expect(sqlite.prepare('SELECT value_json FROM settings').get()).toEqual(cache)
  } finally {
    sqlite.close()
  }
})
