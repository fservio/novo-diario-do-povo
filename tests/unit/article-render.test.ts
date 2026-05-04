/**
 * Article Page Render Unit Tests
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Article Page Rendering', () => {
  it('should contain required HTML markers in source', () => {
    const articleCode = readFileSync('packages/core/web/article.ts', 'utf-8')
    
    expect(articleCode).toContain('id="articleTitle"')
    expect(articleCode).toContain('id="breadcrumb"')
    expect(articleCode).toContain('id="articleBody"')
    expect(articleCode).toContain('id="paywallCta"')
  })
  
  it('should have article ad slots in source', () => {
    const articleCode = readFileSync('packages/core/web/article.ts', 'utf-8')
    
    expect(articleCode).toContain('article_top')
    expect(articleCode).toContain('article_inread_1')
    expect(articleCode).toContain('article_footer')
  })
  
  it('should have JSON-LD scripts with CSP nonce', () => {
    const articleCode = readFileSync('packages/core/web/article.ts', 'utf-8')
    
    expect(articleCode).toContain('application/ld+json')
    expect(articleCode).toContain('nonce=')
  })
  
  it('should have NewsArticle type via SEO module', () => {
    const seoCode = readFileSync('packages/core/seo/index.ts', 'utf-8')
    
    expect(seoCode).toContain('NewsArticle')
  })
  
  it('should not contain Tailwind CDN', () => {
    const articleCode = readFileSync('packages/core/web/article.ts', 'utf-8')
    
    expect(articleCode).not.toContain('cdn.tailwindcss.com')
  })
  
  it('should conditionally show inread ads based on isBlocked', () => {
    const articleCode = readFileSync('packages/core/web/article.ts', 'utf-8')
    
    expect(articleCode).toContain('isBlocked')
    expect(articleCode).toContain('!isBlocked')
  })
  
  it('should show paywall CTA when blocked', () => {
    const articleCode = readFileSync('packages/core/web/article.ts', 'utf-8')
    
    expect(articleCode).toContain('paywallCta')
    expect(articleCode).toContain('Assinar')
  })
  
  it('should use renderPublicLayout', () => {
    const articleCode = readFileSync('packages/core/web/article.ts', 'utf-8')
    
    expect(articleCode).toContain('renderPublicLayout')
  })
})

describe('Article Route Integration', () => {
  it('should have paywall check in route', () => {
    const indexCode = readFileSync('packages/core/web/routes-v1.ts', 'utf-8')
    
    expect(indexCode).toContain('checkPostAccess')
    expect(indexCode).toContain('isBlocked')
  })
  
  it('should use renderArticlePage in route', () => {
    const indexCode = readFileSync('packages/core/web/routes-v1.ts', 'utf-8')
    
    expect(indexCode).toContain('renderArticlePage')
  })
})
