import { readFileSync } from 'node:fs'
import { Hono } from 'hono'
import { expect, it } from 'vitest'
import type { AppContext, Env } from '../../packages/core/types'
import { handleDoPovoPreview, handleSharedDoPovoPreview, handleDoPovoPublic } from '../../packages/core/web/do-povo-preview'
import { handleDoPovoWorkflow, handleSharedDoPovoWorkflow, portalEditor, portalPreview } from '../../packages/core/web/do-povo-cover'
import { guideFixture } from '../fixtures/evergreen'
import { archivePost, publishPost } from '../../packages/core/db/posts'

it('serves only published Do Povo articles and sitemap URLs from the shared catalog', async () => {
  const { db, env } = guideFixture({ legacyPublications: true })
  db.exec(`DROP TABLE settings;
    CREATE TABLE settings(key TEXT PRIMARY KEY, value_json TEXT, scope TEXT, updated_at TEXT);
    ALTER TABLE posts ADD COLUMN scheduled_at TEXT;
    ALTER TABLE posts ADD COLUMN content TEXT;
    ALTER TABLE posts ADD COLUMN updated_at TEXT;
    ALTER TABLE posts ADD COLUMN is_premium INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE posts ADD COLUMN cover_media_id INTEGER;
    CREATE TABLE media(id INTEGER PRIMARY KEY, r2_key TEXT);
    INSERT INTO media VALUES (1, 'demo.webp');`)
  db.exec(readFileSync('migrations/0064_post_publications.sql', 'utf8'))
  db.exec(readFileSync('migrations/0065_do_povo_publication_release.sql', 'utf8'))
  db.exec(`INSERT INTO posts(id,title,slug,status,seo_noindex,published_at,content,updated_at,publication_id,is_premium) VALUES
    (2,'Matéria do portal','portal','draft',0,NULL,'<p>Texto público</p>','2025-11-02','do-povo',0),
    (3,'Rascunho','rascunho','draft',0,NULL,'Texto privado',NULL,'do-povo',0),
    (4,'Matéria exclusiva','exclusiva','draft',0,NULL,'Texto exclusivo','2025-11-02','do-povo',1);`)
  await expect(publishPost(env.DB, 2)).rejects.toThrow('DO_POVO_PUBLICATION_NOT_ENABLED')
  db.exec(`INSERT INTO do_povo_publication_releases (post_id, expires_at)
    VALUES (2, datetime('now', '+10 minutes')), (3, datetime('now', '-10 minutes')), (4, datetime('now', '+10 minutes'))`)
  await expect(publishPost(env.DB, 3)).rejects.toThrow('DO_POVO_PUBLICATION_NOT_ENABLED')
  await publishPost(env.DB, 2)
  await publishPost(env.DB, 4)
  db.exec('UPDATE posts SET cover_media_id = 1 WHERE id = 2')
  const app = new Hono<{ Bindings: Env; Variables: AppContext }>()
  app.use('*', (c, next) => new URL(c.req.url).hostname === 'dopovo.com.br' ? handleDoPovoPublic(c) : next())
  app.post('/workflow/:operation', handleSharedDoPovoWorkflow)
  app.use('/admin/*', async (c, next) => {
    c.set('adminUser', { id: 1, name: 'Redação', email: 'redacao@example.org', role: 'editor' })
    await next()
  })
  app.on(['GET', 'POST'], portalEditor, c => handleSharedDoPovoPreview(c))
  app.get(portalPreview, c => handleSharedDoPovoPreview(c))
  app.get(portalPreview + '/materia/:slug', c => handleSharedDoPovoPreview(c))
  const view = (path: string) => app.request('https://dopovo.com.br' + path, undefined, env)
  for (const path of ['/login', '/admin/login']) {
    const login = await view(path)
    expect(login.status).toBe(302)
    expect(login.headers.get('Location')).toBe('https://diario.dopovo.com.br/admin/login')
  }
  const staleLogin = await app.request('https://dopovo.com.br/admin/login', { method: 'POST' }, env)
  expect(staleLogin.status).toBe(303)
  expect(staleLogin.headers.get('Location')).toBe('https://diario.dopovo.com.br/admin/login')
  for (const [path, destination] of [
    ['/portal/login', '/portal/login'],
    ['/portal/register', '/portal/register'],
    ['/portal/account', '/conta'],
    ['/conta/', '/conta'],
    ['/assinatura', '/assinar'],
    ['/assinar', '/assinar']
  ]) {
    const redirect = await view(path)
    expect(redirect.status).toBe(302)
    expect(redirect.headers.get('Location')).toBe('https://diario.dopovo.com.br' + destination)
  }
  expect((await view('/noticia/noticia-exemplo/')).status).toBe(404)
  expect((await view('/noticia/rascunho/')).status).toBe(404)
  expect((await view('/noticia/exclusiva/')).status).toBe(404)
  expect((await view('/2025/11/01/portal/')).status).toBe(404)
  expect((await view('/noticia/portal')).headers.get('Location')).toBe('/noticia/portal/')
  const article = await (await view('/noticia/portal/')).text()
  expect(article).toContain('<p>Texto público</p>')
  expect(article).toContain('rel="canonical" href="https://dopovo.com.br/noticia/portal/"')
  const sitemap = await (await view('/sitemap.xml')).text()
  expect(sitemap).toContain('https://dopovo.com.br/noticia/portal/')
  expect(sitemap).not.toMatch(/noticia-exemplo|rascunho|exclusiva/)
  expect(await (await view('/sitemap-index.xml')).text()).toContain('https://dopovo.com.br/sitemap-news.xml')
  db.prepare('INSERT INTO settings (key, value_json, scope) VALUES (?, ?, ?)').run(
    'do_povo.ads_txt', JSON.stringify('example.com, publisher, DIRECT'), 'public'
  )
  expect(await (await view('/ads.txt')).text()).toBe('example.com, publisher, DIRECT\n')
  const run = (operation: string, body = {}) => app.request('/workflow/' + operation, {
    method: 'POST', body: JSON.stringify(body)
  }, env)
  const batch = await (await run('candidates')).json()
  expect(batch.candidates.map((item: { id: string }) => item.id)).toEqual(['portal:2', 'diario:1'])
  const decision = { revision: batch.revision, through: batch.through, lineup: ['portal:2', 'diario:1'], reason: 'A reportagem do portal abre a capa.' }
  expect((await run('apply', decision)).status).toBe(200)
  expect((await run('apply', decision)).status).toBe(409)
  const cover = await (await view('/')).text()
  expect(cover).toContain('href="/conta">Minha conta')
  expect(cover).toContain('width="1200" height="675" fetchpriority="high"')
  expect(cover).toContain('/i/demo.webp?w=400 400w')
  expect(cover).toContain('<h1><a href="/noticia/portal/">Matéria do portal</a></h1>')
  expect(cover).toContain('https://diario.dopovo.com.br/2026/11/01/noticia-exemplo/')
  const edit = (pin: string) => app.request(portalEditor, {
    method: 'POST', body: new URLSearchParams({ action: 'cover', nominee: 'portal:2', pin, duration: '30' })
  }, env)
  const preview = await (await app.request(portalPreview, undefined, env)).text()
  expect(preview).toContain(portalPreview + '/materia/portal')
  expect((await app.request(portalPreview + '/materia/portal', undefined, env)).status).toBe(200)
  expect((await edit('diario:1')).status).toBe(303)
  expect(await (await run('candidates')).json()).toMatchObject({ pinned: 'diario:1', nominated: 'portal:2' })
  expect(await (await view('/')).text()).toContain('<h1><a href="https://diario.dopovo.com.br/')
  await archivePost(env.DB, 2)
  expect((await view('/noticia/portal/')).status).toBe(404)
  expect(await (await view('/')).text()).not.toContain('/noticia/portal/')
})

