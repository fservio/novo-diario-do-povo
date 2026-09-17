import { describe, expect, it } from 'vitest'
import {
  editorialDocumentHasText,
  parseEditorialDocument,
  renderEditorialDocumentToHtml
} from '../../packages/core/editorial-content'

const visualDocument = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Contexto da notícia' }]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'O texto foi ' },
        { type: 'text', text: 'apurado', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' pela redação.' }
      ]
    },
    {
      type: 'editorialImage',
      attrs: {
        src: '/i/fotos/reportagem.jpg',
        alt: 'Equipe durante a apuração',
        caption: 'Registro feito durante a reportagem',
        credit: 'Foto: Diário do Povo',
        width: 1200,
        height: 800
      }
    }
  ]
}

describe('conteúdo editorial estruturado', () => {
  it('valida e renderiza blocos visuais como HTML seguro', () => {
    const html = renderEditorialDocumentToHtml(visualDocument)

    expect(html).toContain('<h2>Contexto da notícia</h2>')
    expect(html).toContain('<strong>apurado</strong>')
    expect(html).toContain('class="article-inline-image"')
    expect(html).toContain('class="photo-credit"')
    expect(html).toContain('src="/i/fotos/reportagem.jpg"')
    expect(editorialDocumentHasText(visualDocument)).toBe(true)
  })

  it('escapa texto e descarta links perigosos', () => {
    const html = renderEditorialDocumentToHtml({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{
          type: 'text',
          text: '<script>alert(1)</script>',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]
        }]
      }]
    })

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<a ')
  })

  it('rejeita imagens externas sem HTTPS e blocos desconhecidos', () => {
    expect(() => parseEditorialDocument({
      type: 'doc',
      content: [{ type: 'editorialImage', attrs: { src: 'http://example.com/photo.jpg' } }]
    })).toThrow('URL inválida')

    expect(() => parseEditorialDocument({
      type: 'doc',
      content: [{ type: 'iframe', attrs: { src: 'https://example.com' } }]
    })).toThrow('Bloco editorial não permitido')
  })

  it('considera vazio um documento sem texto nem imagem', () => {
    expect(editorialDocumentHasText({
      type: 'doc',
      content: [{ type: 'paragraph' }]
    })).toBe(false)
  })
})
