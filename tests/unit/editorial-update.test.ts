import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { D1Database } from '@cloudflare/workers-types'
import { expect, it } from 'vitest'
import { applyEditorialUpdate, previewEditorialUpdate } from '../../packages/core/editorial-ai/update'

it('applies exactly the approved addition once and keeps the previous article', async () => {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
  const sql = new DatabaseSync(':memory:')
  sql.exec(`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY, status TEXT, category_id INTEGER, title TEXT, excerpt TEXT,
      content TEXT, slug TEXT, published_at TEXT, updated_at TEXT, content_version INTEGER,
      content_format TEXT, content_json TEXT, content_markdown TEXT, original_link TEXT
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT, scope TEXT, updated_at TEXT);
    INSERT INTO posts VALUES (
      1,'published',8,'Título','Resumo','<p>Texto anterior.</p>','mesma-url','2026-11-15','2026-11-15',
      1,'markdown',NULL,'Texto anterior.','https://example.org/initial'
    );
  `)
  sql.exec(readFileSync(new URL('../../migrations/0066_editorial_post_updates.sql', import.meta.url), 'utf8'))
  function prepare(statement: string, values: unknown[] = []) {
    return { statement, values, bind: (...args: unknown[]) => prepare(statement, args),
      first: async () => sql.prepare(statement).get(...values) ?? null }
  }
  const db = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sql.exec('BEGIN')
      try {
        const result = statements.map(({ statement, values }) => ({ results: sql.prepare(statement).all(...values) }))
        sql.exec('COMMIT')
        return result
      } catch (error) {
        sql.exec('ROLLBACK')
        throw error
      }
    }
  } as unknown as D1Database
  const input = { source_url: 'https://example.org/new?utm_source=test', category_id: 8, addition: 'O atendimento foi ampliado.' }
  try {
    const preview = await previewEditorialUpdate(db, 1, input)
    if (preview.status !== 'ready') throw Error('Prévia indisponível')
    const approval = { ...input, snapshot: preview.current.snapshot, decision: 'recomendar_publicacao' as const,
      execution_id: 'teste', reason: 'Desdobramento fundamentado.', blocking_issues: [], evaluated_content: preview.content }
    expect(await applyEditorialUpdate(db, 1, { ...approval, evaluated_content: '<p>Outro texto</p>' })).toEqual({ status: 'conflict' })
    sql.exec("UPDATE posts SET updated_at = '2026-11-16' WHERE id = 1")
    expect(await applyEditorialUpdate(db, 1, approval)).toEqual({ status: 'conflict' })
    const current = await previewEditorialUpdate(db, 1, input)
    if (current.status !== 'ready') throw Error('Prévia indisponível')
    const accepted = { ...approval, snapshot: current.current.snapshot }
    expect((await applyEditorialUpdate(db, 1, accepted)).status).toBe('updated')
    expect(await applyEditorialUpdate(db, 1, { ...accepted, source_url: 'https://example.org/new' })).toEqual({ status: 'already_applied' })
    expect(sql.prepare('SELECT slug, published_at, content_version, content FROM posts').get()).toMatchObject({
      slug: 'mesma-url', published_at: '2026-11-15', content_version: 2, content: preview.content
    })
    expect(sql.prepare('SELECT previous_snapshot FROM editorial_post_updates').get().previous_snapshot).toBe(current.current.snapshot)
    expect(sql.prepare('SELECT count(*) AS total FROM settings').get().total).toBe(1)
  } finally {
    sql.close()
  }
})
