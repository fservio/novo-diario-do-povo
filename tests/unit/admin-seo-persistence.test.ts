import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildAdminPostUpdatePayload, updatePostSchema } from '../../packages/core/admin/posts'
import { updatePost } from '../../packages/core/db/posts'
import { getSeoPost, listSeoHistory, readSeoMetadata } from '../../packages/core/seo-automation'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
const metadata = { seo_title: 'Convocação de profissionais da saúde em Teresina', seo_description: 'Confira os documentos exigidos e o prazo da convocação.', seo_primary_keyword: 'convocação da saúde em Teresina', seo_secondary_keywords: ['documentos exigidos', 'prazo de apresentação'] }

function fixture(overrides: Record<string, unknown> = {}) {
  const sql = new DatabaseSync(':memory:')
  sql.exec(`CREATE TABLE posts(id INTEGER PRIMARY KEY,title TEXT,excerpt TEXT,content TEXT,content_markdown TEXT,content_json TEXT,content_version INTEGER DEFAULT 1,content_format TEXT,
    status TEXT,slug TEXT,published_at TEXT,created_at TEXT,updated_at TEXT,category_id INTEGER,opinion_type TEXT,is_live INTEGER,seo_noindex INTEGER,seo_canonical TEXT,seo_title TEXT,seo_description TEXT);
    CREATE TABLE posts_tags(post_id INTEGER,tag_id INTEGER,created_at TEXT);`)
  sql.exec(readFileSync(new URL('../../migrations/0054_seo_automation.sql', import.meta.url), 'utf8'))
  const row = { id: 1, title: 'Manchete editorial', excerpt: 'Resumo da matéria.', content: '<p>Texto apurado.</p>', content_markdown: null, content_json: null, content_version: 1, content_format: 'legacy', status: 'published', slug: 'materia', published_at: '2026-10-30T10:00:00Z', created_at: '2026-10-30T10:00:00Z', updated_at: '2026-10-30T10:00:00Z', category_id: 1, opinion_type: 'news', is_live: 0, seo_noindex: 0, ...overrides }
  sql.prepare(`INSERT INTO posts(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row))
  const prepare = (query: string, args: unknown[] = []): any => ({ bind: (...values: unknown[]) => prepare(query, values), first: async () => sql.prepare(query).get(...args) ?? null, all: async () => ({ results: sql.prepare(query).all(...args) }), run: async () => { const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } } } })
  const db: any = { prepare, batch: async (statements: any[]) => { sql.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results } catch (error) { sql.exec('ROLLBACK'); throw error } } }
  return { sql, db }
}

describe('Metadados SEO pelo payload real do formulário administrativo', () => {
  it.each([
    { name: 'HTML legado', overrides: {}, content: '<p>Texto apurado.</p>' },
    { name: 'Markdown exibido como HTML', overrides: { content_format: 'markdown', content_markdown: '**Texto apurado.**', content: '<p><strong>Texto apurado.</strong></p>' }, content: '<p><strong>Texto apurado.</strong></p>' },
    { name: 'legado aberto no editor visual', overrides: {}, content: '<p>Texto apurado.</p>', content_json: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto apurado.' }] }] }) },
  ])('salvar apenas SEO conserva corpo, formato, versão e datas: $name', async scenario => {
    const { sql, db } = fixture(scenario.overrides)
    try {
      const before = await getSeoPost(db, 1)
      const data = updatePostSchema.parse({ ...metadata, seo_secondary_keywords: metadata.seo_secondary_keywords.join('\n'), title: before.title, excerpt: before.excerpt, content: scenario.content, content_json: scenario.content_json, content_version: '1', expected_seo_version: '0', category_id: '1', opinion_type: 'news', is_live: '0', seo_noindex: '0' })
      const payload = buildAdminPostUpdatePayload(data, before as any, 1)
      expect(payload.content_markdown).toBeUndefined()
      expect(payload.content).toBeUndefined()
      await updatePost(db, 1, payload as any)
      const after = await getSeoPost(db, 1)
      expect(readSeoMetadata(after)).toEqual(metadata)
      for (const key of ['title', 'excerpt', 'content', 'content_markdown', 'content_json', 'content_format', 'content_version', 'published_at', 'updated_at', 'status', 'slug', 'seo_canonical', 'seo_noindex']) expect(after[key], key).toEqual(before[key])
      expect(after.seo_version).toBe(1)
      expect(await listSeoHistory(db, 1)).toHaveLength(1)
    } finally { sql.close() }
  })

  it('continua salvando uma alteração real do texto como edição editorial', async () => {
    const { sql, db } = fixture()
    try {
      const before = await getSeoPost(db, 1)
      const data = updatePostSchema.parse({ ...metadata, title: before.title, content: '<p>Texto atualizado pela redação.</p>', content_version: 1, expected_seo_version: 0 })
      const payload = buildAdminPostUpdatePayload(data, before as any, 1)
      expect(payload.content_markdown).toBe('<p>Texto atualizado pela redação.</p>')
      await updatePost(db, 1, payload as any)
      const after = await getSeoPost(db, 1)
      expect(after.content).toBe('<p>Texto atualizado pela redação.</p>')
      expect(after.content_version).toBe(2)
      expect(after.updated_at).not.toBe(before.updated_at)
      expect(readSeoMetadata(after)).toEqual(metadata)
    } finally { sql.close() }
  })
})
