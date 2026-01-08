/**
 * Testes para sanitização HTML do editor
 */

import { describe, it, expect } from 'vitest'
import { sanitizeHtml, renderMarkdownToHtml } from '../../packages/core/render/sanitize'

describe('sanitizeHtml', () => {
  it('deve remover tags script', () => {
    const dirty = '<p>Hello</p><script>alert("xss")</script><p>World</p>'
    const clean = sanitizeHtml(dirty)
    
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('alert')
    expect(clean).toContain('<p>Hello</p>')
    expect(clean).toContain('<p>World</p>')
  })
  
  it('deve remover event handlers (onclick, onerror)', () => {
    const dirty = '<a href="/page" onclick="alert(1)">Link</a><img src="/i/x.jpg" onerror="alert(2)">'
    const clean = sanitizeHtml(dirty)
    
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('onerror')
    expect(clean).toContain('<a href="/page">Link</a>')
  })
  
  it('deve bloquear javascript: URLs', () => {
    const dirty = '<a href="javascript:alert(1)">Bad Link</a>'
    const clean = sanitizeHtml(dirty)
    
    expect(clean).not.toContain('javascript:')
    // Deve conter a tag mas sem o href
    expect(clean).toContain('<a>Bad Link</a>')
  })
  
  it('deve permitir tags seguras (p, a, strong, em, ul, ol, li, blockquote, h2, h3)', () => {
    const html = `
      <p>Paragraph</p>
      <a href="https://example.com">Link</a>
      <strong>Bold</strong>
      <em>Italic</em>
      <ul><li>Item</li></ul>
      <ol><li>Item</li></ol>
      <blockquote>Quote</blockquote>
      <h2>Heading 2</h2>
      <h3>Heading 3</h3>
    `
    const clean = sanitizeHtml(html)
    
    expect(clean).toContain('<p>Paragraph</p>')
    expect(clean).toContain('<a href="https://example.com">Link</a>')
    expect(clean).toContain('<strong>Bold</strong>')
    expect(clean).toContain('<em>Italic</em>')
    expect(clean).toContain('<ul><li>Item</li></ul>')
    expect(clean).toContain('<ol><li>Item</li></ol>')
    expect(clean).toContain('<blockquote>Quote</blockquote>')
    expect(clean).toContain('<h2>Heading 2</h2>')
    expect(clean).toContain('<h3>Heading 3</h3>')
  })
  
  it('deve permitir figure + img + figcaption', () => {
    const html = `
      <figure>
        <img src="/i/test.jpg" alt="Test image" width="800" height="600" loading="lazy">
        <figcaption>Test caption</figcaption>
      </figure>
    `
    const clean = sanitizeHtml(html)
    
    expect(clean).toContain('<figure>')
    expect(clean).toContain('<img')
    expect(clean).toContain('src="/i/test.jpg"')
    expect(clean).toContain('alt="Test image"')
    expect(clean).toContain('width="800"')
    expect(clean).toContain('height="600"')
    expect(clean).toContain('loading="lazy"')
    expect(clean).toContain('<figcaption>Test caption</figcaption>')
    expect(clean).toContain('</figure>')
  })
  
  it('deve validar src de imagens (apenas /i/ ou https://)', () => {
    const validLocal = '<img src="/i/valid.jpg" alt="Valid">'
    const validHttps = '<img src="https://example.com/valid.jpg" alt="Valid HTTPS">'
    const invalidJs = '<img src="javascript:alert(1)" alt="Invalid">'
    const invalidData = '<img src="data:text/html,<script>alert(1)</script>" alt="Invalid">'
    
    expect(sanitizeHtml(validLocal)).toContain('src="/i/valid.jpg"')
    expect(sanitizeHtml(validHttps)).toContain('src="https://example.com/valid.jpg"')
    expect(sanitizeHtml(invalidJs)).not.toContain('javascript:')
    expect(sanitizeHtml(invalidData)).not.toContain('data:')
  })
  
  it('deve escapar atributos perigosos', () => {
    const dirty = '<a href="https://example.com?foo=1&bar=2">Link</a>'
    const clean = sanitizeHtml(dirty)
    
    // & deve ser escapado em atributos
    expect(clean).toContain('&amp;')
    expect(clean).toContain('href=')
  })
  
  it('deve escapar HTML em title attributes', () => {
    const dirty = '<a href="#" title="Test <script>alert(1)</script>">Link</a>'
    const clean = sanitizeHtml(dirty)
    
    // Script tags em atributos devem ser escapados ou removidos
    expect(clean).not.toContain('<script')
    expect(clean).toContain('Link</a>')
  })
  
  it('deve remover tags não permitidas', () => {
    const dirty = '<p>Safe</p><iframe src="evil.com"></iframe><embed src="bad.swf">'
    const clean = sanitizeHtml(dirty)
    
    expect(clean).toContain('<p>Safe</p>')
    expect(clean).not.toContain('<iframe')
    expect(clean).not.toContain('<embed')
  })
  
  it('deve preservar texto entre tags removidas', () => {
    const dirty = '<p>Before</p><script>alert(1)</script><p>After</p>'
    const clean = sanitizeHtml(dirty)
    
    expect(clean).toContain('<p>Before</p>')
    expect(clean).toContain('<p>After</p>')
  })
})

