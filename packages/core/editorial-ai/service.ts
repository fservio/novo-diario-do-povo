import type { Env } from '../types'
import { logAudit } from '../db'
import { createPost, getPostById, updatePost } from '../db/posts'
import { sha256Hex } from '../utils/crypto'
import { fetchEditorialFeed } from './rss'
import {
  completeEditorialAiRun,
  failEditorialAiRun,
  getEditorialRevision,
  getEditorialSource,
  getEditorialWorkspace,
  listActiveEditorialSources,
  listEditorialMaterials,
  listEditorialRevisions,
  markRevisionApplied,
  saveEditorialFactCheck,
  saveEditorialRevision,
  saveEditorialTriage,
  setEditorialWorkspaceStatus,
  startEditorialAiRun,
  updateEditorialSourceSync,
  upsertEditorialFeedItem
} from './repository'
import {
  getEditorialAiRuntimeConfig,
  requestEditorialDraft,
  requestEditorialFactCheck,
  requestEditorialTriage
} from './openai'
import type { EditorialAiSource, EditorialMaterial, EditorialWorkspace } from './types'

const PROMPT_VERSION = 'editorial-v1.0'

function assertWorkspaceMutable(workspace: EditorialWorkspace): void {
  if (workspace.status === 'approved' || workspace.status === 'archived') {
    throw new Error('Esta pauta está encerrada e não pode mais ser alterada.')
  }
}

function cleanPromptValue(value: string, maxLength: number): string {
  return value.replace(/\u0000/g, '').trim().slice(0, maxLength)
}

async function assertDailyRunBudget(env: Env): Promise<void> {
  const config = await getEditorialAiRuntimeConfig(env)
  const count = await env.DB.prepare(`
    SELECT COUNT(*) AS total FROM editorial_ai_runs
    WHERE created_at >= datetime('now', '-24 hours')
  `).first<{ total: number }>()
  if (Number(count?.total || 0) >= config.maxDailyRuns) {
    throw new Error(`O limite editorial de ${config.maxDailyRuns} operações de IA em 24 horas foi atingido.`)
  }
}

async function buildSourcePackage(env: Env, workspace: EditorialWorkspace): Promise<{
  prompt: string
  included: number
  excludedConfidential: number
}> {
  const [materials, config] = await Promise.all([
    listEditorialMaterials(env, workspace.id),
    getEditorialAiRuntimeConfig(env)
  ])
  let remaining = config.maxSourceCharacters
  let included = 0
  let excludedConfidential = 0
  const blocks: string[] = []
  for (const material of materials) {
    if (material.is_confidential) {
      excludedConfidential++
      continue
    }
    if (remaining <= 0) break
    const content = cleanPromptValue(material.content_text || '', Math.min(remaining, 30000))
    if (!content && !material.source_url) continue
    const block = [
      `[FONTE ${included + 1}]`,
      `Rótulo: ${cleanPromptValue(material.label, 500)}`,
      `Tipo: ${material.kind}`,
      `Direitos informados: ${material.rights_basis}`,
      material.source_url ? `URL: ${material.source_url}` : '',
      '--- INÍCIO DO CONTEÚDO NÃO CONFIÁVEL ---',
      content || '[Apenas URL cadastrada; não usar como evidência textual.]',
      '--- FIM DO CONTEÚDO NÃO CONFIÁVEL ---'
    ].filter(Boolean).join('\n')
    blocks.push(block)
    included++
    remaining -= content.length
  }
  if (!blocks.length) throw new Error('Adicione pelo menos uma fonte não confidencial com conteúdo antes de usar a IA.')
  return {
    prompt: blocks.join('\n\n'),
    included,
    excludedConfidential
  }
}

