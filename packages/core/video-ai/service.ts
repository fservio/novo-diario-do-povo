import type { Env } from '../types'
import { getPostById } from '../db/posts'
import { getEditorialAiRuntimeConfig } from '../editorial-ai/openai'
import { sha256Hex } from '../utils/crypto'
import { requestVideoReview, requestVideoScript, videoScriptZod, videoReviewZod } from './openai'
import {
  claimVideoPipeline,
  releaseVideoPipeline,
  markVideoAutomaticallyReady,
  getVideoVersion,
  completeVideoAiRun,
  createVideoProject,
  failVideoAiRun,
  getLatestVideoVersion,
  getVideoProject,
  listVideoAvatars,
  saveVideoReview,
  saveVideoVersion,
  setVideoProjectStatus,
  startVideoAiRun
} from './repository'
import type {
  VideoProject,
  VideoProjectCreateInput,
  VideoProjectFormat,
  VideoReviewOutput,
  VideoScriptOutput,
  VideoVersion
} from './types'

const PROMPT_VERSION = 'video-studio-v2.0-auto'
export const MAX_VIDEO_ATTEMPTS = 3

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function countVideoWords(script: VideoScriptOutput): number {
  return script.segments.reduce((total, segment) => total + segment.dialogue.trim().split(/\s+/).filter(Boolean).length, 0)
}

export function estimateVideoSeconds(wordCount: number): number {
  return Math.max(1, Math.round((wordCount / 140) * 60))
}

export function parseVideoScript(value: string): VideoScriptOutput {
  return videoScriptZod.parse(JSON.parse(value)) as VideoScriptOutput
}

export function parseVideoReview(value: string | null): VideoReviewOutput | null {
  if (!value) return null
  try { return videoReviewZod.parse(JSON.parse(value)) as VideoReviewOutput } catch { return null }
}

function normalizeDuration(value: number): number {
  return Math.max(20, Math.min(600, Math.round(value || 90)))
}

export async function createVideoProjectFromPost(env: Env, input: Omit<VideoProjectCreateInput,
  'sourceSnapshotJson' | 'sourceHash' | 'sourceUpdatedAt' | 'createdByUserId'>, userId: number): Promise<number> {
  if (!input.internalTitle.trim()) throw new Error('Informe um nome interno para o projeto.')
  const post = await getPostById(env.DB, input.postId)
  if (!post || !['published', 'review'].includes(post.status)) throw new Error('Selecione uma matéria publicada ou em revisão.')
  const avatars = await listVideoAvatars(env, true)
  const selections = [input.anchorAvatarId, input.reporterAvatarId, input.commentatorAvatarId].filter(Boolean) as number[]
  if (!selections.length) throw new Error('Escolha pelo menos um avatar da redação.')
  const selected = selections.map(id => avatars.find(avatar => avatar.id === id))
  if (selected.some(avatar => !avatar)) throw new Error('Um dos avatares selecionados não está ativo.')
  if (input.anchorAvatarId && selected.find(avatar => avatar?.id === input.anchorAvatarId)?.role !== 'anchor') throw new Error('Escolha um âncora válido.')
  if (input.reporterAvatarId && selected.find(avatar => avatar?.id === input.reporterAvatarId)?.role !== 'reporter') throw new Error('Escolha um repórter válido.')
  if (input.commentatorAvatarId && selected.find(avatar => avatar?.id === input.commentatorAvatarId)?.role !== 'commentator') throw new Error('Escolha um comentarista válido.')
  if (input.format === 'commentary' && !input.commentatorAvatarId) throw new Error('O formato comentário exige um comentarista.')
  const sourceText = (post.content_markdown || '').trim() || stripHtml(post.content || '')
  if (!sourceText) throw new Error('A matéria selecionada não possui conteúdo para adaptação.')
  const snapshot = {
    post_id: post.id, title: post.title, hat: post.hat, excerpt: post.excerpt,
    category: post.category_name || '', author: post.author_name || '', status: post.status,
    published_at: post.published_at, updated_at: post.updated_at, content: sourceText.slice(0, 120000)
  }
  const sourceSnapshotJson = JSON.stringify(snapshot)
  return createVideoProject(env, {
    ...input,
    durationSeconds: normalizeDuration(input.durationSeconds),
    sourceSnapshotJson,
    sourceHash: await sha256Hex(sourceSnapshotJson),
    sourceUpdatedAt: post.updated_at || post.published_at || post.created_at,
    createdByUserId: userId
  })
}

async function assertRunBudget(env: Env): Promise<void> {
  const config = await getEditorialAiRuntimeConfig(env)
  const count = await env.DB.prepare(`
    SELECT (
      (SELECT COUNT(*) FROM editorial_ai_runs WHERE created_at >= datetime('now', '-24 hours')) +
      (SELECT COUNT(*) FROM video_ai_runs WHERE created_at >= datetime('now', '-24 hours'))
    ) AS total
  `).first<{ total: number }>()
  if (Number(count?.total || 0) >= config.maxDailyRuns) throw new Error(`O limite de ${config.maxDailyRuns} operações de IA em 24 horas foi atingido.`)
}

