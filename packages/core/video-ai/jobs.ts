import type { Env } from '../types'
import { getEditorialAiRuntimeConfig } from '../editorial-ai/openai'
import { claimVideoPipeline, releaseVideoPipeline, getVideoProject, getLatestVideoVersion, getVideoVersion, markVideoAutomaticallyReady } from './repository'
import { canAutoApproveVideo, generateVideoScriptVersion, reviewVideoProjectScript, parseVideoScript, parseVideoReview, MAX_VIDEO_ATTEMPTS } from './service'

export interface VideoJob {
  id: string
  project_id: number
  user_id: number
  status: 'active' | 'completed' | 'failed'
  stage: 'generate' | 'review'
  attempts: number
  version_id: number | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export async function getLatestVideoJob(env: Env, projectId: number): Promise<VideoJob | null> {
  return env.DB.prepare('SELECT * FROM video_ai_jobs WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1').bind(projectId).first<VideoJob>()
}

export async function enqueueVideoJob(env: Env, projectId: number, userId: number): Promise<VideoJob> {
  if (!env.VIDEO_JOBS_SECRET) throw new Error('O processamento de roteiros em segundo plano não está configurado.')
  const project = await getVideoProject(env, projectId)
  if (!project || project.status === 'archived') throw new Error('Projeto indisponível para geração.')
  const config = await getEditorialAiRuntimeConfig(env)
  if (!config.enabled || !config.apiKeyConfigured) throw new Error('Configure e habilite a integração de IA antes de gerar.')
  const now = new Date().toISOString()
  // The unique partial index makes repeated clicks idempotent while a job is active.
  await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO video_ai_jobs (id, project_id, user_id, status, stage, created_at, updated_at)
      VALUES (?, ?, ?, 'active', 'generate', ?, ?)`).bind(crypto.randomUUID(), projectId, userId, now, now),
    env.DB.prepare(`UPDATE video_ai_projects SET status = 'review', approved_at = NULL, approved_by_user_id = NULL, updated_at = ?
      WHERE id = ? AND status != 'archived' AND EXISTS (SELECT 1 FROM video_ai_jobs WHERE project_id = ? AND status = 'active')`).bind(now, projectId, projectId)
  ])
  const job = await getLatestVideoJob(env, projectId)
  if (!job) throw new Error('Não foi possível agendar o roteiro.')
  return job
}

async function updateJob(env: Env, job: VideoJob): Promise<void> {
  await env.DB.prepare(`UPDATE video_ai_jobs SET status = ?, stage = ?, attempts = ?, version_id = ?, error_message = ?, updated_at = ? WHERE id = ?`)
    .bind(job.status, job.stage, job.attempts, job.version_id, job.error_message, new Date().toISOString(), job.id).run()
}

// Executes at most ONE provider call (55s). The scheduler, never the browser, advances the job.
export async function processVideoJobStep(env: Env, jobId: string): Promise<{ status: string }> {
  let job = await env.DB.prepare('SELECT * FROM video_ai_jobs WHERE id = ?').bind(jobId).first<VideoJob>()
  if (!job || job.status !== 'active') return { status: job?.status || 'missing' }
  const projectId = job.project_id
  const owner = crypto.randomUUID()
  if (!(await claimVideoPipeline(env, job.project_id, owner, 90_000))) return { status: 'busy' }
  try {
    job = await env.DB.prepare('SELECT * FROM video_ai_jobs WHERE id = ?').bind(jobId).first<VideoJob>()
    if (!job || job.status !== 'active') return { status: job?.status || 'missing' }
    const project = await getVideoProject(env, job.project_id)
    if (!project || project.status === 'archived' || project.post_updated_at !== project.source_updated_at || !['published', 'review'].includes(project.post_status || '')) {
      throw new Error('A matéria mudou ou não está disponível. Crie um projeto com a fonte atualizada.')
    }
    if (job.stage === 'generate') {
      if (job.attempts >= MAX_VIDEO_ATTEMPTS) throw new Error('Produção bloqueada após 3 tentativas. Consulte a checagem da última versão.')
      job.attempts++
      // Persist the attempt before spending tokens, including interrupted calls.
      await updateJob(env, job)
      const previous = await getLatestVideoVersion(env, job.project_id)
      job.version_id = await generateVideoScriptVersion(env, project, job.user_id, previous)
      job.stage = 'review'
      await updateJob(env, job)
    } else {
      const version = job.version_id ? await getVideoVersion(env, job.project_id, job.version_id) : null
      if (!version) throw new Error('Versão indisponível para revisão.')
      // Reuse a persisted review after a worker interruption, instead of charging again.
      const review = parseVideoReview(version.review_json) || await reviewVideoProjectScript(env, job.project_id, version, job.user_id)
      if (canAutoApproveVideo(parseVideoScript(version.script_json), review)) {
        // Recover if the worker stopped between releasing production and updating the job.
        if (project.status !== 'ready') await markVideoAutomaticallyReady(env, job.project_id, version, owner)
        job.status = 'completed'
      } else {
        if (job.attempts >= MAX_VIDEO_ATTEMPTS) throw new Error('Produção bloqueada após 3 tentativas. Consulte a checagem da última versão.')
        job.stage = 'generate'
      }
      await updateJob(env, job)
    }
    return { status: job.status }
  } catch (error) {
    if (job) {
      job.status = 'failed'
      job.error_message = (error instanceof Error ? error.message : 'Falha no processamento.').slice(0, 1500)
      await updateJob(env, job)
    }
    return { status: 'failed' }
  } finally {
    // Use the original project key even if a concurrent deletion removed the job.
    await releaseVideoPipeline(env, projectId, owner)
  }
}

export function validVideoJobsSecret(expected: string | undefined, supplied: string): boolean {
  if (!expected || supplied.length !== expected.length) return false
  let different = 0
  for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ supplied.charCodeAt(i)
  return different === 0
}
