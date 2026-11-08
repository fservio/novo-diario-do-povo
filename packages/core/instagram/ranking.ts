import type { Env } from '../types'
import type { RelatedPost } from '../db/article'

export const INSTAGRAM_RANKING_CACHE_KEY = 'instagram:popular-articles:v1'
const ttl = 6 * 60 * 60
export interface InstagramRankedPost extends RelatedPost { instagram_views: number }

// Reuse stored insights; public requests never contact Meta or record page views.
export async function refreshInstagramRanking(env: Env): Promise<InstagramRankedPost[]> {
  const now = new Date()
  const since = new Date(now.getTime() - 30 * 86400000).toISOString()
  const result = await env.DB.prepare(`
    SELECT p.id,p.slug,p.title,p.published_at,p.hat,
      m.r2_key AS featured_image_r2_key,c.name AS category_name,
      MAX(json_extract(CASE WHEN json_valid(i.data_json) THEN i.data_json ELSE '{}' END,'$.views')) AS instagram_views
    FROM instagram_media_insights i
    JOIN instagram_connections account ON account.id=1 AND account.account_id=i.account_id
    JOIN instagram_publications publication ON publication.id=i.publication_id
      AND publication.meta_media_id=i.media_id AND publication.status='published'
    JOIN posts p ON p.id=publication.post_id
    LEFT JOIN media m ON m.id=p.cover_media_id
    LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.status='published' AND p.seo_noindex=0 AND p.published_at<=?
      AND publication.published_at>=? AND publication.published_at<=?
      AND json_valid(i.data_json)
      AND json_type(CASE WHEN json_valid(i.data_json) THEN i.data_json ELSE '{}' END,'$.views') IN ('integer','real')
      AND json_extract(CASE WHEN json_valid(i.data_json) THEN i.data_json ELSE '{}' END,'$.views')>0
    GROUP BY p.id
    ORDER BY instagram_views DESC,p.published_at DESC,p.id DESC LIMIT 5
  `).bind(now.toISOString(),since,now.toISOString()).all<InstagramRankedPost>()
  const posts = result.results || []
  if (env.CACHE) {
    try { await env.CACHE.put(INSTAGRAM_RANKING_CACHE_KEY,JSON.stringify(posts),{expirationTtl:ttl}) }
    catch (error) { console.error('[Instagram ranking] Cache write failed',error) }
  }
  return posts
}

export async function getInstagramRanking(env: Env): Promise<InstagramRankedPost[]> {
  try {
    if (env.CACHE) {
      const cached = await env.CACHE.get<InstagramRankedPost[]>(INSTAGRAM_RANKING_CACHE_KEY,'json')
      if (Array.isArray(cached)) return cached
    }
  } catch (error) { console.error('[Instagram ranking] Cache read failed',error) }
  try { return await refreshInstagramRanking(env) }
  catch (error) {
    console.error('[Instagram ranking] Ranking unavailable',error)
    return []
  }
}
