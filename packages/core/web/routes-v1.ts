import { Hono } from 'hono'
import type { Env, AppContext } from '../types'
import { getPostUrl } from '../utils/post'

// Static Imports for performance
import { findArticleBySlug, findRelatedPosts } from '../db/article'
import { getHomeSections, getHomeData } from '../db/home'
import { renderArticlePage } from './article'
import { checkPostAccess } from '../paywall'
import { getReaderContext } from '../paywall/helpers'
import { getSetting, getSettings, logAudit, getMediaById, findTagBySlug } from '../db'
import { renderHomePage } from './home'
import { renderUltimasPage } from './ultimas'
import { getCategoryPageData } from '../db/category'
import { renderCategoryPage } from './category'

const app = new Hono<{ Bindings: Env; Variables: AppContext }>()

// ============================================================================
// V1 Public Routes (Google Blog Style)
// ============================================================================

// GET / - Home Page
app.get('/', async (c) => {
    // Parallel fetch: Reader context, Home data, Settings
    const [
        readerContext,
        data,
        settings
    ] = await Promise.all([
        getReaderContext(c as any),
        getHomeData(c.env),
        getSettings(c.env, ['google_analytics_id', 'site_name', 'daily_cover'], 'public')
    ])

    const siteName = (settings['site_name'] as string) || 'Jornal Diário do Povo'
    const googleAnalyticsId = settings['google_analytics_id'] as string
    const dailyCover = settings['daily_cover'] as { media_id: number } | null

    let coverR2Key = ''
    let coverAlt = 'Capa do Dia'
    let coverAspectRatio = '3/4'

    if (dailyCover?.media_id) {
        const media = await getMediaById(c.env, dailyCover.media_id)
        if (media) {
            coverR2Key = media.r2_key
            coverAlt = media.alt || media.filename
            if (media.width && media.height) {
                coverAspectRatio = `${media.width}/${media.height}`
            }
        }
    }

    let baseUrl = c.env.PUBLIC_BASE_URL || 'https://diario.dopovo.com.br'
    if (baseUrl.includes('.pages.dev')) baseUrl = 'https://diario.dopovo.com.br'

    // Render home page (Verge style)
    const html = await renderHomePage(c, data, {
        baseUrl,
        siteName,
        coverR2Key,
        coverAlt,
        coverAspectRatio,
        subscriber: readerContext.subscriber,
        googleAnalyticsId: googleAnalyticsId
    })

    // Cache Control (CDN + Browser)
    const headers = {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
        'Content-Type': 'text/html; charset=UTF-8'
    }

    return c.body(html, 200, headers)
})

