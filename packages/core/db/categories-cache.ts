/**
 * Categories Cache - Cloudflare Workers Optimized
 * 
 * Fetches active categories with caching to avoid hitting D1 on every request.
 * Uses Cloudflare's native caches.default with 10-minute TTL.
 */

import type { Env, Category } from '../types'

/**
 * Fetch all active categories with caching
 * 
 * @param env - Cloudflare environment bindings
 * @returns Array of active categories, ordered by display_order
 */
export async function getActiveCategories(env: Env): Promise<Category[]> {
    // Standardized cache key URL
    const cacheKey = new Request('https://cache.internal/api/categories/active')
    const cache = caches.default

    try {
        // Try cache first
        const cached = await cache.match(cacheKey)
        if (cached) {
            return cached.json()
        }

        // Fetch from D1
        const result = await env.DB.prepare(`
      SELECT id, name, slug, display_order, description, is_active, parent_id, seo_title, seo_description, created_at, updated_at
      FROM categories
      WHERE is_active = 1
      ORDER BY display_order ASC, name ASC
    `).all<Category>()

        const categories = result.results || []

        // Cache response for 10 minutes (600 seconds)
        const response = new Response(JSON.stringify(categories), {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=600'
            }
        })

        cache.put(cacheKey, response.clone()).catch((error) => {
            console.error('[getActiveCategories] Error writing categories cache:', error)
        })

        return categories
    } catch (error) {
        // Log error but don't fail the request
        console.error('[getActiveCategories] Error fetching categories:', error)

        // Return empty array as fallback (graceful degradation)
        return []
    }
}
