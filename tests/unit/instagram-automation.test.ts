import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import type { Env } from '../../packages/core/types'
import { instagramAutomation } from '../../packages/core/instagram/automation'

it('prepares published articles once, using the cover credit and preserving edits', async () => {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
  const sql = new DatabaseSync(':memory:')
  try {
    sql.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT, is_active INTEGER);
      CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE media (id INTEGER PRIMARY KEY, r2_key TEXT, alt TEXT, credits TEXT);
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY, slug TEXT, title TEXT, hat TEXT, excerpt TEXT, content TEXT,
        content_markdown TEXT, published_at TEXT, created_at TEXT, updated_at TEXT,
        category_id INTEGER, cover_media_id INTEGER, status TEXT
      );
      INSERT INTO users VALUES (1, 'admin', 1);
      INSERT INTO categories VALUES (1, 'Geral');
      INSERT INTO media VALUES (1, 'a.jpg', 'Uma praça arborizada', 'Maria / Agência');
      INSERT INTO posts VALUES
        (1,'com-foto','Com foto',NULL,'Resumo','Notícia',NULL,'2026-11-16 12:00:00','2026-11-16','v1',1,1,'published'),
        (2,'sem-foto','Sem foto',NULL,'Resumo','Notícia',NULL,'2026-11-16T12:01:00.000Z','2026-11-16','v1',1,NULL,'published'),
        (3,'rascunho','Rascunho',NULL,'Resumo','Notícia',NULL,'2026-11-16T12:01:30.000Z','2026-11-16','v1',1,NULL,'draft'),
        (4,'antiga','Antiga',NULL,'Resumo','Notícia',NULL,'2026-11-16T10:01:30.000Z','2026-11-16','v1',1,NULL,'published');
    `)
    for (const name of ['0028_instagram_editorial_workflow', '0029_instagram_image_focal_point',
      '0030_instagram_photo_credit', '0036_instagram_story_variants']) {
      sql.exec(readFileSync(new URL(`../../migrations/${name}.sql`, import.meta.url), 'utf8'))
    }
    const prepare = (statement: string, values: unknown[] = []) => ({
      statement, values,
      bind: (...args: unknown[]) => prepare(statement, args),
      first: async () => sql.prepare(statement).get(...values),
      all: async () => ({ results: sql.prepare(statement).all(...values) })
    })
    const env = {
      PUBLIC_BASE_URL: 'https://diario.dopovo.com.br',
      DB: {
        prepare,
        async batch(statements: ReturnType<typeof prepare>[]) {
          sql.exec('BEGIN')
          try {
            const results = statements.map(({ statement, values }) => {
              const result = sql.prepare(statement).run(...values)
              return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }
            })
            sql.exec('COMMIT')
            return results
          } catch (error) {
            sql.exec('ROLLBACK')
            throw error
          }
        }
      }
    } as unknown as Env
    const candidates = async () => (await (await instagramAutomation.request(
      '/candidates?since=2026-11-16T11:00:00.000Z', {}, env
    )).json()).data
    const save = async (id: number, publication_id: number | null = null, publication_version: number | null = null) => {
      const response = await instagramAutomation.request('/posts/' + id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_version: 'v1', publication_id, publication_version,
          caption: 'Legenda de teste.', hashtags: ['#Geral'], alt_text: 'Descrição', execution_id: '42' })
      }, env)
      return response.json()
    }
    expect((await candidates()).map((p: { post_id: number }) => p.post_id)).toEqual([2, 1])
    const limited = await instagramAutomation.request('/candidates?since=2026-11-16T11:00:00.000Z&limit=1', {}, env)
    expect((await limited.json()).data.map((p: { post_id: number }) => p.post_id)).toEqual([2])
    expect((await save(3)).status).toBe('skipped')
    expect((await save(1)).status).toBe('prepared')
    expect((await save(1)).status).toBe('skipped')
    expect((await save(2)).status).toBe('prepared')
    expect(sql.prepare('SELECT post_id, photo_credit, status FROM instagram_publications ORDER BY post_id').all())
      .toEqual([{ post_id: 1, photo_credit: 'Maria / Agência', status: 'caption_ready' },
        { post_id: 2, photo_credit: null, status: 'caption_ready' }])
    expect(sql.prepare('SELECT photo_credit FROM instagram_story_variants WHERE publication_id = 1').get())
      .toEqual({ photo_credit: 'Maria / Agência' })
    sql.exec("UPDATE instagram_publications SET caption = 'Legenda humana', hashtags = NULL, n8n_execution_id = NULL, version = 2 WHERE id = 1")
    expect((await save(1, 1, 1)).status).toBe('skipped')
    expect((await save(1, 1, 2)).status).toBe('prepared')
    expect(sql.prepare('SELECT caption, hashtags FROM instagram_publications WHERE id = 1').get())
      .toEqual({ caption: 'Legenda humana', hashtags: '#Geral' })
    expect(await candidates()).toEqual([])
  } finally {
    sql.close()
  }
})
