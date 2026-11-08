import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArticlePost } from '../../packages/core/db/article'
import { getSetting } from '../../packages/core/db'
import { renderArticlePage } from '../../packages/core/web/article'

// Only external data is stubbed: the article, layouts and social renderers run unchanged.
vi.mock('../../packages/core/db', () => ({ getSetting: vi.fn(), findLiveUpdates: vi.fn(async () => []) }))
vi.mock('../../packages/core/db/categories-cache', () => ({ getActiveCategories: vi.fn(async () => []) }))
vi.mock('../../packages/core/ads', () => ({
  findActiveSlotsByTemplate: vi.fn(async () => []),
  generateAdsLoaderScript: vi.fn(async () => ''),
  renderAdSlot: vi.fn(() => '')
}))

function article(overrides: Partial<ArticlePost> = {}): ArticlePost {
  return {
    id: 42, slug: 'saude-em-teresina', title: 'Manchete editorial preservada', hat: 'Saúde',
    excerpt: 'Resumo editorial preservado.', content: '<p>Corpo editorial preservado.</p>',
    content_markdown: null, published_at: '2026-11-05T12:00:00Z', updated_at: '2026-11-05T13:00:00Z',
    featured_image_r2_key: null, featured_image_credits: null, featured_image_alt: null,
    seo_title: null, seo_description: null, seo_noindex: 0, seo_canonical: null,
    social_title: null, social_description: null, social_share_text: null, social_image_r2_key: null,
    social_image_mime_type: null, social_image_width: null, social_image_height: null,
    social_image_position_x: 50, social_image_position_y: 50,
    category_id: 2, category_name: 'Saúde', category_slug: 'saude', is_premium: 0, is_live: 0,
    ...overrides
  }
}

async function render(post: ArticlePost): Promise<string> {
  const context = { env: {}, get: () => 'nonce', req: { path: '/2026/11/05/saude-em-teresina', header: () => undefined } }
  return renderArticlePage(context as any, post, {
    baseUrl: 'https://diario.dopovo.com.br', siteName: 'Diário do Povo',
    navItems: [], relatedPosts: [], mostRead: [], isBlocked: false
  })
}

function head(html: string): string {
  const result = html.match(/<head>([\s\S]*?)<\/head>/)?.[1]
  expect(result).toBeDefined()
  return result!
}

function expectSingleMeta(html: string, attribute: 'name' | 'property', name: string, content: string) {
  const tags = head(html).match(new RegExp(`<meta ${attribute}="${name}" content="[^"]*">`, 'g'))
  expect(tags).toEqual([`<meta ${attribute}="${name}" content="${content}">`])
}

describe.each(['editorial', 'alltype'] as const)('SEO público no tema %s', theme => {
  beforeEach(() => {
    vi.mocked(getSetting).mockResolvedValue(theme)
  })

  it('prioriza SEO próprio sem alterar manchete e corpo e usa SEO como alternativa social', async () => {
    const html = await render(article({ seo_title: 'Título de busca específico', seo_description: 'Descrição de busca específica.' }))
    expect(head(html)).toContain('<title>Título de busca específico | Diário do Povo</title>')
    expectSingleMeta(html, 'name', 'description', 'Descrição de busca específica.')
    expectSingleMeta(html, 'property', 'og:title', 'Título de busca específico | Diário do Povo')
    expectSingleMeta(html, 'property', 'og:description', 'Descrição de busca específica.')
    expectSingleMeta(html, 'name', 'twitter:title', 'Título de busca específico | Diário do Povo')
    expect(html).toMatch(/<h1\b[^>]*>\s*Manchete editorial preservada\s*<\/h1>/)
    expect(html).toContain('<p>Corpo editorial preservado.</p>')
    expect(html).not.toMatch(/<meta\b[^>]*\bname\s*=\s*["']keywords["']/i)
    expect(html).toContain(theme === 'editorial' ? 'class="ed-article"' : 'class="theme-alltype"')
  })

  it.each([null, ''])('usa manchete e resumo quando os campos SEO estão %s', async empty => {
    const html = await render(article({ seo_title: empty, seo_description: empty }))
    expect(head(html)).toContain('<title>Manchete editorial preservada | Diário do Povo</title>')
    expectSingleMeta(html, 'name', 'description', 'Resumo editorial preservado.')
    expectSingleMeta(html, 'property', 'og:title', 'Manchete editorial preservada | Diário do Povo')
    expectSingleMeta(html, 'property', 'og:description', 'Resumo editorial preservado.')
  })

  it('usa a manchete como descrição se SEO e resumo estiverem vazios', async () => {
    const html = await render(article({ seo_title: '', seo_description: '', excerpt: '' }))
    expectSingleMeta(html, 'name', 'description', 'Manchete editorial preservada')
    expectSingleMeta(html, 'property', 'og:description', 'Manchete editorial preservada')
  })

  it('escapa caracteres especiais no título e nas descrições sem criar novos atributos', async () => {
    const text = `Saúde & vagas "abertas" <Piauí> '2026'`
    const escaped = 'Saúde &amp; vagas &quot;abertas&quot; &lt;Piauí&gt; &#039;2026&#039;'
    const html = await render(article({ seo_title: text, seo_description: `${text} > confira.` }))
    expect(head(html)).toContain(`<title>${escaped} | Diário do Povo</title>`)
    expectSingleMeta(html, 'name', 'description', `${escaped} &gt; confira.`)
    expectSingleMeta(html, 'property', 'og:title', `${escaped} | Diário do Povo`)
    expectSingleMeta(html, 'property', 'og:description', `${escaped} &gt; confira.`)
    expect(head(html)).not.toContain('<Piauí>')
  })

  it('preserva título, descrição e imagem sociais explícitos durante a aplicação de SEO', async () => {
    const html = await render(article({
      seo_title: 'Título para a busca', seo_description: 'Descrição para a busca.',
      social_title: 'Título específico das redes', social_description: 'Descrição específica das redes.',
      social_image_r2_key: 'social/posts/42/card.jpg', social_image_mime_type: 'image/jpeg',
      social_image_width: 1200, social_image_height: 630
    }))
    expect(head(html)).toContain('<title>Título para a busca | Diário do Povo</title>')
    expectSingleMeta(html, 'name', 'description', 'Descrição para a busca.')
    expectSingleMeta(html, 'property', 'og:title', 'Título específico das redes | Diário do Povo')
    expectSingleMeta(html, 'property', 'og:description', 'Descrição específica das redes.')
    expectSingleMeta(html, 'name', 'twitter:title', 'Título específico das redes | Diário do Povo')
    expectSingleMeta(html, 'name', 'twitter:description', 'Descrição específica das redes.')
    expectSingleMeta(html, 'property', 'og:image', 'https://diario.dopovo.com.br/i/social/posts/42/card.jpg')
    expect(html).not.toMatch(/<meta\b[^>]*\bname\s*=\s*["']keywords["']/i)
  })
})
