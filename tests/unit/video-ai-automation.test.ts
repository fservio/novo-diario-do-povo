import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoProject, VideoReviewOutput, VideoScriptOutput, VideoVersion } from '../../packages/core/video-ai/types'

vi.mock('../../packages/core/editorial-ai/openai', () => ({
  getEditorialAiRuntimeConfig: vi.fn(async () => ({ model: 'test', maxDailyRuns: 100 }))
}))
vi.mock('../../packages/core/video-ai/openai', async importOriginal => ({
  ...await importOriginal<typeof import('../../packages/core/video-ai/openai')>(),
  requestVideoScript: vi.fn(), requestVideoReview: vi.fn()
}))
vi.mock('../../packages/core/video-ai/repository', () => ({
  claimVideoPipeline: vi.fn(), releaseVideoPipeline: vi.fn(), markVideoAutomaticallyReady: vi.fn(),
  getVideoProject: vi.fn(), getLatestVideoVersion: vi.fn(), getVideoVersion: vi.fn(),
  listVideoAvatars: vi.fn(), startVideoAiRun: vi.fn(), completeVideoAiRun: vi.fn(),
  failVideoAiRun: vi.fn(), saveVideoVersion: vi.fn(), saveVideoReview: vi.fn(), setVideoProjectStatus: vi.fn()
}))

import * as repo from '../../packages/core/video-ai/repository'
import * as ai from '../../packages/core/video-ai/openai'
import { canAutoApproveVideo, generateVideoProjectScript, validateVideoEditorialRules, parseVideoReview } from '../../packages/core/video-ai/service'

const project = { id: 1, status: 'draft', format: 'bulletin', duration_seconds: 30, anchor_avatar_id: 1,
  post_status: 'published', post_updated_at: '2026-09-17', source_updated_at: '2026-09-17',
  source_snapshot_json: JSON.stringify({ title: 'Escolas', content: 'A prefeitura anunciou três escolas para 2027.' }) } as VideoProject
function script(): VideoScriptOutput {
  return { title: 'Escolas', summary: 'Anúncio da prefeitura.', word_count: 8, estimated_duration_seconds: 10,
    disclosure: 'Apresentação por avatar de IA.', pronunciation_notes: [], editorial_notes: [], unresolved_points: [],
    segments: [{ sequence: 1, speaker_role: 'anchor', segment_type: 'opening',
      dialogue: 'A prefeitura anunciou três escolas para 2027.', on_screen_text: '', visual_cue: '',
      estimated_seconds: 10, factual_basis: ['A prefeitura anunciou três escolas para 2027.'] }] }
}
function review(ready = true): VideoReviewOutput {
  return { overall_assessment: ready ? 'Fiel e claro.' : 'Reescrever abertura.', ready_for_human_review: false,
    ready_for_production: ready, quality_scores: { accuracy: 5, news_value: ready ? 4 : 3, structure: 4, spoken_language: 4 },
    issues: ready ? [] : [{ severity: 'warning', segment_sequence: 1, claim: 'Abertura vaga', evidence: '', status: 'needs_review', recommendation: 'Abra com o anúncio.' }] }
}
const result = <T>(data: T) => ({ data, responseId: 'test', model: 'test', inputTokens: 1, outputTokens: 1, totalTokens: 2, durationMs: 1 })
const env = { DB: { prepare: vi.fn(() => ({ first: async () => ({ total: 0 }) })) } } as any
let versions: VideoVersion[]

beforeEach(() => {
  vi.clearAllMocks()
  versions = []
  vi.mocked(repo.claimVideoPipeline).mockResolvedValue(true)
  vi.mocked(repo.getVideoProject).mockResolvedValue(project)
  vi.mocked(repo.getLatestVideoVersion).mockResolvedValue(null)
  vi.mocked(repo.listVideoAvatars).mockResolvedValue([{ id: 1, role: 'anchor', name: 'Âncora' }] as any)
  vi.mocked(repo.startVideoAiRun).mockResolvedValue(1)
  vi.mocked(repo.saveVideoVersion).mockImplementation(async (_, input) => {
    versions.push({ id: versions.length + 1, script_json: JSON.stringify(input.script), review_json: null } as VideoVersion)
    return versions.length
  })
  vi.mocked(repo.getVideoVersion).mockImplementation(async (_, __, id) => versions[id - 1])
  vi.mocked(ai.requestVideoScript).mockResolvedValue(result(script()))
  vi.mocked(ai.requestVideoReview).mockResolvedValue(result(review()))
})

