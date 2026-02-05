/**
 * Latest News Page Rendering Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { renderUltimasPage } from '../../packages/core/web/ultimas'

// Mock Hono Context
const mockContext = {
    get: vi.fn().mockReturnValue('mock-nonce'),
    env: {
        DB: {
            prepare: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [] })
        }
    }
} as any

// Mock getActiveCategories
vi.mock('../../packages/core/db/categories-cache', () => ({
    getActiveCategories: vi.fn().mockResolvedValue([])
}))

describe('renderUltimasPage', () => {
    it('should render the timeline group headers', async () => {
        const posts = [
            {
                id: 1,
                slug: 'post-1',
                title: 'Post Agora',
                published_at: new Date().toISOString(),
                category_name: 'Brasil',
                category_slug: 'brasil'
            }
        ]

        const html = await renderUltimasPage(mockContext, posts, {
            baseUrl: 'https://test.com',
            siteName: 'Test Site',
            page: 1,
            limit: 30
        })

        expect(html).toContain('Agora')
        expect(html).toContain('Post Agora')
        expect(html).toContain('Brasil')
        expect(html).toContain('pulse-live') // Recent post should have live pulse
    })

    it('should render multiple time groups', async () => {
        const now = new Date()
        const yesterday = new Date(now)
        yesterday.setDate(yesterday.getDate() - 1)

        const posts = [
            {
                id: 1,
                slug: 'post-today',
                title: 'Post de Hoje',
                published_at: now.toISOString(),
                category_name: 'Brasil',
                category_slug: 'brasil'
            },
            {
                id: 2,
                slug: 'post-yesterday',
                title: 'Post de Ontem',
                published_at: yesterday.toISOString(),
                category_name: 'Mundo',
                category_slug: 'mundo'
            }
        ]

        const html = await renderUltimasPage(mockContext, posts, {
            baseUrl: 'https://test.com',
            siteName: 'Test Site',
            page: 1,
            limit: 30
        })

        expect(html).toContain('Agora')
        expect(html).toContain('Ontem')
        expect(html).toContain('Post de Hoje')
        expect(html).toContain('Post de Ontem')
    })

    it('should include pagination links', async () => {
        const posts = Array(30).fill({
            id: 1,
            slug: 'post',
            title: 'Post',
            published_at: new Date().toISOString(),
            category_name: 'Brasil',
            category_slug: 'brasil'
        })

        const html = await renderUltimasPage(mockContext, posts, {
            baseUrl: 'https://test.com',
            siteName: 'Test Site',
            page: 2,
            limit: 30
        })

        expect(html).toContain('href="/ultimas?page=1"')
        expect(html).toContain('href="/ultimas?page=3"')
    })

    it('should render in minimalist theme when requested', async () => {
        const posts = [
            {
                id: 1,
                slug: 'post-1',
                title: 'Post Minimal',
                published_at: new Date().toISOString(),
                category_name: 'Tech',
                category_slug: 'tech'
            }
        ]

        const html = await renderUltimasPage(mockContext, posts, {
            baseUrl: 'https://test.com',
            siteName: 'Test Site',
            page: 1,
            limit: 30,
            theme: 'minimal'
        })

        // Check for minimalist-specific classes/elements
        expect(html).toContain('gb-container')
        expect(html).toContain('timeline-minimal')
        expect(html).toContain('AO VIVO') // Live tag in minimal theme
        expect(html).toContain('minimal.css') // Should load minimal.css
        expect(html).not.toContain('styles.css') // Should NOT load styles.css
    })
})
