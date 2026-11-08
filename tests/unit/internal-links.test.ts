import { describe, expect, it } from 'vitest'
import { linkBudget, linkableParagraphs, renderInternalLinks } from '../../packages/core/seo/internal-links'

describe('contextual internal links', () => {
  const targets = new Map([[1, '/2026/11/07/contexto/']])
  it('caps suggestions and counts existing internal links', () => {
    expect(linkBudget('<p>' + 'notícia '.repeat(1500) + '<a href="/noticia/anterior/">anterior</a></p>')).toBe(4)
    expect(linkBudget('<p><a href="https://example.org/">fonte</a> contextual</p>')).toBe(1)
  })
  it('wraps a literal phrase and preserves the surrounding text', () => {
    const html = '<p>O Real Madrid venceu.</p>'
    expect(renderInternalLinks(html, [{ paragraph: 0, anchor: 'Real Madrid', targetId: 1 }], targets))
      .toBe('<p>O <a href="/2026/11/07/contexto/">Real Madrid</a> venceu.</p>')
  })
  it('skips ambiguous phrases, markup and partial words', () => {
    const html = '<p>Real e Real</p><p><strong>Real Madrid</strong></p><p>Realidade</p>'
    expect(linkableParagraphs(html).map(item => item.paragraph)).toEqual([0, 2])
    expect(renderInternalLinks(html, [0, 1, 2].map(paragraph => ({ paragraph, anchor: 'Real', targetId: 1 })), targets)).toBe(html)
  })
})
