import type { D1Database } from '@cloudflare/workers-types'
import { getPostUrl } from '../utils/post'

const domain = 'https://diario.dopovo.com.br'
const paragraphs = /(<p\b[^>]*>)([\s\S]*?)(<\/p>)/gi
const markup = /<[^>]*>/g
const entity = /&(?:#\d+|#x[\da-f]+|[a-z][\w]+);/gi

type Target = { id: number; slug: string; title: string; excerpt: string | null; published_at: string; seo_canonical: string | null }
export type InternalLink = { paragraph: number; anchor: string; targetId: number }

export function linkBudget(html: string): number {
  const words = html.replace(markup, ' ').replace(entity, ' ').match(/[\p{L}\p{N}]+/gu) || []
  const existing = [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)].filter(([, href]) => {
    try { return new URL(href, domain).origin === domain } catch { return false }
  }).length
  return Math.max(0, Math.min(5, Math.ceil(words.length / 250)) - existing)
}

export function linkableParagraphs(html: string) {
  return [...html.matchAll(paragraphs)].flatMap(([, , body], paragraph) =>
    /<[^>]*>/.test(body) || !body.trim() ? [] : [{ paragraph, text: body }]
  )
}

function targetUrl(target: Target): string | undefined {
  const canonical = getPostUrl(target, domain)
  if (target.seo_canonical && target.seo_canonical !== canonical) return undefined
  return getPostUrl(target)
}

export function renderInternalLinks(html: string, links: InternalLink[], targets: Map<number, string>): string {
  const budget = linkBudget(html)
  if (!budget) return html
  const used = new Set<number>()
  let paragraph = 0
  return html.replace(paragraphs, (original, start: string, body: string, end: string) => {
    const index = paragraph++
    if (used.size >= budget || /<[^>]*>/.test(body)) return original
    const link = links.find(item => item.paragraph === index)
    const href = link && targets.get(link.targetId)
    if (!link || !href || used.has(link.targetId)) return original
    const anchor = link.anchor
    if (anchor.length < 3 || anchor !== anchor.trim() || /[<>&]/.test(anchor)) return original
    const at = body.indexOf(anchor)
    if (at < 0 || body.indexOf(anchor, at + 1) !== -1) return original
    const before = body.slice(0, at), after = body.slice(at + anchor.length)
    if (/[\p{L}\p{N}]$/u.test(before) || /^[\p{L}\p{N}]/u.test(after)) return original
    used.add(link.targetId)
    const safeHref = href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
    return start + before + '<a href="' + safeHref + '">' + anchor + '</a>' + after + end
  })
}

export async function linkTargets(db: D1Database, ids: number[]) {
  const urls = new Map<number, string>()
  if (!ids.length) return urls
  const result = await db.prepare(`
    SELECT id, slug, title, excerpt, published_at, seo_canonical FROM posts
    WHERE id IN (${ids.map(() => '?').join(',')}) AND status = 'published'
      AND COALESCE(seo_noindex, 0) = 0 AND published_at IS NOT NULL
  `).bind(...ids).all<Target>()
  for (const row of result.results) {
    const url = targetUrl(row)
    if (url) urls.set(row.id, url)
  }
  return urls
}

export async function proposeLinkInput(db: D1Database, id: number) {
  const post = await db.prepare('SELECT id, title, content, category_id FROM posts WHERE id = ? AND status != ?')
    .bind(id, 'archived').first<{ id: number; title: string; content: string; category_id: number }>()
  if (!post) return null
  const budget = linkBudget(post.content)
  const terms = [...new Set((post.title.toLocaleLowerCase('pt-BR').match(/[\p{L}\p{N}]{5,}/gu) || []))].slice(0, 8)
  const candidates = budget && terms.length ? await db.prepare(`
    SELECT id, slug, title, excerpt, published_at, seo_canonical FROM (
      SELECT id, slug, title, excerpt, published_at, seo_canonical
      FROM posts WHERE category_id = ? AND status = 'published' AND COALESCE(seo_noindex, 0) = 0
        AND id != ? AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 2000
    )
    WHERE ${terms.map(() => 'instr(lower(title), ?) > 0').join(' OR ')}
    ORDER BY ${terms.map(() => '(instr(lower(title), ?) > 0)').join(' + ')} DESC, published_at DESC LIMIT 12
  `).bind(post.category_id, id, ...terms, ...terms).all<Target>() : null
  return {
    title: post.title,
    revision: await contentRevision(post.content),
    budget,
    paragraphs: linkableParagraphs(post.content),
    candidates: (candidates?.results || []).filter(targetUrl).map(({ id, title, excerpt, published_at }) => ({ id, title, excerpt, published_at }))
  }
}

