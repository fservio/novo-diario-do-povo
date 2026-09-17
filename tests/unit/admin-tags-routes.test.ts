import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('rotas administrativas de tags', () => {
  const source = readFileSync(new URL('../../functions/index.ts', import.meta.url), 'utf8')

  it('registra listagem, criação, edição e exclusão', () => {
    expect(source).toContain("app.get('/admin/tags'")
    expect(source).toContain("app.get('/admin/tags/new'")
    expect(source).toContain("app.post('/admin/tags'")
    expect(source).toContain("app.get('/admin/tags/:id{[0-9]+}'")
    expect(source).toContain("app.post('/admin/tags/:id{[0-9]+}'")
    expect(source).toContain("app.post('/admin/tags/:id{[0-9]+}/delete'")
  })

  it('protege a área com RBAC editorial e CSRF', () => {
    expect(source).toContain("app.use('/admin/tags', requireEditorForTags, protectTeamCsrf)")
    expect(source).toContain("app.use('/admin/tags/*', requireEditorForTags, protectTeamCsrf)")
  })

  it('registra /new antes da rota numérica', () => {
    expect(source.indexOf("app.get('/admin/tags/new'")).toBeLessThan(
      source.indexOf("app.get('/admin/tags/:id{[0-9]+}'")
    )
  })
})
