import { Hono } from 'hono'
import type { Env, AppContext } from '../types'
import { getPostUrl } from '../utils/post'

const app = new Hono<{ Bindings: Env; Variables: AppContext }>()

// ============================================================================
// V1 Public Routes (Google Blog Style)
// ============================================================================

// GET / - Home Page
app.get('/', async (c) => {
    const { getHomeData } = await import('../db/home')
    const { renderHomePage } = await import('./home')
    const { getSetting, getMediaById } = await import('../db')
    const { getReaderContext } = await import('../paywall/helpers')

    // Get reader context
    const readerContext = await getReaderContext(c as any)

    // Get home data (optimized queries)
    const data = await getHomeData(c.env)

    // Get CMS settings
    const siteName = (await getSetting(c.env, 'site_name', 'public') as string) || 'Jornal'

    // Daily Cover
    const dailyCover = await getSetting(c.env, 'daily_cover') as { media_id: number } | null
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

    const baseUrl = c.env.PUBLIC_BASE_URL || 'https://example.com'

    // Render home page (Verge style)
    const html = await renderHomePage(c, data, {
        baseUrl,
        siteName,
        coverR2Key,
        coverAlt,
        coverAspectRatio,
        subscriber: readerContext.subscriber
    })

    return c.html(html)
})

// GET /ultimas - Latest Posts
app.get('/ultimas', async (c) => {
    const { getSetting } = await import('../db')
    const { renderUltimasPage } = await import('./ultimas')
    const { getReaderContext } = await import('../paywall/helpers')

    const siteName = (await getSetting(c.env, 'site_name', 'public') as string) || 'Jornal'
    const readerContext = await getReaderContext(c as any)

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
      AND p.published_at <= datetime('now')
      AND p.seo_noindex = 0
    ORDER BY p.published_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all()

    const baseUrl = c.env.PUBLIC_BASE_URL || 'https://example.com'

    // Determine Theme
    const themeSetting = await getSetting(c.env, 'public_theme')
    const theme = (themeSetting === 'minimal' || themeSetting === '"minimal"') ? 'minimal' : 'default'

    const html = await renderUltimasPage(c, posts.results as any[], {
        baseUrl,
        siteName,
        page,
        limit,
        subscriber: readerContext.subscriber,
        theme: theme as 'default' | 'minimal'
    })

    return c.html(html)
})

// GET /categoria/:slug - Category Page
app.get('/categoria/:slug', async (c) => {
    const slug = c.req.param('slug')
    const page = parseInt(c.req.query('page') || '1', 10)

    const { getCategoryPageData } = await import('../db/category')
    const { getHomeSections } = await import('../db/home')
    const { renderCategoryPage } = await import('./category')
    const { getSetting, getMediaById } = await import('../db')
    const { getReaderContext } = await import('../paywall/helpers')

    // Get reader context
    const readerContext = await getReaderContext(c as any)

    // Get category data with pagination
    const data = await getCategoryPageData(c.env, slug, page, 20)
    if (!data) {
        return c.notFound()
    }

    // Get CMS settings
    const siteName = (await getSetting(c.env, 'site_name', 'public') as string) || 'Jornal'

    // Daily Cover
    const dailyCover = await getSetting(c.env, 'daily_cover') as { media_id: number } | null
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

    const baseUrl = c.env.PUBLIC_BASE_URL || 'https://example.com'

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
        subscriber: readerContext.subscriber
    })

    if (!html) {
        console.error(`[CRITICAL] renderCategoryPage returned empty string for slug: ${slug}`)
        return c.text('Erro Interno: Falha ao renderizar a página.', 500)
    }

    return c.html(html)
})

// GET /tag/:slug - Tag Page (Simplified)
app.get('/tag/:slug', async (c) => {
    const slug = c.req.param('slug')
    const { findTagBySlug, getSetting } = await import('../db')

    const tag = await findTagBySlug(c.env, slug)
    if (!tag) {
        return c.notFound()
    }

    // Get posts by tag
    const posts = await c.env.DB.prepare(`
    SELECT p.* FROM posts p
    INNER JOIN post_tags pt ON pt.post_id = p.id
    WHERE pt.tag_id = ? AND p.status = 'published'
    ORDER BY p.published_at DESC
    LIMIT 30
  `).bind(tag.id).all()

    const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
    const baseUrl = c.env.PUBLIC_BASE_URL || 'https://example.com'

    return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${tag.name} | ${siteName}</title>
        <meta name="description" content="${tag.description || `Notícias sobre ${tag.name}`}">
        ${tag.seo_noindex ? '<meta name="robots" content="noindex, follow">' : ''}
        <link href="/static/styles.css" rel="stylesheet">
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
})


