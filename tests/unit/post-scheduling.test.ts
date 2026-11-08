import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizePublicationSchedule, formatPublicationScheduleInput, publishDuePosts } from '../../packages/core/post-scheduling'
import { archivePost, cancelPostSchedule, publishPost, schedulePost } from '../../packages/core/db/posts'
import { renderPostFormPage, scheduleSchema } from '../../packages/core/admin/posts'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

function database() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE posts (id INTEGER PRIMARY KEY, status TEXT, published_at TEXT, scheduled_at TEXT, updated_at TEXT);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT, scope TEXT, updated_at TEXT);
    CREATE INDEX idx_posts_scheduled_publication ON posts(scheduled_at, id) WHERE status = 'draft' AND scheduled_at IS NOT NULL;
    INSERT INTO posts (id, status) VALUES (1, 'draft'), (2, 'published');
  `)
  function bound(sql: string, args: any[] = []): any {
    return {
      sql, args, bind: (...values: any[]) => bound(sql, values),
      run: async () => { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } } },
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      first: async () => sqlite.prepare(sql).get(...args) || null
    }
  }
  const db = {
    prepare: bound,
    batch: async (statements: any[]) => {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(statement => {
          const rows = sqlite.prepare(statement.sql).all(...statement.args)
          const changes = (sqlite.prepare('SELECT changes() AS value').get() as any).value
          return { results: rows, meta: { changes } }
        })
        sqlite.exec('COMMIT')
        return results
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    }
  }
  return { db: db as any, sqlite, post: () => sqlite.prepare('SELECT * FROM posts WHERE id = 1').get() as any }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2030-10-27T10:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('scheduled editorial publication', () => {
  it('uses the queue index instead of scanning published stories each minute', () => {
    const { sqlite } = database()
    const plan = sqlite.prepare("EXPLAIN QUERY PLAN SELECT id FROM posts INDEXED BY idx_posts_scheduled_publication WHERE status = 'draft' AND scheduled_at IS NOT NULL AND scheduled_at <= ? ORDER BY scheduled_at, id LIMIT 100").all('2030-10-27T12:00:00Z')
    expect(JSON.stringify(plan)).toContain('idx_posts_scheduled_publication')
    sqlite.close()
  })
  it('interprets the form time as Fortaleza and returns UTC', () => {
    expect(normalizePublicationSchedule('2030-10-27T09:15')).toBe('2030-10-27T12:15:00.000Z')
    expect(formatPublicationScheduleInput('2030-10-28T01:15:00.000Z')).toBe('2030-10-27T22:15')
    expect(scheduleSchema.parse({ scheduled_at: '2030-10-27T09:15' }).scheduled_at).toBe('2030-10-27T12:15:00.000Z')
  })

  it.each(['invalid', '2030-02-30T09:00', '2030-10-27T06:00', '2030-10-27T25:00', '2030-10-28'])('rejects invalid or elapsed schedules: %s', value => {
    expect(() => normalizePublicationSchedule(value)).toThrow()
  })

  it('keeps scheduled stories unpublished until they are due', async () => {
    const { db, sqlite, post } = database()
    await schedulePost(db, 1, '2030-10-27T09:00')
    expect(post()).toMatchObject({ status: 'draft', published_at: null, scheduled_at: '2030-10-27T12:00:00.000Z' })
    expect(await publishDuePosts(db, '2030-10-27T11:59:59.999Z')).toBe(0)
    expect(post().status).toBe('draft')
    expect(await publishDuePosts(db, '2030-10-27T12:00:00.000Z')).toBe(1)
    expect(post()).toMatchObject({ status: 'published', published_at: '2030-10-27T12:00:00.000Z', scheduled_at: null })
    const revision = sqlite.prepare('SELECT value_json FROM settings').get()
    expect(revision).toBeTruthy()
    expect(await publishDuePosts(db, '2030-10-27T12:01:00.000Z')).toBe(0)
    expect(sqlite.prepare('SELECT value_json FROM settings').get()).toEqual(revision)
    sqlite.close()
  })

  it('allows rescheduling and cancellation without publishing', async () => {
    const { db, sqlite, post } = database()
    await schedulePost(db, 1, '2030-10-27T09:00')
    await schedulePost(db, 1, '2030-10-27T10:00')
    expect(await publishDuePosts(db, '2030-10-27T12:00:00.000Z')).toBe(0)
    await cancelPostSchedule(db, 1)
    expect(post()).toMatchObject({ status: 'draft', scheduled_at: null })
    expect(await publishDuePosts(db, '2030-10-28T12:00:00.000Z')).toBe(0)
    sqlite.close()
  })

  it('does not take an existing published story offline when scheduling', async () => {
    const { db, sqlite } = database()
    await expect(schedulePost(db, 2, '2030-10-27T09:00')).rejects.toThrow('Somente rascunhos')
    expect((sqlite.prepare('SELECT status FROM posts WHERE id = 2').get() as any).status).toBe('published')
    sqlite.close()
  })

  it('clears the pending schedule on immediate publication or archive', async () => {
    const { db, sqlite, post } = database()
    await schedulePost(db, 1, '2030-10-27T09:00')
    await publishPost(db, 1)
    expect(post()).toMatchObject({ status: 'published', scheduled_at: null })
    sqlite.exec("UPDATE posts SET status = 'draft'")
    await schedulePost(db, 1, '2030-10-27T09:00')
    await archivePost(db, 1)
    expect(post()).toMatchObject({ status: 'archived', scheduled_at: null })
    expect(await publishDuePosts(db, '2030-10-28T12:00:00.000Z')).toBe(0)
    sqlite.close()
  })

  it('rolls back publication if the home cache revision cannot be updated', async () => {
    const { db, sqlite, post } = database()
    await schedulePost(db, 1, '2030-10-27T09:00')
    sqlite.exec("CREATE TRIGGER fail_revision BEFORE INSERT ON settings BEGIN SELECT RAISE(ABORT, 'cache write failed'); END")
    await expect(publishDuePosts(db, '2030-10-27T12:00:00.000Z')).rejects.toThrow('cache write failed')
    expect(post()).toMatchObject({ status: 'draft', scheduled_at: '2030-10-27T12:00:00.000Z' })
    sqlite.close()
  })

  it('does not publish a schedule cancelled between the selection and the transaction', async () => {
    const { db, sqlite, post } = database()
    await schedulePost(db, 1, '2030-10-27T09:00')
    const batch = db.batch.bind(db)
    db.batch = async (statements: any[]) => { await cancelPostSchedule(db, 1); return batch(statements) }
    expect(await publishDuePosts(db, '2030-10-27T12:00:00.000Z')).toBe(0)
    expect(post().status).toBe('draft')
    sqlite.close()
  })

  it('shows the scheduled time, timezone and cancellation control in the editor', () => {
    const html = renderPostFormPage({ post: { id: 1, title: 'Matéria de teste', status: 'draft', scheduled_at: '2030-10-27T12:00:00.000Z', content: '<p>Texto</p>', tags: [] } as any, categories: [], authors: [], tags: [], user: { id: 1, email: 'editor@example.com', role: 'admin' }, csrfToken: 'csrf', cspNonce: 'nonce' })
    expect(html).toContain('/admin/posts/1/schedule')
    expect(html).toContain('value="2030-10-27T09:00"')
    expect(html).toContain('horário de Fortaleza')
    expect(html).toContain('/admin/posts/1/cancel-schedule')
    expect(html).toContain('Agendada')
  })
})
