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
})
