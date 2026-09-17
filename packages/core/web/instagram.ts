import type { Context } from 'hono'
import type { Env } from '../types'
import {
  applyInstagramN8nCallback,
  getInstagramPublication,
  getInstagramPublicationByToken,
  getInstagramStoryVariantByToken,
  renderInstagramArtwork,
  renderInstagramStoryArtwork
} from '../instagram'

export async function handleInstagramArtwork(c: Context) {
  const token = c.req.param('token')
  if (!/^[a-f0-9]{48}$/i.test(token)) return c.notFound()
  const publication = await getInstagramPublicationByToken(c.env as Env, token)
  if (!publication) return c.notFound()
  return c.html(renderInstagramArtwork(publication, (c.env as Env).PUBLIC_BASE_URL), 200, {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  })
}

export async function handleInstagramStoryArtwork(c: Context) {
  const token = c.req.param('token')
  if (!/^[a-f0-9]{48}$/i.test(token)) return c.notFound()
  const story = await getInstagramStoryVariantByToken(c.env as Env, token)
  if (!story) return c.notFound()
  const publication = await getInstagramPublication(c.env as Env, story.publication_id)
  if (!publication) return c.notFound()
  return c.html(renderInstagramStoryArtwork(publication, story, (c.env as Env).PUBLIC_BASE_URL), 200, {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  })
}

export async function handleInstagramN8nCallback(c: Context) {
  const id = Number.parseInt(c.req.param('id'), 10)
  if (!Number.isInteger(id) || id < 1) return c.json({ success: false, error: 'Invalid publication id' }, 400)
  let body: Record<string, unknown>
  try {
    body = await c.req.json<Record<string, unknown>>()
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }
  try {
    await applyInstagramN8nCallback(c.env as Env, id, body)
    return c.json({ success: true, publication_id: id })
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Callback failed' }, 400)
  }
}