async function recordRun<T>(env: Env, input: {
  workspace: EditorialWorkspace
  action: 'triage' | 'draft' | 'fact_check'
  userId: number
  inputSummary: string
  execute: () => Promise<{
    data: T
    responseId: string
    model: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    durationMs: number
  }>
}): Promise<{ runId: number; output: T }> {
  await assertDailyRunBudget(env)
  const config = await getEditorialAiRuntimeConfig(env)
  const runId = await startEditorialAiRun(env, {
    workspaceId: input.workspace.id,
    action: input.action,
    model: config.model,
    promptVersion: PROMPT_VERSION,
    inputSummary: input.inputSummary,
    userId: input.userId
  })
  const started = Date.now()
  try {
    const result = await input.execute()
    await completeEditorialAiRun(env, runId, {
      output: result.data,
      responseId: result.responseId,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      durationMs: result.durationMs
    })
    return { runId, output: result.data }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida na operação de IA.'
    await failEditorialAiRun(env, runId, message, Date.now() - started)
    throw error
  }
}

export async function syncEditorialSource(env: Env, sourceId: number): Promise<{ imported: number; read: number; notModified: boolean }> {
  const source = await getEditorialSource(env, sourceId)
  if (!source) throw new Error('Fonte não encontrada.')
  if (!source.is_active) throw new Error('Esta fonte está desativada.')
  try {
    const fetched = await fetchEditorialFeed(source)
    let imported = 0
    for (const item of fetched.items) {
      const fingerprint = await sha256Hex(`${item.title.toLowerCase()}\n${item.url}\n${item.publishedAt || ''}`)
      if (await upsertEditorialFeedItem(env, source, item, fingerprint)) imported++
    }
    await updateEditorialSourceSync(env, source.id, {
      success: true,
      etag: fetched.etag,
      lastModified: fetched.lastModified
    })
    return { imported, read: fetched.items.length, notModified: fetched.notModified }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao sincronizar a fonte.'
    await updateEditorialSourceSync(env, source.id, { success: false, error: message })
    throw error
  }
}

export async function syncAllEditorialSources(env: Env, options: { respectInterval?: boolean } = {}): Promise<{
  sources: number
  imported: number
  failures: Array<{ sourceId: number; name: string; error: string }>
}> {
  const sources = (await listActiveEditorialSources(env, options.respectInterval === true)).slice(0, 30)
  let imported = 0
  const failures: Array<{ sourceId: number; name: string; error: string }> = []
  for (let index = 0; index < sources.length; index += 3) {
    const batch = sources.slice(index, index + 3)
    const results = await Promise.allSettled(batch.map(source => syncEditorialSource(env, source.id)))
    results.forEach((result, offset) => {
      const source = batch[offset]
      if (!source) return
      if (result.status === 'fulfilled') imported += result.value.imported
      else failures.push({
        sourceId: source.id,
        name: source.name,
        error: result.reason instanceof Error ? result.reason.message : 'Falha desconhecida.'
      })
    })
  }
  return { sources: sources.length, imported, failures }
}

export async function runEditorialTriage(env: Env, workspaceId: number, userId: number): Promise<void> {
  const workspace = await getEditorialWorkspace(env, workspaceId)
  if (!workspace) throw new Error('Pauta não encontrada.')
  assertWorkspaceMutable(workspace)
  const sources = await buildSourcePackage(env, workspace)
  const prompt = [
    `PAUTA: ${workspace.title}`,
    `ORIENTAÇÃO: ${workspace.brief || 'Sem orientação adicional.'}`,
    'Analise o valor jornalístico, temas, possível impacto para o público do Diário do Povo e riscos.',
    sources.prompt
  ].join('\n\n')
  const run = await recordRun(env, {
    workspace,
    action: 'triage',
    userId,
    inputSummary: `${sources.included} fontes; ${sources.excludedConfidential} confidenciais excluídas`,
    execute: () => requestEditorialTriage(env, prompt)
  })
  await saveEditorialTriage(env, workspace, run.output)
  await logAudit(env, {
    entityType: 'editorial_ai_workspace', entityId: workspace.id, action: 'ai_triage',
    actorType: 'user', actorId: userId, details: { runId: run.runId, sourceCount: sources.included }
  })
}

