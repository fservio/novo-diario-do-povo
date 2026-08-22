import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'

describe('category page D1 cost controls', () => {
  it('does not run COUNT(*) for public category pagination', () => {
    const source = readFileSync('packages/core/db/category.ts', 'utf-8')

    expect(source).not.toContain('COUNT(*) as count')
    expect(source).toContain('limit: normalizedPageSize + 1')
    expect(source).toContain('hasNextPage')
    expect(source).toContain('category-page:v4')
  })

  it('renders pagination from hasNextPage instead of total pages', () => {
    const source = readFileSync('packages/core/web/category.ts', 'utf-8')

    expect(source).toContain('hasNextPage')
    expect(source).not.toContain('totalPages')
    expect(source).toContain('Pagina ${page}')
  })

  it('has a partial index for the public category listing query', () => {
    const migration = readFileSync('migrations/0026_category_page_cost_indexes.sql', 'utf-8')

    expect(migration).toContain('idx_posts_public_category_page')
    expect(migration).toContain("WHERE status = 'published' AND seo_noindex = 0")
  })
})
