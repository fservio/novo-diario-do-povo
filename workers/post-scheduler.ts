import { publishDuePosts } from '../packages/core/post-scheduling'
import type { D1Database } from '@cloudflare/workers-types'

export default {
  async scheduled(_event: ScheduledController, env: { DB: D1Database }, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(publishDuePosts(env.DB))
  },
  async fetch(): Promise<Response> { return new Response('Not found', { status: 404 }) }
}
