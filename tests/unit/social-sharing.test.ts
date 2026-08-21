import { describe, expect, it } from 'vitest'
import type { Post } from '../../packages/core/db/posts'
import type { ArticlePost } from '../../packages/core/db/article'
import { renderSocialSharingPanel } from '../../packages/core/admin/social-sharing'
import { buildArticleSocialMeta } from '../../packages/core/web/article'
import { renderEditorialLayout } from '../../packages/core/web/layout-editorial'
import {
  buildArticleShareMessage,
  buildTrackedShareUrl,
  renderSocialMetaTags
} from '../../packages/core/web/social'

function article(overrides: Partial<ArticlePost> = {}): ArticlePost {
  return {
    id: 42,
    slug: 'materia-de-teste',
    title: 'Cidade anuncia novo programa de mobilidade',
    hat: 'Cidades',
    excerpt: 'Projeto começa neste mês e terá implantação gradual.',
    content: '<p>Conteúdo</p>',
    content_markdown: null,
    published_at: '2026-08-21T12:00:00.000Z',
    updated_at: '2026-08-21T13:00:00.000Z',
    featured_image_r2_key: 'media/capa.jpg',
    featured_image_credits: 'Agência Brasil',
    featured_image_alt: 'Ônibus em avenida da cidade',
    featured_image_width: 1600,
    featured_image_height: 900,
    featured_image_mime_type: 'image/jpeg',
    seo_title: null,
    seo_description: null,
    seo_noindex: 0,
    seo_canonical: null,
    social_title: null,
    social_description: null,
    social_share_text: null,
    social_image_r2_key: null,
    social_image_mime_type: null,
    social_image_width: null,
    social_image_height: null,
    social_image_position_x: 50,
    social_image_position_y: 50,
    category_id: 2,
    category_name: 'Cidades',
    category_slug: 'cidades',
    is_premium: 0,
    is_live: 0,
    ...overrides
  }
}

describe('Open Graph editorial', () => {
  it('gera um conjunto único, completo e identificado com a marca', () => {
    const meta = buildArticleSocialMeta(
      article(),
      'https://diario.dopovo.com.br',
      'Jornal',
      'https://diario.dopovo.com.br/2026/08/21/materia-de-teste'
    )
    const html = renderSocialMetaTags(meta)

    expect(meta.title).toBe('Cidade anuncia novo programa de mobilidade | Diário do Povo')
    expect(meta.siteName).toBe('Diário do Povo')
    expect(meta.image?.url).toContain('?w=1200&h=630&fit=cover&q=90')
    expect(html.match(/property="og:title"/g)).toHaveLength(1)
    expect(html).toContain('property="og:image:width" content="1200"')
    expect(html).toContain('property="og:image:height" content="630"')
    expect(html).toContain('property="article:modified_time"')
    expect(html).toContain('name="twitter:image"')
  })

  it('prioriza a arte social gerada no CMS', () => {
    const meta = buildArticleSocialMeta(article({
      social_title: 'Título específico para redes',
      social_description: 'Resumo específico para redes.',
      social_image_r2_key: 'social/posts/42/card.jpg',
      social_image_mime_type: 'image/jpeg',
      social_image_width: 1200,
      social_image_height: 630
    }), 'https://diario.dopovo.com.br', 'Diário do Povo', 'https://diario.dopovo.com.br/materia')

    expect(meta.title).toBe('Título específico para redes | Diário do Povo')
    expect(meta.description).toBe('Resumo específico para redes.')
    expect(meta.image?.url).toBe('https://diario.dopovo.com.br/i/social/posts/42/card.jpg')
    expect(meta.image?.type).toBe('image/jpeg')
  })

  it('não duplica metadados quando o layout recebe dados da matéria', () => {
    const openGraph = buildArticleSocialMeta(article(), 'https://diario.dopovo.com.br', 'Diário do Povo', 'https://diario.dopovo.com.br/materia')
    const html = renderEditorialLayout({
      title: 'Matéria | Diário do Povo',
      description: 'Descrição',
      canonicalUrl: 'https://diario.dopovo.com.br/materia',
      baseUrl: 'https://diario.dopovo.com.br',
      siteName: 'Diário do Povo',
      nonce: 'nonce',
      navItems: [],
      bodyHtml: '<article>Conteúdo</article>',
      openGraph
    })

    expect(html.match(/property="og:type"/g)).toHaveLength(1)
    expect(html.match(/property="og:title"/g)).toHaveLength(1)
    expect(html.match(/property="og:image"/g)).toHaveLength(1)
    expect(html).toContain('content="article"')
  })
})

describe('Compartilhamento editorial', () => {
  it('monta convite profissional e preserva o link rastreável', () => {
    const url = buildTrackedShareUrl('https://diario.dopovo.com.br/materia', 'whatsapp')
    const message = buildArticleShareMessage({
      title: 'Título da notícia',
      description: 'Resumo da notícia.',
      siteName: 'Diário do Povo',
      url
    })

    expect(url).toContain('utm_source=whatsapp')
    expect(url).toContain('utm_medium=share')
    expect(message).toContain('*Título da notícia*')
    expect(message).toContain('Leia a matéria completa no Diário do Povo:')
    expect(message).toContain(url)
  })

  it('aceita texto editorial com variáveis', () => {
    const message = buildArticleShareMessage({
      title: 'Título',
      description: 'Resumo',
      siteName: 'Diário do Povo',
      url: 'https://diario.dopovo.com.br/materia',
      template: '{{title}} — {{summary}}\nLeia no {{journal}}: {{url}}'
    })

    expect(message).toBe('Título — Resumo\nLeia no Diário do Povo: https://diario.dopovo.com.br/materia')
  })

  it('renderiza o painel do CMS e o gerador de 1200 por 630', () => {
    const post = {
      id: 42,
      slug: 'materia-de-teste',
      title: 'Título',
      hat: 'Cidades',
      excerpt: 'Resumo',
      cover_media_url: 'media/capa.jpg',
      cover_media_credits: 'Agência Brasil',
      social_image_position_x: 50,
      social_image_position_y: 50
    } as Post
    const html = renderSocialSharingPanel({ post, csrfToken: 'csrf-token', cspNonce: 'nonce' })

    expect(html).toContain('WhatsApp e redes sociais')
    expect(html).toContain('name="social_title"')
    expect(html).toContain('name="social_share_text"')
    expect(html).toContain('Gerar arte 1200 × 630')
    expect(html).toContain('/api/admin/posts/\' + postId + \'/social-card')
    expect(html).toContain('Foto: \' + coverCredit')
  })
})