describe('Produção automática de roteiros', () => {
  it('libera após geração e revisão sem aprovação humana', async () => {
    expect(await generateVideoProjectScript(env, 1, 7)).toBe(1)
    expect(repo.saveVideoReview).toHaveBeenCalledOnce()
    expect(repo.markVideoAutomaticallyReady).toHaveBeenCalledOnce()
    expect(repo.releaseVideoPipeline).toHaveBeenCalledOnce()
  })

  it('reescreve com o parecer anterior e revisa novamente', async () => {
    vi.mocked(ai.requestVideoReview).mockResolvedValueOnce(result(review(false)))
    expect(await generateVideoProjectScript(env, 1, 7)).toBe(2)
    expect(ai.requestVideoScript).toHaveBeenNthCalledWith(2, env, expect.stringContaining('Abra com o anúncio.'))
    expect(ai.requestVideoReview).toHaveBeenCalledTimes(2)
    expect(repo.markVideoAutomaticallyReady).toHaveBeenCalledOnce()
  })

  it('bloqueia depois de três tentativas sem liberar saída', async () => {
    vi.mocked(ai.requestVideoReview).mockResolvedValue(result(review(false)))
    await expect(generateVideoProjectScript(env, 1, 7)).rejects.toThrow('após 3 tentativas')
    expect(ai.requestVideoScript).toHaveBeenCalledTimes(3)
    expect(repo.markVideoAutomaticallyReady).not.toHaveBeenCalled()
    expect(repo.releaseVideoPipeline).toHaveBeenCalledOnce()
  })

  it('não libera em falha da API e registra o erro', async () => {
    vi.mocked(ai.requestVideoReview).mockRejectedValueOnce(new Error('timeout'))
    await expect(generateVideoProjectScript(env, 1, 7)).rejects.toThrow('timeout')
    expect(repo.failVideoAiRun).toHaveBeenCalled()
    expect(repo.markVideoAutomaticallyReady).not.toHaveBeenCalled()
    expect(repo.releaseVideoPipeline).toHaveBeenCalledOnce()
  })

  it('não executa uma segunda geração concorrente', async () => {
    vi.mocked(repo.claimVideoPipeline).mockResolvedValueOnce(false)
    await expect(generateVideoProjectScript(env, 1, 7)).rejects.toThrow('em andamento')
    expect(ai.requestVideoScript).not.toHaveBeenCalled()
    expect(repo.releaseVideoPipeline).not.toHaveBeenCalled()
  })

  it('respeita o orçamento antes de cada chamada', async () => {
    env.DB.prepare.mockReturnValueOnce({ first: async () => ({ total: 100 }) })
    await expect(generateVideoProjectScript(env, 1, 7)).rejects.toThrow('limite')
    expect(ai.requestVideoScript).not.toHaveBeenCalled()
    expect(repo.markVideoAutomaticallyReady).not.toHaveBeenCalled()
  })

  it('revoga a liberação se a fonte mudou, antes de gastar com a API', async () => {
    vi.mocked(repo.getVideoProject).mockResolvedValueOnce({ ...project, status: 'ready', post_updated_at: '2026-09-18' })
    await expect(generateVideoProjectScript(env, 1, 7)).rejects.toThrow('fonte atualizada')
    expect(repo.setVideoProjectStatus).toHaveBeenCalledWith(env, 1, 'review')
    expect(ai.requestVideoScript).not.toHaveBeenCalled()
    expect(repo.markVideoAutomaticallyReady).not.toHaveBeenCalled()
  })

  it('bloqueia notas baixas, veredito negativo e resoluções humanas antigas', () => {
    expect(canAutoApproveVideo(script(), review())).toBe(true)
    const rejected = review(false)
    rejected.ready_for_production = true
    rejected.issues[0].human_status = 'resolved'
    expect(canAutoApproveVideo(script(), rejected)).toBe(false)
    expect(canAutoApproveVideo(script(), { ...review(), ready_for_production: false })).toBe(false)
    expect(canAutoApproveVideo(script(), { ...review(), quality_scores: { ...review().quality_scores!, accuracy: 4 } })).toBe(false)
    expect(canAutoApproveVideo(script(), parseVideoReview('{"ready_for_human_review":true}'))).toBe(false)
  })

  it('bloqueia citação inexistente, lacunas, função não selecionada e duração excedida', () => {
    const value = script()
    value.segments[0].factual_basis = ['Citação inventada']
    value.segments[0].speaker_role = 'reporter'
    value.segments[0].dialogue = 'palavra '.repeat(200)
    value.unresolved_points = ['Data não sustentada']
    const checked = validateVideoEditorialRules(project, value, review())
    expect(checked.issues).toHaveLength(4)
    expect(canAutoApproveVideo(value, checked)).toBe(false)
  })

  it('aceita roteiro mais curto e trechos da fonte, sem preencher tempo', () => {
    const checked = validateVideoEditorialRules(project, script(), review())
    expect(checked.issues).toHaveLength(0)
    expect(canAutoApproveVideo(script(), checked)).toBe(true)
  })
})