// ============================================================================
// Shared Article Handler
// ============================================================================
// ============================================================================
// Shared Article Handler
// ============================================================================
const handleArticleRequest = async (c: any) => {
    const { slug } = c.req.param()

    // Dynamic imports
    const { findArticleBySlug, findRelatedPosts, findMostRead, incrementPostViews } = await import('../db/article')
    const { getHomeSections } = await import('../db/home')
    const { renderArticlePage } = await import('./article')
    const { checkPostAccess } = await import('../paywall')
    const { getReaderContext } = await import('../paywall/helpers')
    const { getSetting } = await import('../db')
    const { logAudit } = await import('../db') // Using audit for event logging MVP

    // Find post
    const post = await findArticleBySlug(c.env, slug)

    if (!post || post.seo_noindex) {
        return c.notFound()
    }

    // Increment views (fire and forget)
    c.executionCtx.waitUntil(incrementPostViews(c.env, post.id))

    // Get reader context
    const readerContext = await getReaderContext(c)

    // Check access
    const postForPaywall = {
        id: post.id,
        slug: post.slug,
        is_premium: post.is_premium,
        template: post.template,
        paywall_tier: (post as any).paywall_tier,
        category: { id: post.category_id, name: post.category_name, slug: post.category_slug }
    }

    const accessCheck = await checkPostAccess(c.env, postForPaywall as any, {
        isSubscriber: readerContext.isSubscriber,
        readerUserId: readerContext.readerId,
        anonIdentifier: readerContext.anonIdentifier,
        subscriber: readerContext.subscriber
    })

    // Server-side Tracking (MVP)
    const eventLog = {
        entityType: 'article',
        entityId: post.id,
        action: accessCheck.allowed ? 'view_allowed' : 'view_blocked',
        actorType: 'user' as 'user', // Explicit cast to satisfy union type
        actorId: readerContext.readerId || 0,
        metadata: {
            reason: accessCheck.reason,
            paywallMode: accessCheck.paywallMode,
            slug: post.slug
        },
        requestId: c.get('requestId')
    }
    // Fire and forget logging
    c.executionCtx.waitUntil(logAudit(c.env, eventLog))


    // Get CMS settings
    const siteName = (await getSetting(c.env, 'site_name', 'public') as string) || 'Jornal'
    const coverR2Key = (await getSetting(c.env, 'cover_of_day.r2_key', 'public') as string) || ''
    const coverAlt = (await getSetting(c.env, 'cover_of_day.alt', 'public') as string) || 'Capa do Dia'
    const coverAspectRatio = (await getSetting(c.env, 'cover_of_day.aspect_ratio', 'public') as string) || '3/4'

    const baseUrl = c.env.PUBLIC_BASE_URL || 'https://example.com'

    // Get nav sections
    const sections = await getHomeSections(c.env)
    const navItems = sections
        .filter(s => s.enabled)
        .map(s => ({
            label: s.title,
            href: s.type === 'tag' ? `/tag/${s.tagSlug}` : `/categoria/${s.slug}`,
            active: false
        }))

    // Get related posts and most read
    const relatedPosts = await findRelatedPosts(c.env, post.id, post.category_id, { limit: 4 })
    const mostRead = await findMostRead(c.env, { limit: 6 })

    // Generate Content Source (Teaser vs Full)
    let contentSource = post.content_markdown || post.content || ''

    // If blocked, slice content
    if (!accessCheck.allowed) {
        // Simple teaser logic: first 2 paragraphs or N chars
        const teaserLimit = 800
        contentSource = contentSource.slice(0, teaserLimit) + '...'
        // TODO: Enhance slicing to respect markdown block boundaries if needed
    }

    // Render article page
    const html = await renderArticlePage(c, post, {
        baseUrl,
        siteName,
        navItems,
        coverOfDay: coverR2Key ? { r2Key: coverR2Key, alt: coverAlt, aspectRatio: coverAspectRatio } : null,
        relatedPosts,
        mostRead,
        isBlocked: !accessCheck.allowed,
        accessCheck // Pass rich object for UI rendering
    }, contentSource) // Pass modified content source to renderer

    if (!html) {
        console.error(`[CRITICAL] renderArticlePage returned empty string for slug: ${slug}`)
        return c.text('Erro Interno: Falha ao renderizar a página.', 500)
    }

    // Cache Control
    const headers: Record<string, string> = {
        'Content-Type': 'text/html; charset=UTF-8'
    }

    if (!accessCheck.allowed) {
        // Blocked content (teaser) can be cached carefully OR no-stored if dynamic
        // Since it depends on login state, safer to use private or no-store
        headers['Cache-Control'] = 'private, no-store'
    } else if (post.is_premium) {
        // Premium allowed content MUST NOT be cached publicly
        headers['Cache-Control'] = 'private, no-store'
    } else {
        // Free content can be cached
        headers['Cache-Control'] = 'public, max-age=60, s-maxage=60'
    }

    return c.body(html, 200, headers)
}

// GET /noticia/:slug - Legacy/Short URL
app.get('/noticia/:slug', async (c) => {
    const slug = c.req.param('slug')
    const { findArticleBySlug } = await import('../db/article')
    const post = await findArticleBySlug(c.env, slug)
    if (!post) return c.notFound()
    return c.redirect(getPostUrl(post), 301)
})

// GET /:year/:month/:day/:slug - Date-based URL (Google News preferred)
app.get('/:year/:month/:day/:slug', handleArticleRequest)
app.get('/:year/:month/:day/:slug/', handleArticleRequest)

export default app