export async function runEditorialDraft(env: Env, workspaceId: number, userId: number, format: string): Promise<number> {
  const workspace = await getEditorialWorkspace(env, workspaceId)
  if (!workspace) throw new Error('Pauta não encontrada.')
  assertWorkspaceMutable(workspace)
  const sources = await buildSourcePackage(env, workspace)
  const allowedFormats: Record<string, string> = {
    news: 'notícia factual objetiva',
    report: 'reportagem contextualizada',
    explainer: 'explicador de serviço',
    rewrite: 'reescrita editorial com estrutura original e atribuição explícita'
  }
  const requestedFormat = allowedFormats[format] || allowedFormats.news
  const rightsRule = workspace.usage_policy === 'licensed'
    ? 'Há indicação de conteúdo licenciado; ainda assim preserve atribuição e não invente permissões.'
    : 'A fonte não está marcada como licença integral. Não faça paráfrase cosmética: produza uma síntese original, explicite a origem e indique o que ainda exige apuração própria.'
  const prompt = [
    `PAUTA: ${workspace.title}`,
    `ORIENTAÇÃO DO JORNALISTA: ${workspace.brief || 'Sem orientação adicional.'}`,
    `FORMATO: ${requestedFormat}`,
    `SENSIBILIDADE: ${workspace.sensitivity}`,
    rightsRule,
    'O corpo deve começar pelo fato mais relevante, preservar atribuições e não conter chamadas à publicação automática.',
    sources.prompt
  ].join('\n\n')
  const run = await recordRun(env, {
    workspace,
    action: 'draft',
    userId,
    inputSummary: `${sources.included} fontes; formato ${format}; ${sources.excludedConfidential} confidenciais excluídas`,
    execute: () => requestEditorialDraft(env, prompt)
  })
  const revisionId = await saveEditorialRevision(env, {
    workspaceId,
    runId: run.runId,
    title: run.output.title,
    hat: run.output.hat,
    excerpt: run.output.excerpt,
    contentMarkdown: run.output.content_markdown,
    seoTitle: run.output.seo_title,
    seoDescription: run.output.seo_description,
    originalityNote: run.output.originality_note,
    claims: run.output.claims,
    userId
  })
  await logAudit(env, {
    entityType: 'editorial_ai_workspace', entityId: workspace.id, action: 'ai_draft',
    actorType: 'user', actorId: userId, details: { runId: run.runId, revisionId, format }
  })
  return revisionId
}

export async function runEditorialFactCheck(env: Env, workspaceId: number, userId: number, revisionId?: number): Promise<void> {
  const workspace = await getEditorialWorkspace(env, workspaceId)
  if (!workspace) throw new Error('Pauta não encontrada.')
  assertWorkspaceMutable(workspace)
  const revisions = await listEditorialRevisions(env, workspaceId)
  const selectedId = revisionId || revisions[0]?.id
  if (!selectedId) throw new Error('Gere um rascunho antes de iniciar a checagem.')
  const revision = await getEditorialRevision(env, selectedId, workspaceId)
  if (!revision) throw new Error('Versão editorial não encontrada.')
  const sources = await buildSourcePackage(env, workspace)
  const prompt = [
    `PAUTA: ${workspace.title}`,
    'RASCUNHO A CHECAR:',
    '--- INÍCIO DO RASCUNHO ---',
    cleanPromptValue([revision.hat, revision.title, revision.excerpt, revision.content_markdown].filter(Boolean).join('\n\n'), 70000),
    '--- FIM DO RASCUNHO ---',
    'FONTES DISPONÍVEIS PARA EVIDÊNCIA:',
    sources.prompt
  ].join('\n\n')
  const run = await recordRun(env, {
    workspace,
    action: 'fact_check',
    userId,
    inputSummary: `revisão ${revision.id}; ${sources.included} fontes; ${sources.excludedConfidential} confidenciais excluídas`,
    execute: () => requestEditorialFactCheck(env, prompt)
  })
  await saveEditorialFactCheck(env, {
    workspaceId,
    revisionId: revision.id,
    runId: run.runId,
    claims: run.output.claims
  })
  await logAudit(env, {
    entityType: 'editorial_ai_workspace', entityId: workspace.id, action: 'ai_fact_check',
    actorType: 'user', actorId: userId,
    details: { runId: run.runId, revisionId: revision.id, overallAssessment: run.output.overall_assessment }
  })
}

