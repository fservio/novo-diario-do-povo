interface VideoJobsEnv {
  DB: D1Database
  VIDEO_JOBS_SECRET: string
  VIDEO_JOBS_ORIGIN: string
}

export async function drainVideoJobs(env: VideoJobsEnv): Promise<void> {
  const jobs = await env.DB.prepare("SELECT id FROM video_ai_jobs WHERE status = 'active' ORDER BY updated_at LIMIT 3").all<{ id: string }>()
  await Promise.all((jobs.results || []).map(async job => {
    for (let step = 0; step < 6; step++) {
      const response = await fetch(`${env.VIDEO_JOBS_ORIGIN}/api/internal/video-ia/step`, {
        method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${env.VIDEO_JOBS_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id }), signal: AbortSignal.timeout(75_000)
      })
      if (!response.ok) throw new Error(`Video job step returned HTTP ${response.status}`)
      const result = await response.json() as { status: string }
      if (result.status !== 'active') break
    }
  }))
}

export default {
  async scheduled(_event: ScheduledController, env: VideoJobsEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(drainVideoJobs(env))
  },
  async fetch(): Promise<Response> { return new Response('Not found', { status: 404 }) }
}
