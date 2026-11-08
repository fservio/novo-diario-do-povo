import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstagramPublication, getInstagramPublication, getInstagramStoryVariant, listInstagramSourcePosts } from '../../packages/core/instagram/repository'
import { validateInstagramPublicationTiming } from '../../packages/core/instagram/service'
import { handleInstagramDetail, handleInstagramNew } from '../../packages/core/admin/instagram'
import { renderPostFormPage } from '../../packages/core/admin/posts'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

function database() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE posts (id INTEGER PRIMARY KEY, slug TEXT, title TEXT, hat TEXT, excerpt TEXT, content TEXT, content_markdown TEXT, status TEXT, scheduled_at TEXT, published_at TEXT, created_at TEXT, cover_media_id INTEGER, category_id INTEGER, author_id INTEGER);
    CREATE TABLE categories (id INTEGER, name TEXT);
    CREATE TABLE authors (id INTEGER, name TEXT);
    CREATE TABLE media (id INTEGER, r2_key TEXT, alt TEXT, credits TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE settings (key TEXT, value_json TEXT, scope TEXT);
    INSERT INTO categories VALUES (1, 'Brasil');
    INSERT INTO authors VALUES (1, 'Redação');
    INSERT INTO users VALUES (1, 'Editor');
    INSERT INTO media VALUES (1, 'media/capa.jpg', 'Foto', 'Agência');
  `)
  for (const file of ['0028_instagram_editorial_workflow.sql', '0029_instagram_image_focal_point.sql', '0030_instagram_photo_credit.sql', '0036_instagram_story_variants.sql', '0045_instagram_audio_stories.sql', '0046_instagram_direct.sql', '0047_instagram_audience_links.sql']) {
    sqlite.exec(readFileSync(new URL('../../migrations/' + file, import.meta.url), 'utf8'))
  }
  const insert = sqlite.prepare('INSERT INTO posts VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 1, 1)')
  for (const [id, status, scheduled, cover] of [[1, 'draft', '2030-10-28T12:00:00.000Z', 1], [2, 'published', null, 1], [3, 'draft', null, 1], [4, 'archived', '2030-10-28T12:00:00.000Z', 1], [5, 'draft', '2030-10-28T13:00:00.000Z', null]] as const) {
    insert.run(id, `materia-${id}`, `Matéria ${id}`, 'BRASIL', 'Resumo', '<p>Texto</p>', status, scheduled, status === 'published' ? '2030-10-27T12:00:00.000Z' : null, '2030-10-27T10:00:00.000Z', cover)
  }
  function prepare(sql: string, args: any[] = []): any {
    return {
      bind: (...values: any[]) => prepare(sql, values),
      run: async () => { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } } },
      all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
      first: async () => sqlite.prepare(sql).get(...args) || null
    }
  }
  const env = { DB: { prepare }, PUBLIC_BASE_URL: 'https://diario.dopovo.com.br' } as any
  const create = (postId = 1) => createInstagramPublication(env, { postId, userId: 1, renderToken: `feed-${postId}`, storyRenderToken: `story-${postId}` })
  const app = new Hono<any>()
  app.use('*', async (c, next) => { c.set('adminUser', { id: 1, email: 'editor@example.com', role: 'admin' }); c.set('csrfToken', 'csrf'); await next() })
  app.get('/new', handleInstagramNew)
  app.get('/instagram/:id', handleInstagramDetail)
  return { sqlite, env, create, app }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2030-10-27T10:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('Instagram preparation for scheduled articles', () => {
  it('lists scheduled and published stories while excluding unscheduled drafts and archives', async () => {
    const { env, sqlite } = database()
    const posts = await listInstagramSourcePosts(env)
    expect(posts.map(p => p.id)).toEqual([1, 5, 2])
    expect(posts[0].scheduled_at).toBe('2030-10-28T12:00:00.000Z')
    expect((await listInstagramSourcePosts(env, 1, 2)).map(p => p.id)).toEqual([2])
    sqlite.close()
  })

  it('creates both feed and Story drafts without publishing the source article', async () => {
    const { env, create, sqlite } = database()
    const id = await create()
    const publication = await getInstagramPublication(env, id)
    expect(publication).toMatchObject({ status: 'draft', article_status: 'draft', article_scheduled_at: '2030-10-28T12:00:00.000Z' })
    expect(await getInstagramStoryVariant(env, id)).toMatchObject({ publication_id: id, title: 'Matéria 1' })
    expect((sqlite.prepare('SELECT status FROM posts WHERE id = 1').get() as any).status).toBe('draft')
    sqlite.close()
  })

  it('keeps ordinary drafts, archives and stories without covers out of creation', async () => {
    const { create, sqlite } = database()
    await expect(create(3)).rejects.toThrow('publicada ou agendada')
    await expect(create(4)).rejects.toThrow('publicada ou agendada')
    await expect(create(5)).rejects.toThrow('imagem de capa')
    sqlite.close()
  })

  it('opens the existing Instagram publication from the article shortcut', async () => {
    const { create, app, env, sqlite } = database()
    const id = await create()
    const response = await app.request('/new?post=1', {}, env)
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(`/admin/instagram/${id}`)
    expect((sqlite.prepare('SELECT COUNT(*) AS total FROM instagram_publications').get() as any).total).toBe(1)
    sqlite.close()
  })

  it('shows the scheduled story and links to an existing publication in the source selector', async () => {
    const { create, app, env, sqlite } = database()
    const id = await create()
    const html = await (await app.request('/new', {}, env)).text()
    expect(html).toContain('Agendada para')
    expect(html).toContain(`/admin/instagram/${id}`)
    expect(html).toContain('Abrir publicação')
    sqlite.close()
  })

  it('uses the future publication date for the Story link and shows the schedule notice', async () => {
    const { create, app, env, sqlite } = database()
    const id = await create()
    const response = await app.request(`/instagram/${id}`, {}, env)
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(html).toContain('/2030/10/28/materia-1/')
    expect(html).toContain('Matéria agendada para')
    expect(html).toContain('09:01')
    sqlite.close()
  })

  it('adds an Instagram shortcut to the scheduled article editor', () => {
    const html = renderPostFormPage({ post: { id: 1, title: 'Agendada', content: '<p>Texto</p>', status: 'draft', scheduled_at: '2030-10-28T12:00:00Z', tags: [] } as any, categories: [], authors: [], tags: [], user: { id: 1, role: 'admin', email: 'editor@example.com' }, csrfToken: 'csrf', cspNonce: 'nonce' })
    expect(html).toContain('/admin/instagram/new?post=1')
    expect(html).toContain('Instagram da matéria')
  })

  it('prevents dispatching Instagram before the article is expected to be live', () => {
    const pending = { article_status: 'draft', article_scheduled_at: '2030-10-28T12:00:00.000Z' }
    expect(() => validateInstagramPublicationTiming(pending)).toThrow('um minuto depois')
    expect(() => validateInstagramPublicationTiming(pending, '2030-10-28T12:00:00Z')).toThrow('um minuto depois')
    expect(() => validateInstagramPublicationTiming(pending, '2030-10-28T12:01:00Z')).not.toThrow()
    expect(() => validateInstagramPublicationTiming({ article_status: 'published' })).not.toThrow()
    expect(() => validateInstagramPublicationTiming({ article_status: 'archived' }, '2030-10-28T12:01:00Z')).toThrow('publicada ou agendada')
    expect(() => validateInstagramPublicationTiming({ article_status: 'draft', article_scheduled_at: null }, '2030-10-28T12:01:00Z')).toThrow('publicada ou agendada')
  })
})