export async function applyEditorialRevisionToPost(env: Env, input: {
  workspaceId: number
  revisionId: number
  categoryId: number
  authorId: number
  userId: number
}): Promise<number> {
  const [workspace, revision, category, author] = await Promise.all([
    getEditorialWorkspace(env, input.workspaceId),
    getEditorialRevision(env, input.revisionId, input.workspaceId),
    env.DB.prepare('SELECT id FROM categories WHERE id = ? AND is_active = 1').bind(input.categoryId).first(),
    env.DB.prepare('SELECT id FROM authors WHERE id = ? AND is_active = 1').bind(input.authorId).first()
  ])
  if (!workspace || !revision) throw new Error('Pauta ou versão não encontrada.')
  assertWorkspaceMutable(workspace)
  if (!category) throw new Error('Selecione uma editoria válida.')
  if (!author) throw new Error('Selecione um autor válido.')
  if (workspace.usage_policy !== 'licensed' && (revision.originality_note || '').trim().length < 20) {
    throw new Error('A versão precisa registrar o valor editorial original antes de seguir ao CMS.')
  }

  let postId = workspace.post_id
  if (postId) {
    const post = await getPostById(env.DB, postId)
    if (!post) throw new Error('A matéria vinculada não existe mais.')
    await updatePost(env.DB, postId, {
      title: revision.title,
      hat: revision.hat || '',
      excerpt: revision.excerpt || '',
      content_markdown: revision.content_markdown,
      category_id: input.categoryId,
      author_id: input.authorId,
      seo_title: revision.seo_title || '',
      seo_description: revision.seo_description || '',
      seo_noindex: workspace.requires_noindex ? 1 : post.seo_noindex
    })
  } else {
    postId = await createPost(env.DB, {
      title: revision.title,
      hat: revision.hat || '',
      excerpt: revision.excerpt || '',
      content: revision.content_markdown,
      content_markdown: revision.content_markdown,
      category_id: input.categoryId,
      author_id: input.authorId,
      seo_title: revision.seo_title || '',
      seo_description: revision.seo_description || '',
      seo_noindex: workspace.requires_noindex ? 1 : 0,
      original_link: workspace.feed_source_url || undefined
    })
  }
  await markRevisionApplied(env, revision.id, workspace.id, postId)
  await logAudit(env, {
    entityType: 'post', entityId: postId, action: 'editorial_ai_revision_applied',
    actorType: 'user', actorId: input.userId,
    details: { workspaceId: workspace.id, revisionId: revision.id, remainsDraft: true }
  })
  return postId
}

export async function approveEditorialWorkspace(env: Env, workspaceId: number, userId: number): Promise<void> {
  const workspace = await getEditorialWorkspace(env, workspaceId)
  if (!workspace) throw new Error('Pauta não encontrada.')
  assertWorkspaceMutable(workspace)
  const revisions = await listEditorialRevisions(env, workspaceId)
  const latestRevision = revisions[0]
  if (!latestRevision) throw new Error('Gere e revise uma versão antes da aprovação editorial.')
  const unresolved = await env.DB.prepare(`
    SELECT COUNT(*) AS total FROM editorial_ai_claims
    WHERE workspace_id = ? AND revision_id = ?
      AND (reviewer_user_id IS NULL OR status IN ('needs_review', 'divergent', 'unsupported'))
  `).bind(workspaceId, latestRevision.id).first<{ total: number }>()
  if (Number(unresolved?.total || 0) > 0) {
    throw new Error(`Ainda existem ${unresolved?.total} afirmações que exigem decisão humana.`)
  }
  await setEditorialWorkspaceStatus(env, workspaceId, 'approved', userId)
  await logAudit(env, {
    entityType: 'editorial_ai_workspace', entityId: workspaceId, action: 'approved',
    actorType: 'user', actorId: userId, details: { humanApproval: true }
  })
}

export function describeSourcePolicy(source: EditorialAiSource | { usage_policy?: string | null }): string {
  if (source.usage_policy === 'licensed') return 'Conteúdo licenciado: respeite atribuição e condições contratuais.'
  if (source.usage_policy === 'summary') return 'Síntese permitida: atribua a origem e acrescente contexto próprio.'
  return 'Monitoramento por link: use como pauta; não publique uma paráfrase automática.'
}

export function materialCanBeSentToAi(material: EditorialMaterial): boolean {
  return material.is_confidential !== 1
}
