/**
 * Public Layout Unit Tests
 */

import { describe, it, expect } from 'vitest'
import { renderPublicLayout, type PublicLayoutParams } from '../../packages/core/web/layout'

describe('renderPublicLayout', () => {
  it('should include cover drawer elements when coverOfDay is provided', () => {
    const params: PublicLayoutParams = {
      title: 'Test Page',
      canonicalUrl: 'https://example.com/test',
      siteName: 'Test Site',
      navItems: [],
      coverOfDay: {
        r2Key: 'test-cover.jpg',
        alt: 'Test Cover',
        aspectRatio: '3/4'
      },
      bodyHtml: '<div>Test Content</div>'
    }

    const html = renderPublicLayout(params)

    expect(html).toContain('id="coverBtn"')
    expect(html).toContain('id="coverOverlay"')
    expect(html).toContain('id="coverPanel"')
    expect(html).toContain('id="coverClose"')
  })

  it('should include CSP nonce in drawer script when nonce provided', () => {
    const params: PublicLayoutParams = {
      title: 'Test Page',
      canonicalUrl: 'https://example.com/test',
      nonce: 'test-nonce-123',
      siteName: 'Test Site',
      navItems: [],
      coverOfDay: {
        r2Key: 'test-cover.jpg',
        alt: 'Test Cover'
      },
      bodyHtml: '<div>Test Content</div>'
    }

    const html = renderPublicLayout(params)

    expect(html).toContain('data-script="cover-drawer"')
    expect(html).toContain('nonce="test-nonce-123"')
  })

  it('should include mainContent wrapper', () => {
    const params: PublicLayoutParams = {
      title: 'Test Page',
      canonicalUrl: 'https://example.com/test',
      siteName: 'Test Site',
      navItems: [],
      bodyHtml: '<div>Test Content</div>'
    }

    const html = renderPublicLayout(params)

    expect(html).toContain('id="mainContent"')
    expect(html).toContain('Test Content')
  })

  it('should include categories in navigation', () => {
    const params: PublicLayoutParams = {
      title: 'Test Page',
      canonicalUrl: 'https://example.com/test',
      siteName: 'Test Site',
      navItems: [],
      categories: [
        { id: 1, name: 'Brasil', slug: 'brasil' },
        { id: 2, name: 'Economia', slug: 'economia' }
      ],
      bodyHtml: '<div>Test Content</div>'
    }

    const html = renderPublicLayout(params)

    expect(html).toContain('Brasil')
    expect(html).toContain('Economia')
    expect(html).toContain('/categoria/brasil')
    expect(html).toContain('/categoria/economia')
  })

  it('should include extra head HTML when provided', () => {
    const params: PublicLayoutParams = {
      title: 'Test Page',
      canonicalUrl: 'https://example.com/test',
      siteName: 'Test Site',
      navItems: [],
      bodyHtml: '<div>Test Content</div>',
      extraHeadHtml: '<meta property="og:type" content="article">'
    }

    const html = renderPublicLayout(params)

    expect(html).toContain('<meta property="og:type" content="article">')
  })

  it('should render minimal theme CSS when theme is minimal', () => {
    const params: PublicLayoutParams = {
      title: 'Test Page',
      canonicalUrl: 'https://example.com/test',
      siteName: 'Test Site',
      navItems: [],
      bodyHtml: '<div>Test Content</div>',
      theme: 'minimal'
    }

    const html = renderPublicLayout(params)

    expect(html).toContain('<link href="/static/minimal.css?v=')
    expect(html).toContain('class="theme-minimal"')
  })

  it('should render alltype theme CSS when theme is alltype', () => {
    const params: PublicLayoutParams = {
      title: 'Test Page',
      canonicalUrl: 'https://example.com/test',
      siteName: 'Test Site',
      navItems: [],
      bodyHtml: '<div>Test Content</div>',
      theme: 'alltype'
    }

    const html = renderPublicLayout(params)

    expect(html).toContain('<link href="/static/alltype.css?v=')
    expect(html).toContain('class="theme-alltype"')
  })

  it('should fallback to minimal theme CSS when theme is invalid, default or missing', () => {
    const params: PublicLayoutParams = {
      title: 'Test Page',
      canonicalUrl: 'https://example.com/test',
      siteName: 'Test Site',
      navItems: [],
      bodyHtml: '<div>Test Content</div>',
      theme: 'invalid-theme-name' as any
    }

    const html = renderPublicLayout(params)

    expect(html).toContain('<link href="/static/minimal.css?v=')
    expect(html).toContain('class="theme-minimal"')
  })

  it('should preserve critical layout IDs', () => {
    const params: PublicLayoutParams = {
      title: 'Test Page',
      canonicalUrl: 'https://example.com/test',
      siteName: 'Test Site',
      navItems: [],
      bodyHtml: '<div>Test Content</div>',
      coverOfDay: {
        r2Key: 'test-cover.jpg',
        alt: 'Test Cover'
      }
    }

    const html = renderPublicLayout(params)

    expect(html).toContain('id="mainContent"')
    expect(html).toContain('id="coverBtn"')
    expect(html).toContain('id="coverOverlay"')
    expect(html).toContain('id="coverPanel"')
    expect(html).toContain('id="coverClose"')
  })
})