// GET /ultimas - Latest Posts
app.get('/ultimas', async (c) => {
    const [settings, readerContext] = await Promise.all([
        getSettings(c.env, ['google_analytics_id', 'site_name', 'public_theme'], 'public'),
        getReaderContext(c as any)
    ])
    const siteName = (settings['site_name'] as string) || 'Jornal Diário do Povo'
    const googleAnalyticsId = settings['google_analytics_id'] as string
    // Determine Theme (Minimalist Google Style is the only native theme)
    const theme = 'minimal'

    const page = parseInt(c.req.query('page') || '1')
    const limit = 30
    const offset = (page - 1) * limit

    const posts = await c.env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.published_at, p.excerpt,
      c.name as category_name, c.slug as category_slug
    FROM posts p
    INNER JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'published' 
      AND p.published_at <= ?
      AND p.seo_noindex = 0
    ORDER BY p.published_at DESC
    LIMIT ? OFFSET ?
  `).bind(new Date().toISOString(), limit, offset).all()

    let baseUrl = c.env.PUBLIC_BASE_URL || 'https://diario.dopovo.com.br'
    if (baseUrl.includes('.pages.dev')) baseUrl = 'https://diario.dopovo.com.br'

    const html = await renderUltimasPage(c, posts.results as any[], {
        baseUrl,
        siteName,
        page,
        limit,
        subscriber: readerContext.subscriber,
        theme: theme as 'default' | 'minimal',
        googleAnalyticsId
    })

    return c.html(html)
})

// GET /categoria/:slug - Category Page
app.get('/categoria/:slug', async (c) => {
    const slug = c.req.param('slug')
    const page = parseInt(c.req.query('page') || '1', 10)

    const [readerContext, data, settings] = await Promise.all([
        getReaderContext(c as any),
        getCategoryPageData(c.env, slug, page, 20),
        getSettings(c.env, ['google_analytics_id', 'site_name', 'daily_cover'], 'public')
    ])

    if (!data) {
        return c.notFound()
    }

    const siteName = (settings['site_name'] as string) || 'Jornal Diário do Povo'
    const googleAnalyticsId = settings['google_analytics_id'] as string
    const dailyCover = settings['daily_cover'] as { media_id: number } | null

    let coverR2Key = ''
    let coverAlt = 'Capa do Dia'
    let coverAspectRatio = '3/4'

    if (dailyCover?.media_id) {
        const media = await getMediaById(c.env, dailyCover.media_id)
        if (media) {
            coverR2Key = media.r2_key
            coverAlt = media.alt || media.filename
            if (media.width && media.height) {
                coverAspectRatio = `${media.width}/${media.height}`
            }
        }
    }

    let baseUrl = c.env.PUBLIC_BASE_URL || 'https://diario.dopovo.com.br'
    if (baseUrl.includes('.pages.dev')) baseUrl = 'https://diario.dopovo.com.br'

    // Get nav sections
    const sections = await getHomeSections(c.env)
    const navItems = sections
        .filter(s => s.enabled)
        .map(s => ({
            label: s.title,
            href: s.type === 'tag' ? `/tag/${s.tagSlug}` : `/categoria/${s.slug}`,
            active: s.slug === slug
        }))

    // Render category page
    const html = await renderCategoryPage(c, data, {
        baseUrl,
        siteName,
        navItems,
        coverOfDay: coverR2Key ? { r2Key: coverR2Key, alt: coverAlt, aspectRatio: coverAspectRatio } : null,
        subscriber: readerContext.subscriber,
        googleAnalyticsId
    })

    if (!html) {
        console.error(`[CRITICAL] renderCategoryPage returned empty string for slug: ${slug}`)
        return c.text('Erro Interno: Falha ao renderizar a página.', 500)
    }

    return c.html(html)
})

// GET /tag/:slug - Tag Page (Simplified)
app.get('/tag/:slug', async (c) => {
    try {
        const slug = c.req.param('slug')
        const tag = await findTagBySlug(c.env, slug)
        if (!tag) {
            return c.notFound()
        }

        const [settings, posts] = await Promise.all([
            getSettings(c.env, ['site_name', 'google_analytics_id'], 'public'),
            c.env.DB.prepare(`
                SELECT p.* FROM posts p
                INNER JOIN posts_tags pt ON pt.post_id = p.id
                WHERE pt.tag_id = ? AND p.status = 'published'
                ORDER BY p.published_at DESC
                LIMIT 30
            `).bind(tag.id).all()
        ])

        const siteName = (settings['site_name'] as string) || 'Jornal Diário do Povo'
        const googleAnalyticsId = settings['google_analytics_id'] as string
        
        let baseUrl = c.env.PUBLIC_BASE_URL || 'https://diario.dopovo.com.br'
        if (baseUrl.includes('.pages.dev')) baseUrl = 'https://diario.dopovo.com.br'

        const nonce = c.get('cspNonce') || ''

        return c.html(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${tag.name} | ${siteName}</title>
            <meta name="description" content="${tag.description || `Notícias sobre ${tag.name}`}">
            ${tag.seo_noindex ? '<meta name="robots" content="noindex, follow">' : ''}
            <link href="/static/minimal.css" rel="stylesheet">
            ${googleAnalyticsId ? `
              <!-- Google Analytics (GA4) -->
              <script async src="https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}"></script>
              <script nonce="${nonce}">
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${googleAnalyticsId}');
              </script>
            ` : ''}
        </head>
        <body class="bg-gray-50">
            <header class="bg-white border-b">
                <div class="container mx-auto px-4 py-4">
                    <a href="/" class="text-2xl font-bold text-gray-900">${siteName}</a>
                </div>
            </header>
            
            <main class="container mx-auto px-4 py-8">
                <h1 class="text-4xl font-bold mb-8">${tag.name}</h1>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    ${(posts.results || []).map((post: any) => `
                        <article class="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition">
                            <a href="${getPostUrl(post, baseUrl)}">
                                <div class="p-4">
                                    <h2 class="text-xl font-bold mb-2 text-gray-900">${post.title}</h2>
                                    <p class="text-gray-600 text-sm">${post.excerpt || ''}</p>
                                    <span class="text-xs text-gray-400 mt-2 block">
                                        ${new Date(post.published_at || '').toLocaleDateString('pt-BR')}
                                    </span>
                                </div>
                            </a>
                        </article>
                    `).join('')}
                </div>
            </main>
        </body>
        </html>
      `)
    } catch (error: any) {
        console.error('Error rendering tag page:', error)
        return c.text(`Error: ${error.message}`, 500)
    }
})

