import { createRequire } from 'node:module'
import { Hono } from 'hono'
import { expect, it } from 'vitest'
import { worldArticle, worldSnapshot } from '../../packages/core/web/mundo-em-edicao'
import type { AppContext, Env } from '../../packages/core/types'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

it('shows only public Diário records available at the selected time', async () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`
      CREATE TABLE categories (id INTEGER, name TEXT);
      CREATE TABLE posts (
        id INTEGER PRIMARY KEY, title TEXT, slug TEXT, published_at TEXT,
        category_id INTEGER, publication_id TEXT, status TEXT, seo_noindex INTEGER, template TEXT
      );
      CREATE TABLE post_related_articles (post_id INTEGER, related_post_id INTEGER, created_at TEXT);
      CREATE TABLE live_blog_updates (id INTEGER, post_id INTEGER, title TEXT, published_at TEXT);
      INSERT INTO categories VALUES (1, 'Cidades');
      INSERT INTO posts VALUES
        (1, 'Cobertura', 'cobertura', '2026-01-01 10:00:00', 1, 'diario', 'published', 0, 'liveblog'),
        (2, 'Matéria', 'materia', '2026-01-01T11:00:00Z', 1, 'diario', 'published', 0, 'article'),
        (3, 'Programada', 'programada', '2026-01-01T13:00:00Z', 1, 'diario', 'published', 0, 'article'),
        (4, 'Rascunho', 'rascunho', '2026-01-01T10:00:00Z', 1, 'diario', 'draft', 0, 'article'),
        (5, 'Outra publicação', 'outra', '2026-01-01T10:00:00Z', 1, 'do-povo', 'published', 0, 'article'),
        (6, 'Oculta', 'oculta', '2026-01-01T10:00:00Z', 1, 'diario', 'published', 1, 'article');
      INSERT INTO post_related_articles VALUES
        (1, 2, '2026-01-01T11:30:00Z'), (1, 4, '2026-01-01T10:10:00Z'),
        (1, 5, '2026-01-01T10:10:00Z'), (1, 6, '2026-01-01T10:10:00Z');
      INSERT INTO live_blog_updates VALUES
        (1, 1, 'Registro público', '2026-01-01 10:20:00'),
        (2, 1, 'Registro posterior', '2026-01-01 12:20:00');
      ALTER TABLE posts ADD COLUMN original_link TEXT;
      UPDATE posts SET original_link = 'https://diario.dopovo.com.br/ia/relacionada/v1/1' WHERE id = 2;
      CREATE TABLE editorial_post_updates (post_id INTEGER, applied_at TEXT, previous_snapshot TEXT);
      INSERT INTO editorial_post_updates VALUES (1, '2026-01-01T11:45:00Z', 'Rascunho interno');
    `)
    const env = {
      DB: {
        prepare: (sql: string) => ({
          bind: (...args: unknown[]) => {
            const bindings = Object.fromEntries(args.map((value, index) => ['?' + (index + 1), value]))
            return {
              first: async () => db.prepare(sql).get(bindings),
              all: async () => ({ results: db.prepare(sql).all(bindings) })
            }
          }
        })
      }
    } as unknown as Env
    const app = new Hono<{ Bindings: Env; Variables: AppContext }>()
    app.get('/snapshot', worldSnapshot)
    app.get('/posts/:id', worldArticle)
    const query = (path: string, clock: string) => app.request(path + '?at=' + Date.parse('2026-01-01T' + clock + ':00Z'), {}, env)
    const snapshot = await (await query('/snapshot', '12:00')).json()
    expect(snapshot.posts.map((post: { id: number }) => post.id)).toEqual([2, 1])
    expect(snapshot.updates[0]).toEqual({ postId: 1, at: Date.parse('2026-01-01T11:45:00Z'), title: 'Atualização editorial aplicada' })
    const past = await (await query('/posts/1', '11:00')).json()
    expect(past.related).toEqual([])
    expect(past.updates.map((update: { title: string }) => update.title)).toEqual(['Registro público'])
    const present = await (await query('/posts/1', '12:00')).json()
    expect(present.related.map((post: { id: number }) => post.id)).toEqual([2])
    expect(present.related[0].relationship).toBe('Matéria complementar')
    expect(JSON.stringify(present)).not.toContain('Rascunho interno')
    for (const id of [3, 4, 5, 6]) {
      expect((await query('/posts/' + id, '12:00')).status).toBe(404)
    }
  } finally {
    db.close()
  }
})
