import type { Env } from '../packages/core/types'
import { processInstagramDirectJobs, refreshInstagramConnection } from '../packages/core/instagram/direct'
import { syncInstagramAudience } from '../packages/core/instagram/audience'
import { pollInstagramLinkComments, processInstagramLinkReplies } from '../packages/core/instagram/links'

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      try { await refreshInstagramConnection(env) }
      catch { console.error('[Instagram] Não foi possível renovar a conexão.') }
      try { await processInstagramDirectJobs(env) } catch { console.error('[Instagram] Falha na fila de publicação.') }
      try { await pollInstagramLinkComments(env) } catch { console.error('[Instagram] Falha na consulta de comentários.') }
      try { await processInstagramLinkReplies(env) } catch { console.error('[Instagram] Falha na fila LINK.') }
      try { await syncInstagramAudience(env) } catch { console.error('[Instagram] Falha na atualização de audiência.') }
    })())
  },
  async fetch(): Promise<Response> { return new Response('Not found', { status: 404 }) }
}