export async function contentRevision(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function applyStoredInternalLinks(db: D1Database, postId: number, source: string, html: string) {
  const row = await db.prepare('SELECT source_revision, links_json FROM post_internal_links WHERE post_id = ?')
    .bind(postId).first<{ source_revision: string; links_json: string }>()
  if (!row || row.source_revision !== await contentRevision(source)) return html
  const links = JSON.parse(row.links_json) as InternalLink[]
  return renderInternalLinks(html, links, await linkTargets(db, links.map(link => link.targetId)))
}

export async function saveInternalLinks(db: D1Database, id: number, revision: string, batch: string, links: InternalLink[]) {
  const post = await db.prepare('SELECT content FROM posts WHERE id = ?').bind(id).first<{ content: string }>()
  if (!post || await contentRevision(post.content) !== revision) return false
  if (links.length > linkBudget(post.content) || links.some(link => link.targetId === id)) return false
  const targets = await linkTargets(db, links.map(link => link.targetId))
  const before = (post.content.match(/<a\b/gi) || []).length
  const after = (renderInternalLinks(post.content, links, targets).match(/<a\b/gi) || []).length
  if (after - before !== links.length) return false
  const result = await db.prepare(`
    INSERT INTO post_internal_links(post_id, source_revision, links_json, batch_id, updated_at)
    SELECT id, ?, ?, ?, ? FROM posts WHERE id = ? AND content = ?
    ON CONFLICT(post_id) DO UPDATE SET source_revision = excluded.source_revision,
      links_json = excluded.links_json, batch_id = excluded.batch_id, updated_at = excluded.updated_at
  `).bind(revision, JSON.stringify(links), batch, new Date().toISOString(), id, post.content).run()
  return result.meta.changes === 1
}

export async function publicationLinksRequired(db: D1Database): Promise<boolean> {
  const setting = await db.prepare("SELECT value_json FROM settings WHERE key = ? AND scope = 'private'")
    .bind('internal_links.required')
    .first<{ value_json: string }>()
  return setting?.value_json === 'true'
}

export async function hasPublicationLink(db: D1Database, postId: number): Promise<boolean> {
  const post = await db.prepare('SELECT content FROM posts WHERE id = ?').bind(postId).first<{ content: string }>()
  if (!post?.content) return false
  const html = await applyStoredInternalLinks(db, postId, post.content, post.content)
  const urls = new Set<string>()
  for (const [, href, label] of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (!(label || '').replace(markup, '').trim()) continue
    try {
      const url = new URL(href || '', domain)
      if (url.origin === domain) urls.add(url.pathname)
    } catch { /* Invalid URLs cannot satisfy publication. */ }
  }
  const slugs = [...new Set([...urls].flatMap(url => {
    const match = url.match(/^\/(?:\d{4}\/\d{2}\/\d{2}|noticia)\/([^/]+)\/$/)
    return match?.[1] ? [match[1]] : []
  }))].slice(0, 50)
  if (!slugs.length) return false
  const rows = await db.prepare(`
    SELECT id, slug, published_at, seo_canonical FROM posts
    WHERE slug IN (${slugs.map(() => '?').join(',')}) AND id != ?
      AND status = 'published' AND COALESCE(seo_noindex, 0) = 0 AND published_at IS NOT NULL
  `).bind(...slugs, postId).all<Target>()
  return rows.results.some(row => {
    const url = targetUrl(row)
    return Boolean(url && urls.has(url))
  })
}

export const publicationLinkError = 'Inclua pelo menos um link interno contextual válido para publicar a matéria.'
