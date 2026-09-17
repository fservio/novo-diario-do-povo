import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../packages/core/video-ai/repository', () => ({
  getVideoProject: vi.fn(), getVideoVersion: vi.fn(), getLatestVideoVersion: vi.fn(),
  listVideoVersions: vi.fn(), listVideoAiRuns: vi.fn()
}))
vi.mock('../../packages/core/editorial-ai/openai', () => ({
  getEditorialAiRuntimeConfig: vi.fn(async () => ({ enabled: true, apiKeyConfigured: true, model: 'test' }))
}))
vi.mock('../../packages/core/admin/ui', () => ({
  escapeHtml: (value: unknown) => String(value || '').replace(/</g, '&lt;'),
  renderAdminIcon: () => '', renderCsrfInput: () => '',
  renderAdminLayout: (input: any) => input.bodyHtml
}))
import * as repo from '../../packages/core/video-ai/repository'
import { handleVideoDownload, handleVideoIssueResolve, handleVideoScriptSave, renderVideoProjectDetail } from '../../packages/core/admin/video-ai'

const script = { title: 'Escolas', summary: 'Anúncio', word_count: 8, estimated_duration_seconds: 10,
  disclosure: 'Avatar de IA', pronunciation_notes: [], editorial_notes: [], unresolved_points: [],
  segments: [{ sequence: 1, speaker_role: 'anchor', segment_type: 'opening', dialogue: 'A prefeitura anunciou três escolas para 2027.',
    on_screen_text: '', visual_cue: '', estimated_seconds: 10, factual_basis: ['A prefeitura anunciou três escolas para 2027.'] }] }
const review = { overall_assessment: 'Aprovado', ready_for_human_review: false, ready_for_production: true,
  quality_scores: { accuracy: 5, news_value: 4, structure: 4, spoken_language: 4 }, issues: [] }
const version = { id: 2, version_number: 2, script_json: JSON.stringify(script), review_json: JSON.stringify(review) } as any
const project = { id: 1, status: 'ready', post_status: 'published', internal_title: 'Escolas', anchor_name: 'Âncora', format: 'bulletin',
  duration_seconds: 30, orientation: 'vertical', tone: 'factual', source_updated_at: '2026-09-17', post_updated_at: '2026-09-17' } as any
const context = (query: Record<string, string> = {}) => ({ env: {},
  req: { query: (key: string) => query[key] }, get: () => ({ id: 1, role: 'admin' }),
  text: (body: string, status: number) => new Response(body, { status }),
  html: (body: string) => new Response(body), notFound: () => new Response(null, { status: 404 })
}) as any

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(repo.getVideoProject).mockResolvedValue(project)
  vi.mocked(repo.getVideoVersion).mockResolvedValue(version)
  vi.mocked(repo.getLatestVideoVersion).mockResolvedValue(version)
  vi.mocked(repo.listVideoVersions).mockResolvedValue([version])
  vi.mocked(repo.listVideoAiRuns).mockResolvedValue([])
})

describe('Saída de produção do Estúdio', () => {
  it('exporta somente a versão atual liberada', async () => {
    const response = await handleVideoDownload(context(), 1)
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('A prefeitura anunciou três escolas')
  })
  it.each(['review', 'draft', 'approved', 'archived'])('bloqueia exportação no estado %s', async status => {
    vi.mocked(repo.getVideoProject).mockResolvedValue({ ...project, status })
    expect((await handleVideoDownload(context(), 1)).status).toBe(409)
  })
  it('bloqueia versão antiga mesmo aprovada', async () => {
    vi.mocked(repo.getVideoVersion).mockResolvedValue({ ...version, id: 1 })
    expect((await handleVideoDownload(context({ version: '1' }), 1)).status).toBe(409)
  })
  it('bloqueia quando a matéria muda ou sai de publicação/revisão', async () => {
    vi.mocked(repo.getVideoProject).mockResolvedValueOnce({ ...project, post_updated_at: '2026-09-18' })
    expect((await handleVideoDownload(context(), 1)).status).toBe(409)
    vi.mocked(repo.getVideoProject).mockResolvedValueOnce({ ...project, post_status: 'draft' })
    expect((await handleVideoDownload(context(), 1)).status).toBe(409)
  })
  it('bloqueia revisão antiga e parecer inválido', async () => {
    for (const review_json of [null, '{}', '{invalid', JSON.stringify({ ...review, ready_for_production: false })]) {
      vi.mocked(repo.getLatestVideoVersion).mockResolvedValueOnce({ ...version, review_json })
      expect((await handleVideoDownload(context(), 1)).status).toBe(409)
    }
  })
  it('não oferece aprovação humana nem exportação de versão bloqueada na interface', async () => {
    vi.mocked(repo.getVideoProject).mockResolvedValue({ ...project, status: 'review' })
    const html = await (await renderVideoProjectDetail(context(), 1)).text()
    expect(html).toContain('Executar produção automática')
    expect(html).not.toContain('data-video-copy=')
    expect(html).not.toContain('/aprovar')
    expect(html).not.toContain('Registrar como resolvido')
  })
  it('recusa os endpoints de alteração e resolução manuais', async () => {
    expect((await handleVideoIssueResolve(context(), 1, 0)).status).toBe(409)
    expect((await handleVideoScriptSave(context(), 1)).status).toBe(409)
  })
})
