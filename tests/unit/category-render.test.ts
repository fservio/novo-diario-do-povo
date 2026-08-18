/**
 * Category Page Render Unit Tests
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Category Page Rendering', () => {
  it('should have categoryTitle marker in source', () => {
    const categoryCode = readFileSync('packages/core/web/category.ts', 'utf-8')
    
    expect(categoryCode).toContain('id="categoryTitle"')
  })
  
  it('should have categoryList marker in source', () => {
    const categoryCode = readFileSync('packages/core/web/category.ts', 'utf-8')
    
    expect(categoryCode).toContain('id="categoryList"')
  })
  
  it('should have pagination marker in source', () => {
    const categoryCode = readFileSync('packages/core/web/category.ts', 'utf-8')
    
    expect(categoryCode).toContain('id="pagination"')
  })
  
  it('should have listing ad slots in source', () => {
    const categoryCode = readFileSync('packages/core/web/category.ts', 'utf-8')
    
    expect(categoryCode).toContain('category_top_leaderboard')
    expect(categoryCode).toContain('category_infeed')
  })
  
  it('should not contain Tailwind CDN', () => {
    const categoryCode = readFileSync('packages/core/web/category.ts', 'utf-8')
    
    expect(categoryCode).not.toContain('cdn.tailwindcss.com')
  })
  
  it('should use renderPublicLayout', () => {
    const categoryCode = readFileSync('packages/core/web/category.ts', 'utf-8')
    
    expect(categoryCode).toContain('renderPublicLayout')
  })

  it('renders the editorial category as a hierarchical cover', () => {
    const categoryCode = readFileSync('packages/core/web/category.ts', 'utf-8')

    expect(categoryCode).toContain('ed-category-heading')
    expect(categoryCode).toContain('ed-category-cover')
    expect(categoryCode).toContain('ed-category-cover__lead')
    expect(categoryCode).toContain('ed-category-cover__secondary')
    expect(categoryCode).toContain('ed-category-latest')
  })

  it('keeps the category description in metadata instead of the editorial header', () => {
    const categoryCode = readFileSync('packages/core/web/category.ts', 'utf-8')
    const editorialBranch = categoryCode.slice(
      categoryCode.indexOf('if (isEditorial)'),
      categoryCode.indexOf('const bodyHtml = isAllType')
    )

    expect(editorialBranch).not.toContain('ed-page-description')
    expect(editorialBranch).toContain('description: category.description')
  })
})