describe('renderMarkdownToHtml', () => {
  it('deve converter headers ## e ###', () => {
    const md = '## Heading 2\n### Heading 3'
    const html = renderMarkdownToHtml(md)
    
    expect(html).toContain('<h2>Heading 2</h2>')
    expect(html).toContain('<h3>Heading 3</h3>')
  })
  
  it('deve converter bold **text** e italic *text*', () => {
    const md = 'This is **bold** and this is *italic*'
    const html = renderMarkdownToHtml(md)
    
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
  })
  
  it('deve converter links [text](url)', () => {
    const md = 'Check [this link](https://example.com)'
    const html = renderMarkdownToHtml(md)
    
    expect(html).toContain('<a href="https://example.com">this link</a>')
  })
  
  it('deve converter listas não ordenadas (- item)', () => {
    const md = '- Item 1\n- Item 2\n- Item 3'
    const html = renderMarkdownToHtml(md)
    
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>Item 1</li>')
    expect(html).toContain('<li>Item 2</li>')
    expect(html).toContain('<li>Item 3</li>')
    expect(html).toContain('</ul>')
  })
  
  it('deve converter blockquotes (> text)', () => {
    const md = '> This is a quote'
    const html = renderMarkdownToHtml(md)
    
    expect(html).toContain('<blockquote>This is a quote</blockquote>')
  })
  
  it('deve converter parágrafos', () => {
    const md = 'Line 1\n\nLine 2'
    const html = renderMarkdownToHtml(md)
    
    expect(html).toContain('<p>Line 1</p>')
    expect(html).toContain('<p>Line 2</p>')
  })
  
  it('deve preservar HTML blocks (figure)', () => {
    const md = `
Some text before

<figure>
  <img src="/i/test.jpg" alt="Test">
  <figcaption>Caption</figcaption>
</figure>

Some text after
    `
    const html = renderMarkdownToHtml(md)
    
    expect(html).toContain('<figure>')
    expect(html).toContain('<img src="/i/test.jpg" alt="Test">')
    expect(html).toContain('<figcaption>Caption</figcaption>')
    expect(html).toContain('</figure>')
    expect(html).toContain('Some text before')
    expect(html).toContain('Some text after')
  })
})

describe('Compatibilidade com posts antigos', () => {
  it('deve processar HTML puro sem erros', () => {
    const oldHtml = '<p>Old post with pure HTML</p><strong>Bold</strong>'
    const clean = sanitizeHtml(oldHtml)
    
    expect(clean).toContain('<p>Old post with pure HTML</p>')
    expect(clean).toContain('<strong>Bold</strong>')
  })
  
  it('deve retornar string vazia para input vazio', () => {
    expect(sanitizeHtml('')).toBe('')
    expect(sanitizeHtml(null as any)).toBe('')
    expect(sanitizeHtml(undefined as any)).toBe('')
  })
  
  it('deve processar markdown misto com HTML', () => {
    const mixed = '## Title\n\n<figure><img src="/i/test.jpg"></figure>\n\n**Bold** text'
    const html = renderMarkdownToHtml(mixed)
    
    expect(html).toContain('<h2>Title</h2>')
    expect(html).toContain('<figure>')
    expect(html).toContain('<strong>Bold</strong>')
  })
})
