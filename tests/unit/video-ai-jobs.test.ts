import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../packages/core/editorial-ai/openai', () => ({ getEditorialAiRuntimeConfig: vi.fn(async () => ({ enabled: true, apiKeyConfigured: true })) }))
vi.mock('../../packages/core/video-ai/repository', () => ({
  claimVideoPipeline: vi.fn(async () => true), releaseVideoPipeline: vi.fn(), getVideoProject: vi.fn(),
  getLatestVideoVersion: vi.fn(async () => null), getVideoVersion: vi.fn(), markVideoAutomaticallyReady: vi.fn(), setVideoProjectStatus: vi.fn()
}))
vi.mock('../../packages/core/video-ai/service', () => ({
  generateVideoScriptVersion: vi.fn(async () => 42), reviewVideoProjectScript: vi.fn(async () => ({ ready: true })),
  parseVideoReview: vi.fn(value => value ? JSON.parse(value) : null), parseVideoScript: vi.fn(JSON.parse),
  canAutoApproveVideo: vi.fn((_script, review) => review.ready), MAX_VIDEO_ATTEMPTS: 3
}))
import { enqueueVideoJob, processVideoJobStep, validVideoJobsSecret, type VideoJob } from '../../packages/core/video-ai/jobs'
import * as repo from '../../packages/core/video-ai/repository'
import * as service from '../../packages/core/video-ai/service'
let job: VideoJob
let env: any
beforeEach(() => {
  vi.clearAllMocks()
  job = { id: 'job', project_id: 1, user_id: 7, status: 'active', stage: 'generate', attempts: 0, version_id: null, error_message: null, created_at: '', updated_at: '' }
  env = { VIDEO_JOBS_SECRET: 'secret', DB: { prepare: vi.fn((sql: string) => ({ bind: (...args: any[]) => ({
    first: async () => ({ ...job }), run: async () => {
      if (sql.startsWith('UPDATE video_ai_jobs')) Object.assign(job, { status: args[0], stage: args[1], attempts: args[2], version_id: args[3], error_message: args[4] })
      return { meta: { changes: 1 } }
    }
  }) })), batch: vi.fn(async () => []) } }
  vi.mocked(repo.getVideoProject).mockResolvedValue({ id: 1, status: 'review', post_status: 'published', post_updated_at: 'now', source_updated_at: 'now' } as any)
  vi.mocked(repo.getVideoVersion).mockResolvedValue({ id: 42, script_json: '{}', review_json: null } as any)
})
describe('Etapas persistentes do Estúdio', () => {
  it('agendamento não chama a IA', async () => {
    expect((await enqueueVideoJob(env, 1, 7)).status).toBe('active')
    expect(env.DB.batch).toHaveBeenCalledOnce()
    expect(service.generateVideoScriptVersion).not.toHaveBeenCalled()
  })
  it('separa geração e revisão em duas execuções limitadas', async () => {
    expect(await processVideoJobStep(env, 'job')).toEqual({ status: 'active' })
    expect(job.stage).toBe('review')
    expect(job.attempts).toBe(1)
    expect(service.generateVideoScriptVersion).toHaveBeenCalledOnce()
    expect(service.reviewVideoProjectScript).not.toHaveBeenCalled()
    expect(await processVideoJobStep(env, 'job')).toEqual({ status: 'completed' })
    expect(service.reviewVideoProjectScript).toHaveBeenCalledOnce()
    expect(repo.markVideoAutomaticallyReady).toHaveBeenCalledOnce()
  })
  it('não processa uma tarefa concorrente', async () => {
    vi.mocked(repo.claimVideoPipeline).mockResolvedValueOnce(false)
    expect(await processVideoJobStep(env, 'job')).toEqual({ status: 'busy' })
    expect(service.generateVideoScriptVersion).not.toHaveBeenCalled()
  })
  it('persiste reprovação e avança para reescrita no próximo passo', async () => {
    Object.assign(job, { stage: 'review', version_id: 42, attempts: 1 })
    vi.mocked(service.reviewVideoProjectScript).mockResolvedValueOnce({ ready: false } as any)
    expect(await processVideoJobStep(env, 'job')).toEqual({ status: 'active' })
    expect(job.stage).toBe('generate')
    expect(service.generateVideoScriptVersion).not.toHaveBeenCalled()
  })
  it('bloqueia depois da terceira revisão e preserva motivo', async () => {
    Object.assign(job, { stage: 'review', version_id: 42, attempts: 3 })
    vi.mocked(service.reviewVideoProjectScript).mockResolvedValueOnce({ ready: false } as any)
    expect(await processVideoJobStep(env, 'job')).toEqual({ status: 'failed' })
    expect(job.error_message).toContain('após 3 tentativas')
    expect(repo.markVideoAutomaticallyReady).not.toHaveBeenCalled()
  })
  it('reutiliza revisão persistida após interrupção', async () => {
    Object.assign(job, { stage: 'review', version_id: 42, attempts: 1 })
    vi.mocked(repo.getVideoVersion).mockResolvedValueOnce({ id: 42, script_json: '{}', review_json: '{"ready":true}' } as any)
    expect(await processVideoJobStep(env, 'job')).toEqual({ status: 'completed' })
    expect(service.reviewVideoProjectScript).not.toHaveBeenCalled()
  })
  it('erro da API encerra a tarefa e solta o lease', async () => {
    vi.mocked(service.generateVideoScriptVersion).mockRejectedValueOnce(new Error('Tempo limite da IA'))
    expect(await processVideoJobStep(env, 'job')).toEqual({ status: 'failed' })
    expect(job.error_message).toBe('Tempo limite da IA')
    expect(repo.releaseVideoPipeline).toHaveBeenCalledOnce()
  })
  it('não refaz chamadas de tarefas concluídas e valida o segredo interno', async () => {
    job.status = 'completed'
    await processVideoJobStep(env, 'job')
    expect(service.generateVideoScriptVersion).not.toHaveBeenCalled()
    expect(validVideoJobsSecret(undefined, '')).toBe(false)
    expect(validVideoJobsSecret('abc', 'abd')).toBe(false)
    expect(validVideoJobsSecret('abc', 'abc')).toBe(true)
  })
})