function formatLabel(format: VideoProjectFormat): string {
  return ({ bulletin: 'boletim rápido', report: 'reportagem', explainer: 'explicador', commentary: 'comentário ou análise' })[format]
}

export async function buildVideoPrompt(env: Env, project: VideoProject): Promise<string> {
  const avatars = await listVideoAvatars(env)
  const assignments = [
    project.anchor_avatar_id ? avatars.find(item => item.id === project.anchor_avatar_id) : null,
    project.reporter_avatar_id ? avatars.find(item => item.id === project.reporter_avatar_id) : null,
    project.commentator_avatar_id ? avatars.find(item => item.id === project.commentator_avatar_id) : null
  ].filter(Boolean)
  const targetWords = Math.max(45, Math.round((project.duration_seconds / 60) * 140))
  const avatarBlock = assignments.map(avatar => [
    `${avatar!.role.toUpperCase()}: ${avatar!.name}`,
    avatar!.external_label ? `Identificação no HeyGen: ${avatar!.external_label}` : '',
    avatar!.speaking_style ? `Estilo: ${avatar!.speaking_style}` : '',
    avatar!.pronunciation_notes ? `Observações: ${avatar!.pronunciation_notes}` : ''
  ].filter(Boolean).join(' · ')).join('\n')
  return [
    '<DIRECAO_EDITORIAL>',
    `TÍTULO INTERNO: ${project.internal_title}`,
    `FORMATO: ${formatLabel(project.format)}`,
    `ESTRUTURA: ${{
      bulletin: 'Lide direto, dois ou três fatos essenciais atribuídos, serviço ou próximo passo conhecido e encerramento breve. Poucas trocas de voz.',
      report: 'Abertura com a notícia, desenvolvimento com evidências e fontes, contexto disponível e consequências comprovadas. Cada passagem acrescenta informação.',
      explainer: 'Apresente o que mudou ou a pergunta central; explique o mecanismo com base na fonte, quem é afetado e o que ainda não se sabe. Não invente exemplos factuais.',
      commentary: 'Apresente primeiro os fatos atribuídos; depois sinalize a análise e suas premissas; encerre com os limites da interpretação. Não invente intenções ou previsões.'
    }[project.format]}`,
    `DURAÇÃO-ALVO: ${project.duration_seconds} segundos; aproximadamente ${targetWords} palavras, limite máximo com tolerância de 10%. Encurte se a fonte não sustentar esse tempo.`,
    `ORIENTAÇÃO: ${project.orientation}`,
    `TOM: ${project.tone}`,
    `PÚBLICO: ${project.target_audience || 'Leitores do Diário do Povo.'}`,
    `ORIENTAÇÕES DO JORNALISTA: ${project.editorial_instructions || 'Sem orientação adicional.'}`,
    `CHAMADA FINAL: ${project.closing_cta || 'Convide o público a acompanhar a cobertura no Diário do Povo.'}`,
    'AVATARES DISPONÍVEIS:', avatarBlock,
    'Use somente os papéis listados acima. O âncora conduz; o repórter desenvolve fatos; o comentarista interpreta de forma explicitamente analítica.',
    '</DIRECAO_EDITORIAL>',
    '<MATERIA_FONTE_NAO_CONFIAVEL>', project.source_snapshot_json, '</MATERIA_FONTE_NAO_CONFIAVEL>'
  ].join('\n')
}

export function canAutoApproveVideo(script: VideoScriptOutput, review: VideoReviewOutput | null): boolean {
  const scores = review?.quality_scores
  return Boolean(review?.ready_for_production && scores && scores.accuracy === 5 &&
    scores.news_value >= 4 && scores.structure >= 4 && scores.spoken_language >= 4 &&
    !script.unresolved_points.length && !review.issues.some(issue => issue.status !== 'confirmed'))
}

export function validateVideoEditorialRules(project: VideoProject, script: VideoScriptOutput, review: VideoReviewOutput): VideoReviewOutput {
  const issues = [...review.issues]
  const add = (claim: string, sequence = 0) => issues.push({ severity: 'blocking', segment_sequence: sequence,
    claim, evidence: '', status: 'needs_review', recommendation: claim })
  const source = JSON.parse(project.source_snapshot_json)
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
  const evidence = [source.title, source.excerpt, source.content].filter(Boolean).map(normalize)
  if (estimateVideoSeconds(countVideoWords(script)) > project.duration_seconds * 1.1) add('Encurte as falas: duração acima do limite de 110%.')
  if (!script.disclosure.trim()) add('Inclua transparência sobre apresentação por avatares de IA.')
  for (const point of script.unresolved_points) add(`Resolva ou remova a informação sem sustentação: ${point}`)
  script.segments.forEach((segment, index) => {
    if (segment.sequence !== index + 1) add('Numere os blocos em sequência, começando em 1.', segment.sequence)
    if (!project[`${segment.speaker_role}_avatar_id`]) add('Utilize somente os avatares selecionados.', segment.sequence)
    if (!['transition', 'closing'].includes(segment.segment_type) && !segment.factual_basis.length) add('Informe trechos literais da fonte para o bloco.', segment.sequence)
    if (segment.factual_basis.some(quote => !normalize(quote) || !evidence.some(text => text.includes(normalize(quote))))) add('Substitua a base factual por trechos literais existentes na matéria.', segment.sequence)
  })
  return { ...review, issues, ready_for_production: review.ready_for_production && !issues.some(issue => issue.status !== 'confirmed') }
}