it('publishes a portal article, applies an independent AI cover and honors a temporary pin', async () => {
  const { db, env } = guideFixture()
  db.exec(`DROP TABLE settings;
    CREATE TABLE settings(key TEXT PRIMARY KEY, value_json TEXT, scope TEXT, updated_at TEXT);
    UPDATE posts SET published_at = '2025-11-15T12:00:00Z' WHERE id = 1;
    INSERT INTO settings(key,value_json) VALUES('home.ai_edition','{"lineup":[1]}');`)
  db.exec(readFileSync('migrations/0063_do_povo_editorial.sql', 'utf8'))
  const app = new Hono<{ Bindings: Env; Variables: AppContext }>()
  app.use('/admin/*', async (c, next) => {
    c.set('adminUser', { id: 1, name: 'Redação', email: 'redacao@example.org',
      role: c.req.header('role') || 'editor' } as AppContext['adminUser'])
    await next()
  })
  app.on(['GET', 'POST'], portalEditor, handleDoPovoPreview)
  app.get(portalPreview, handleDoPovoPreview)
  app.get(portalPreview + '/materia/:slug', handleDoPovoPreview)
  app.post('/workflow/:operation', handleDoPovoWorkflow)
  const article = { id: '', title: 'Matéria própria', slug: 'materia-propria', summary: 'Resumo', body: '<script>texto</script>' }
  const edit = (fields: Record<string, string>, role = 'editor') => app.request(portalEditor, {
    method: 'POST', headers: { role }, body: new URLSearchParams(fields)
  }, env)
  const run = (operation: string, body = {}) => app.request('/workflow/' + operation, {
    method: 'POST', body: JSON.stringify(body)
  }, env)
  const view = (path: string) => app.request(path, undefined, env)
  const articlePath = portalPreview + '/materia/materia-propria'
  expect((await edit({ ...article, action: 'publish' }, 'reporter')).status).toBe(403)
  expect((await edit({ ...article, action: 'draft' })).status).toBe(303)
  expect((await view(articlePath)).status).toBe(404)
  expect((await edit({ ...article, id: '1', action: 'publish' })).status).toBe(303)
  const articleHtml = await (await view(articlePath)).text()
  expect(articleHtml).toContain('&lt;script&gt;texto&lt;/script&gt;')
  expect(articleHtml).not.toContain('class="source"')
  expect((await edit({ action: 'cover', nominee: 'portal:1', pin: '', duration: '30' })).status).toBe(303)
  const batch = await (await run('candidates')).json()
  expect(batch.nominated).toBe('portal:1')
  expect(batch.candidates.map((item: { id: string }) => item.id)).toEqual(['portal:1', 'diario:1'])
  const decision = { revision: batch.revision, through: batch.through, lineup: ['portal:1', 'diario:1'], reason: 'Prioridade para a produção própria.' }
  expect((await run('apply', { ...decision, lineup: ['portal:42'] })).status).toBe(409)
  expect((await run('apply', decision)).status).toBe(200)
  expect((await run('apply', decision)).status).toBe(409)
  let cover = await view(portalPreview)
  expect(cover.headers.get('Cache-Control')).toBe('private, no-store')
  let html = await cover.text()
  expect(html).toContain(`<h1><a href="${articlePath}">Matéria própria</a></h1>`)
  expect(html).not.toContain('class="source">Do Povo')
  expect(html).not.toContain('Produção própria')
  expect(html).toContain('class="source">Diário do Povo')
  expect(html).toContain('https://diario.dopovo.com.br/2025/11/15/noticia-exemplo/')
  expect((await edit({ action: 'cover', nominee: '', pin: 'diario:1', duration: '30' })).status).toBe(303)
  cover = await view(portalPreview)
  expect(await cover.text()).toContain('<h1><a href="https://diario.dopovo.com.br/2025/11/15/noticia-exemplo/">')
  db.exec("UPDATE posts SET status = 'archived' WHERE id=1")
  html = await (await view(portalPreview)).text()
  expect(html).not.toContain('noticia-exemplo')
  expect(html).toContain(articlePath)
  expect((await edit({ ...article, id: '1', action: 'unpublish' })).status).toBe(303)
  expect((await view(articlePath)).status).toBe(404)
  expect(db.prepare("SELECT value_json FROM settings WHERE key='home.ai_edition'").get()).toEqual({ value_json: '{"lineup":[1]}' })
})