// ============================================================================
// Shared Article Handler
// ============================================================================
const handleArticleRequest = async (c: any) => {
    const { slug } = c.req.param()
    const requestId = c.get('requestId') || 'no-id'

    try {
        // Parallel fetch primary data (post and reader)
        const [post, readerContext] = await Promise.all([
            findArticleBySlug(c.env, slug),
            getReaderContext(c)
        ])

        if (!post || post.seo_noindex) {
            return c.notFound()
        }

        // Parallel fetch all secondary data
        const [
            accessCheck,
            settings,
            sections,
            relatedPosts
        ] = await Promise.all([
            checkPostAccess(c.env, {
                id: post.id,
                slug: post.slug,
                is_premium: post.is_premium,
                template: post.template,
                paywall_tier: post.paywall_tier,
                category: { id: post.category_id, name: post.category_name, slug: post.category_slug }
            } as any, {
                isSubscriber: readerContext.isSubscriber,
                readerUserId: readerContext.readerId,
                anonIdentifier: readerContext.anonIdentifier,
                subscriber: readerContext.subscriber
            }),
            getSettings(c.env, [
                'google_analytics_id',
                'site_name',
                'cover_of_day.r2_key',
                'cover_of_day.alt',
                'cover_of_day.aspect_ratio'
            ], 'public'),
            getHomeSections(c.env),
            findRelatedPosts(c.env, post.id, post.category_id, { limit: 4 })
        ])

        const siteName = (settings['site_name'] as string) || 'Jornal Diário do Povo'
        const googleAnalyticsId = settings['google_analytics_id'] as string
        const coverR2Key = (settings['cover_of_day.r2_key'] as string) || ''
        const coverAlt = (settings['cover_of_day.alt'] as string) || 'Capa do Dia'
        const coverAspectRatio = (settings['cover_of_day.aspect_ratio'] as string) || '3/4'

        // Server-side Tracking (MVP)
        const eventLog = {
            entityType: 'article',
            entityId: post.id,
            action: accessCheck.allowed ? 'view_allowed' : 'view_blocked',
            actorType: 'user' as 'user',
            actorId: readerContext.readerId || 0,
            metadata: {
                reason: accessCheck.reason,
                paywallMode: accessCheck.paywallMode,
                slug: post.slug
            },
            requestId: c.get('requestId')
        }
        c.executionCtx.waitUntil(logAudit(c.env, eventLog))

        let baseUrl = c.env.PUBLIC_BASE_URL || 'https://diario.dopovo.com.br'
        if (baseUrl.includes('.pages.dev')) baseUrl = 'https://diario.dopovo.com.br'

        // Map nav items
        const navItems = sections
            .filter(s => s.enabled)
            .map(s => ({
                label: s.title,
                href: s.type === 'tag' ? `/tag/${s.tagSlug}` : `/categoria/${s.slug}`,
                active: false
            }))

        // Generate Content Source (Teaser vs Full)
        let contentSource = post.content_markdown || post.content || ''

        // If blocked, slice content
        if (!accessCheck.allowed) {
            const teaserLimit = 800
            contentSource = contentSource.slice(0, teaserLimit) + '...'
        }

        // Render article page
        const html = await renderArticlePage(c, post, {
            baseUrl,
            siteName,
            navItems,
            coverOfDay: coverR2Key ? { r2Key: coverR2Key, alt: coverAlt, aspectRatio: coverAspectRatio } : null,
            relatedPosts,
            mostRead: [], // Analytics disabled
            isBlocked: !accessCheck.allowed,
            accessCheck,
            googleAnalyticsId
        }, contentSource)

        if (!html) {
            console.error(`[CRITICAL] renderArticlePage returned empty string for slug: ${slug}`)
            return c.text('Erro Interno: Falha ao renderizar a página.', 500)
        }

        // Cache Control
        const headers: Record<string, string> = {
            'Content-Type': 'text/html; charset=UTF-8'
        }

        if (!accessCheck.allowed || post.is_premium) {
            headers['Cache-Control'] = 'private, no-store'
        } else {
            headers['Cache-Control'] = 'public, max-age=60, s-maxage=60'
        }

        return c.body(html, 200, headers)
    } catch (error: any) {
        console.error(`[handleArticleRequest][${requestId}] Error processing slug: ${slug}`, error)
        const showDebug = c.req.query('debug_err') === '1'
        return c.json({
            success: false,
            error: 'Erro interno do servidor',
            ...(showDebug && {
                debug: error.message,
                stack: error.stack,
                requestId
            })
        }, 500)
    }
}

// GET /noticia/:slug - Legacy/Short URL
app.get('/noticia/:slug', async (c) => {
    const slug = c.req.param('slug')
    const post = await findArticleBySlug(c.env, slug)
    if (!post) return c.notFound()
    return c.redirect(getPostUrl(post), 301)
})
app.get('/noticia/:slug/', async (c) => {
    const slug = c.req.param('slug')
    const post = await findArticleBySlug(c.env, slug)
    if (!post) return c.notFound()
    return c.redirect(getPostUrl(post), 301)
})

// GET /:year/:month/:day/:slug - Date-based URL
app.get('/:year/:month/:day/:slug', handleArticleRequest)
app.get('/:year/:month/:day/:slug/', handleArticleRequest)

export default app
