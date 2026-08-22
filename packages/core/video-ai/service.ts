import type { Env } from '../types'
import { getPostById } from '../db/posts'
import { getEditorialAiRuntimeConfig } from '../editorial-ai/openai'
import { sha256Hex } from '../utils/crypto'
import { requestVideoReview, requestVideoScript, videoScriptZod } from './openai'
import {
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

const PROMPT_VERSION = 'video-studio-v1.0'

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
  try { return JSON.parse(value) as VideoReviewOutput } catch { return null }
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

async function buildVideoPrompt(env: Env, project: VideoProject): Promise<string> {
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
    `DURAÇÃO-ALVO: ${project.duration_seconds} segundos; aproximadamente ${targetWords} palavras, com tolerância de 10%.`,
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

export async function generateVideoProjectScript(env: Env, projectId: number, userId: number): Promise<number> {
  const project = await getVideoProject(env, projectId)
  if (!project) throw new Error('Projeto de vídeo não encontrado.')
  if (['approved', 'ready', 'archived'].includes(project.status)) throw new Error('Este projeto está encerrado para geração.')
  await assertRunBudget(env)
  const config = await getEditorialAiRuntimeConfig(env)
  const runId = await startVideoAiRun(env, { projectId, action: 'generate', model: config.model, promptVersion: PROMPT_VERSION, userId })
  const started = Date.now()
  try {
    const result = await requestVideoScript(env, await buildVideoPrompt(env, project))
    const script = { ...result.data }
    const allowedRoles: string[] = []
    if (project.anchor_avatar_id) allowedRoles.push('anchor')
    if (project.reporter_avatar_id) allowedRoles.push('reporter')
    if (project.commentator_avatar_id) allowedRoles.push('commentator')
    const invalidRole = script.segments.find(segment => !allowedRoles.includes(segment.speaker_role))
    if (invalidRole) throw new Error('A IA atribuiu uma fala a uma função que não participa deste projeto. Gere novamente.')
    script.word_count = countVideoWords(script)
    script.estimated_duration_seconds = estimateVideoSeconds(script.word_count)
    await completeVideoAiRun(env, runId, { ...result, output: script })
    return saveVideoVersion(env, { projectId, runId, script, userId })
  } catch (error) {
    await failVideoAiRun(env, runId, error instanceof Error ? error.message : 'Falha na geração.', Date.now() - started)
    throw error
  }
}

export async function reviewVideoProjectScript(env: Env, projectId: number, version: VideoVersion, userId: number): Promise<void> {
  const project = await getVideoProject(env, projectId)
  if (!project) throw new Error('Projeto de vídeo não encontrado.')
  await assertRunBudget(env)
  const config = await getEditorialAiRuntimeConfig(env)
  const runId = await startVideoAiRun(env, { projectId, action: 'review', model: config.model, promptVersion: PROMPT_VERSION, userId })
  const started = Date.now()
  try {
    const result = await requestVideoReview(env, [
      '<MATERIA_FONTE_NAO_CONFIAVEL>', project.source_snapshot_json, '</MATERIA_FONTE_NAO_CONFIAVEL>',
      '<ROTEIRO_PARA_CHECAGEM_NAO_CONFIAVEL>', version.script_json, '</ROTEIRO_PARA_CHECAGEM_NAO_CONFIAVEL>'
    ].join('\n'))
    await completeVideoAiRun(env, runId, { ...result, output: result.data })
    await saveVideoReview(env, projectId, version.id, result.data)
  } catch (error) {
    await failVideoAiRun(env, runId, error instanceof Error ? error.message : 'Falha na checagem.', Date.now() - started)
    throw error
  }
}

export async function approveVideoProject(env: Env, projectId: number, userId: number): Promise<void> {
  const project = await getVideoProject(env, projectId)
  if (!project) throw new Error('Projeto de vídeo não encontrado.')
  const version = await getLatestVideoVersion(env, projectId)
  if (!version) throw new Error('Gere e revise um roteiro antes de aprovar.')
  const review = parseVideoReview(version.review_json)
  if (!review) throw new Error('Execute a checagem automática antes da aprovação.')
  const pending = review.issues.filter(issue => issue.status !== 'confirmed' && issue.human_status !== 'resolved')
  if (pending.length) throw new Error(`Resolva ${pending.length} alerta(s) editorial(is) antes de aprovar.`)
  await setVideoProjectStatus(env, projectId, 'approved', userId)
}