export async function generateVideoProjectScript(env: Env, projectId: number, userId: number): Promise<number> {
  const project = await getVideoProject(env, projectId)
  if (!project || project.status === 'archived') throw new Error('Projeto indisponível para geração.')
  const owner = crypto.randomUUID()
  if (!(await claimVideoPipeline(env, projectId, owner))) throw new Error('A produção automática deste projeto já está em andamento.')
  try {
    await setVideoProjectStatus(env, projectId, 'review')
    if (project.post_updated_at !== project.source_updated_at || !['published', 'review'].includes(project.post_status || '')) {
      throw new Error('A matéria de origem mudou ou não está disponível. Crie um novo projeto com a fonte atualizada.')
    }
    const basePrompt = await buildVideoPrompt(env, project)
    let previous = await getLatestVideoVersion(env, projectId)
    for (let attempt = 1; attempt <= MAX_VIDEO_ATTEMPTS; attempt++) {
      await assertRunBudget(env)
      const config = await getEditorialAiRuntimeConfig(env)
      const runId = await startVideoAiRun(env, { projectId, action: 'generate', model: config.model, promptVersion: PROMPT_VERSION, userId })
      const started = Date.now()
      let versionId: number
      try {
        const feedback = previous ? `\n<DADOS_PARA_REESCRITA>${JSON.stringify({ previous_script: JSON.parse(previous.script_json), review: parseVideoReview(previous.review_json) })}</DADOS_PARA_REESCRITA>` : ''
        const result = await requestVideoScript(env, basePrompt + feedback)
        const script = videoScriptZod.parse(result.data) as VideoScriptOutput
        script.word_count = countVideoWords(script)
        script.estimated_duration_seconds = estimateVideoSeconds(script.word_count)
        script.segments.forEach(segment => { segment.estimated_seconds = estimateVideoSeconds(segment.dialogue.trim().split(/\s+/).length) })
        await completeVideoAiRun(env, runId, { ...result, output: script })
        versionId = await saveVideoVersion(env, { projectId, runId, script, userId })
      } catch (error) {
        await failVideoAiRun(env, runId, error instanceof Error ? error.message : 'Falha na geração.', Date.now() - started)
        throw error
      }
      const version = await getVideoVersion(env, projectId, versionId)
      if (!version) throw new Error('A versão gerada não foi persistida.')
      const review = await reviewVideoProjectScript(env, projectId, version, userId)
      if (canAutoApproveVideo(parseVideoScript(version.script_json), review)) {
        await markVideoAutomaticallyReady(env, projectId, version, owner)
        return versionId
      }
      previous = { ...version, review_json: JSON.stringify(review) }
    }
    throw new Error('Produção bloqueada após 3 tentativas. Consulte os motivos na checagem da última versão.')
  } finally {
    await releaseVideoPipeline(env, projectId, owner)
  }
}

export async function reviewVideoProjectScript(env: Env, projectId: number, version: VideoVersion, userId: number): Promise<VideoReviewOutput> {
  const project = await getVideoProject(env, projectId)
  if (!project) throw new Error('Projeto de vídeo não encontrado.')
  await assertRunBudget(env)
  const config = await getEditorialAiRuntimeConfig(env)
  const runId = await startVideoAiRun(env, { projectId, action: 'review', model: config.model, promptVersion: PROMPT_VERSION, userId })
  const started = Date.now()
  try {
    const result = await requestVideoReview(env, [
      await buildVideoPrompt(env, project),
      '<ROTEIRO_PARA_CHECAGEM_NAO_CONFIAVEL>', version.script_json, '</ROTEIRO_PARA_CHECAGEM_NAO_CONFIAVEL>'
    ].join('\n'))
    const review = validateVideoEditorialRules(project, parseVideoScript(version.script_json), videoReviewZod.parse(result.data) as VideoReviewOutput)
    await completeVideoAiRun(env, runId, { ...result, output: review })
    await saveVideoReview(env, projectId, version.id, review)
    return review
  } catch (error) {
    await failVideoAiRun(env, runId, error instanceof Error ? error.message : 'Falha na checagem.', Date.now() - started)
    throw error
  }
}

// Legacy callers also run the full automatic gate; a human decision cannot bypass it.
export async function approveVideoProject(env: Env, projectId: number, userId: number): Promise<void> {
  await generateVideoProjectScript(env, projectId, userId)
}
