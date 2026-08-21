import { describe, expect, it } from 'vitest'
import { renderInstagramArtwork, stripArticleText } from '../../packages/core/instagram'
import type { InstagramPublication } from '../../packages/core/instagram'

function publication(overrides: Partial<InstagramPublication> = {}): InstagramPublication {
  return {
    id: 1,
    post_id: 10,
    status: 'draft',
    format: 'feed_4x5',
    template: 'editorial_overlay',
    hat: 'Brasil',
    title: 'Uma manchete importante para o leitor',
    subtitle: 'Informação contextual sem repetir o título principal.',
    photo_credit: 'Agência Teste',
    caption: null,
    hashtags: null,
    alt_text: null,
    render_token: 'a'.repeat(48),
    output_image_url: null,
    image_position_x: 50,
    image_position_y: 50,
    scheduled_at: null,
    n8n_execution_id: null,
    meta_container_id: null,
    meta_media_id: null,
    permalink: null,
    last_error: null,
    version: 1,
    created_by_user_id: 1,
    approved_by_user_id: null,
    approved_at: null,
    published_at: null,
    created_at: '2026-08-19T12:00:00.000Z',
    updated_at: '2026-08-19T12:00:00.000Z',
    slug: 'uma-manchete-importante',
    article_title: 'Uma manchete importante para o leitor',
    article_excerpt: null,
    article_content: '<p>Conteúdo</p>',
    article_content_markdown: null,
    article_published_at: '2026-08-19T12:00:00.000Z',
    article_created_at: '2026-08-19T11:00:00.000Z',
    category_name: 'Brasil',
    author_name: 'Redação',
    cover_media_url: 'media/capa.jpg',
    cover_alt: null,
    cover_credits: 'Agência Teste',
    created_by_name: 'Diretor',
    approved_by_name: null,
    ...overrides
  }
}

describe('Instagram editorial artwork', () => {
  it('renders a fixed 1080x1350 branded composition', () => {
    const html = renderInstagramArtwork(publication(), 'https://diario.dopovo.com.br')
    expect(html).toContain('width:1080px;height:1350px')
    expect(html).toContain('/static/logo-dp.png')
    expect(html).toContain('alt="Diário do Povo"')
    expect(html).toContain('Uma manchete importante')
    expect(html).toContain('/i/media/capa.jpg?w=1080&amp;h=1350&amp;q=92&amp;fp-x=0.5&amp;fp-y=0.5')
    expect(html).toContain('Foto: Agência Teste')
    expect(html).toContain('JORNALDIARIODOPOVO.COM.BR')
  })

  it('aplica o ponto focal salvo ao recorte entregue pelo Cloudflare', () => {
    const html = renderInstagramArtwork(publication({ image_position_x: 20, image_position_y: 80 }), 'https://diario.dopovo.com.br')
    expect(html).toContain('fp-x=0.2&amp;fp-y=0.8')
  })

  it('escapes editorial input instead of injecting markup', () => {
    const html = renderInstagramArtwork(publication({ title: '<script>alert(1)</script>' }), 'https://example.com')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('converts the article body into compact text for the AI payload', () => {
    expect(stripArticleText('<h2>Título</h2><p>Texto &amp; contexto.</p>')).toBe('Título Texto & contexto.')
  })
})
