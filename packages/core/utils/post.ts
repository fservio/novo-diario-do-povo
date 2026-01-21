/**
 * Post Utilities
 */

export function getPostUrl(post: { slug: string; published_at?: string | null; created_at?: string }, baseUrl: string = ''): string {
    const dateStr = post.published_at || post.created_at
    if (!dateStr) return `${baseUrl}/noticia/${post.slug}/` // Fallback

    try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return `${baseUrl}/noticia/${post.slug}/`

        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')

        // Ensure baseUrl doesn't end with slash if present
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl

        return `${cleanBaseUrl}/${year}/${month}/${day}/${post.slug}/`
    } catch {
        return `${baseUrl}/noticia/${post.slug}/`
    }
}
