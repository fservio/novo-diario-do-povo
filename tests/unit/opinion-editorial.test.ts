import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('Editoria de Opinião', () => {
  it('mantém /opiniao canônica e compatibilidade com /colunas', () => {
    const routes = readFileSync('functions/index.ts', 'utf8')
    expect(routes).toContain("app.get('/opiniao'")
    expect(routes).toContain("app.get('/colunas', (c) => c.redirect('/opiniao', 301))")
  })

  it('separa editoriais, artigos e colunas na home editorial', () => {
    const renderer = readFileSync('packages/core/web/opinion.ts', 'utf8')
    expect(renderer).toContain('Editorial do Jornal')
    expect(renderer).toContain('Artigos')
    expect(renderer).toContain('Nossos colunistas')
    expect(renderer).toContain("'@type': 'CollectionPage'")
  })

  it('classifica a publicação no banco e mantém notícias fora de Opinião', () => {
    const migration = readFileSync('migrations/0034_opinion_editorial_formats.sql', 'utf8')
    expect(migration).toContain("DEFAULT 'news'")
    expect(migration).toContain("'editorial', 'article', 'column'")
    expect(migration).toContain('idx_posts_opinion_public')
  })

  it('apresenta assinatura coerente em matérias opinativas', () => {
    const article = readFileSync('packages/core/web/article.ts', 'utf8')
    expect(article).toContain('ed-article-column-signature')
    expect(article).toContain('Posição institucional')
    expect(article).toContain("opinionType === 'article'")
  })
})
