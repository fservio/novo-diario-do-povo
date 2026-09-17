import type { Env } from '../types'
import type {
  EditorialAiRun,
  EditorialAiSource,
  EditorialClaim,
  EditorialClaimOutput,
  EditorialClaimStatus,
  EditorialFeedItem,
  EditorialFeedItemStatus,
  EditorialMaterial,
  EditorialRevision,
  EditorialSensitivity,
  EditorialTriageOutput,
  EditorialUsagePolicy,
  EditorialWorkspace,
  EditorialWorkspaceStatus,
  ParsedFeedItem
} from './types'

export async function listEditorialSources(env: Env): Promise<EditorialAiSource[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM editorial_ai_sources
    ORDER BY is_active DESC, name COLLATE NOCASE ASC
  `).all<EditorialAiSource>()
  return result.results || []
}

export async function listActiveEditorialSources(env: Env, onlyDue = false): Promise<EditorialAiSource[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM editorial_ai_sources
    WHERE is_active = 1
      ${onlyDue ? `AND (
        last_fetched_at IS NULL OR
        datetime(last_fetched_at, '+' || fetch_interval_minutes || ' minutes') <= datetime('now')
      )` : ''}
    ORDER BY COALESCE(last_fetched_at, '1970-01-01') ASC, id ASC
  `).all<EditorialAiSource>()
  return result.results || []
}

export async function getEditorialSource(env: Env, id: number): Promise<EditorialAiSource | null> {
  return env.DB.prepare('SELECT * FROM editorial_ai_sources WHERE id = ? LIMIT 1')
    .bind(id).first<EditorialAiSource>()
}

export async function createEditorialSource(env: Env, input: {
  name: string
  feedUrl: string
  siteUrl?: string
  trustLevel: 'official' | 'partner' | 'monitored'
  usagePolicy: EditorialUsagePolicy
  attributionLabel?: string
  allowFullText: boolean
  allowImages: boolean
  requiresNoindex: boolean
  fetchIntervalMinutes: number
  userId: number
}): Promise<number> {
  const now = new Date().toISOString()
  const result = await env.DB.prepare(`
    INSERT INTO editorial_ai_sources (
      name, feed_url, site_url, trust_level, usage_policy, attribution_label,
      allow_full_text, allow_images, requires_noindex, fetch_interval_minutes,
      created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.name.trim(),
    input.feedUrl,
    input.siteUrl || null,
    input.trustLevel,
    input.usagePolicy,
    input.attributionLabel?.trim() || input.name.trim(),
    input.allowFullText ? 1 : 0,
    input.allowImages ? 1 : 0,
    input.requiresNoindex ? 1 : 0,
    input.fetchIntervalMinutes,
    input.userId,
    now,
    now
  ).run()
  return Number(result.meta.last_row_id)
}

export async function setEditorialSourceActive(env: Env, id: number, active: boolean): Promise<void> {
  await env.DB.prepare(`
    UPDATE editorial_ai_sources SET is_active = ?, updated_at = ? WHERE id = ?
  `).bind(active ? 1 : 0, new Date().toISOString(), id).run()
}

export async function updateEditorialSourceSync(env: Env, id: number, input: {
  success: boolean
  etag?: string | null
  lastModified?: string | null
  error?: string | null
}): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare(`
    UPDATE editorial_ai_sources
    SET etag = COALESCE(?, etag), last_modified = COALESCE(?, last_modified),
        last_fetched_at = ?, last_success_at = CASE WHEN ? = 1 THEN ? ELSE last_success_at END,
        last_error = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    input.etag || null,
    input.lastModified || null,
    now,
    input.success ? 1 : 0,
    now,
    input.success ? null : (input.error || 'Falha desconhecida na leitura do feed.'),
    now,
    id
  ).run()
}

export async function upsertEditorialFeedItem(env: Env, source: EditorialAiSource, item: ParsedFeedItem, fingerprint: string): Promise<boolean> {
  const now = new Date().toISOString()
  const rightsWarning = source.usage_policy === 'licensed'
    ? null
    : source.usage_policy === 'summary'
      ? 'Use apenas como base de apuração e síntese com atribuição. Confirme os termos da fonte.'
      : 'O feed autoriza monitoramento, não republicação. Acrescente apuração e valor editorial original.'

  const insert = await env.DB.prepare(`
    INSERT OR IGNORE INTO editorial_ai_feed_items (
      source_id, external_guid, source_url, title, summary, source_content,
      author, published_at, image_url, fingerprint, rights_warning,
      imported_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    source.id,
    item.guid,
    item.url,
    item.title,
    item.summary || null,
    source.allow_full_text ? (item.content || null) : null,
    item.author || null,
    item.publishedAt,
    source.allow_images ? item.imageUrl : null,
    fingerprint,
    rightsWarning,
    now,
    now
  ).run()

  const inserted = Number(insert.meta.changes || 0) > 0
  if (!inserted) {
    await env.DB.prepare(`
      UPDATE editorial_ai_feed_items
      SET source_url = ?, title = ?, summary = ?,
          source_content = CASE WHEN ? = 1 THEN ? ELSE source_content END,
          author = ?, published_at = ?, image_url = CASE WHEN ? = 1 THEN ? ELSE NULL END,
          fingerprint = ?, rights_warning = ?, updated_at = ?
      WHERE source_id = ? AND external_guid = ?
    `).bind(
      item.url,
      item.title,
      item.summary || null,
      source.allow_full_text,
      item.content || null,
      item.author || null,
      item.publishedAt,
      source.allow_images,
      item.imageUrl,
      fingerprint,
      rightsWarning,
      now,
      source.id,
      item.guid
    ).run()
  }
  return inserted
}

export async function listEditorialFeedItems(env: Env, filters: {
  status?: EditorialFeedItemStatus
  sourceId?: number
  query?: string
  limit?: number
  offset?: number
} = {}): Promise<{ items: EditorialFeedItem[]; total: number }> {
  const where: string[] = []
  const values: unknown[] = []
  if (filters.status) {
    where.push('fi.status = ?')
    values.push(filters.status)
  }
  if (filters.sourceId) {
    where.push('fi.source_id = ?')
    values.push(filters.sourceId)
  }
  if (filters.query?.trim()) {
    where.push('(fi.title LIKE ? OR fi.summary LIKE ? OR s.name LIKE ?)')
    const query = `%${filters.query.trim().slice(0, 120)}%`
    values.push(query, query, query)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM editorial_ai_feed_items fi
    INNER JOIN editorial_ai_sources s ON s.id = fi.source_id
    ${clause}
  `).bind(...values).first<{ total: number }>()
  const limit = Math.max(1, Math.min(100, filters.limit || 40))
  const offset = Math.max(0, filters.offset || 0)
  const result = await env.DB.prepare(`
    SELECT fi.*, s.name AS source_name, s.site_url AS source_site_url,
           s.trust_level, s.usage_policy, s.requires_noindex
    FROM editorial_ai_feed_items fi
    INNER JOIN editorial_ai_sources s ON s.id = fi.source_id
    ${clause}
    ORDER BY COALESCE(fi.published_at, fi.imported_at) DESC, fi.id DESC
    LIMIT ? OFFSET ?
  `).bind(...values, limit, offset).all<EditorialFeedItem>()
  return { items: result.results || [], total: Number(total?.total || 0) }
}

export async function getEditorialFeedItem(env: Env, id: number): Promise<EditorialFeedItem | null> {
  return env.DB.prepare(`
    SELECT fi.*, s.name AS source_name, s.site_url AS source_site_url,
           s.trust_level, s.usage_policy, s.requires_noindex
    FROM editorial_ai_feed_items fi
    INNER JOIN editorial_ai_sources s ON s.id = fi.source_id
    WHERE fi.id = ? LIMIT 1
  `).bind(id).first<EditorialFeedItem>()
}

export async function updateEditorialFeedItemStatus(env: Env, id: number, status: EditorialFeedItemStatus): Promise<void> {
  await env.DB.prepare(`UPDATE editorial_ai_feed_items SET status = ?, updated_at = ? WHERE id = ?`)
    .bind(status, new Date().toISOString(), id).run()
}

export async function createWorkspaceFromFeedItem(env: Env, feedItemId: number, userId: number): Promise<number> {
  const existing = await env.DB.prepare('SELECT id FROM editorial_ai_workspaces WHERE feed_item_id = ? LIMIT 1')
    .bind(feedItemId).first<{ id: number }>()
  if (existing) return existing.id
  const item = await getEditorialFeedItem(env, feedItemId)
  if (!item) throw new Error('Item do radar não encontrado.')
  const now = new Date().toISOString()
  const result = await env.DB.prepare(`
    INSERT INTO editorial_ai_workspaces (
      feed_item_id, title, brief, status, sensitivity, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, 'briefing', 'normal', ?, ?, ?)
  `).bind(
    item.id,
    item.title,
    'Pauta iniciada a partir do Radar de Fontes. A publicação exige apuração e revisão humana.',
    userId,
    now,
    now
  ).run()
  const workspaceId = Number(result.meta.last_row_id)
  await env.DB.prepare(`
    INSERT INTO editorial_ai_materials (
      workspace_id, kind, label, source_url, content_text, rights_basis,
      is_confidential, created_by_user_id, created_at
    ) VALUES (?, 'rss', ?, ?, ?, ?, 0, ?, ?)
  `).bind(
    workspaceId,
    item.source_name || 'Fonte RSS',
    item.source_url,
    [item.title, item.summary, item.source_content].filter(Boolean).join('\n\n'),
    item.usage_policy === 'licensed' ? 'licensed' : 'link_only',
    userId,
    now
  ).run()
  await updateEditorialFeedItemStatus(env, item.id, 'in_progress')
  return workspaceId
}

export async function createWorkspaceForPost(env: Env, postId: number, userId: number): Promise<number> {
  const existing = await env.DB.prepare('SELECT id FROM editorial_ai_workspaces WHERE post_id = ? LIMIT 1')
    .bind(postId).first<{ id: number }>()
  if (existing) return existing.id
  const post = await env.DB.prepare(`
    SELECT id, title, hat, excerpt, content, content_markdown FROM posts WHERE id = ? LIMIT 1
  `).bind(postId).first<{
    id: number; title: string; hat: string | null; excerpt: string | null
    content: string; content_markdown: string | null
  }>()
  if (!post) throw new Error('Matéria não encontrada.')
  const now = new Date().toISOString()
  const result = await env.DB.prepare(`
    INSERT INTO editorial_ai_workspaces (
      post_id, title, brief, status, sensitivity, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, 'briefing', 'normal', ?, ?, ?)
  `).bind(post.id, post.title, 'Espaço de trabalho vinculado à matéria do CMS.', userId, now, now).run()
  const workspaceId = Number(result.meta.last_row_id)
  await env.DB.prepare(`
    INSERT INTO editorial_ai_materials (
      workspace_id, kind, label, content_text, rights_basis, is_confidential,
      created_by_user_id, created_at
    ) VALUES (?, 'note', 'Versão atual da matéria', ?, 'internal', 0, ?, ?)
  `).bind(
    workspaceId,
    [post.hat, post.title, post.excerpt, post.content_markdown || post.content].filter(Boolean).join('\n\n'),
    userId,
    now
  ).run()
  return workspaceId
}

export async function listEditorialWorkspaces(env: Env, limit = 30): Promise<EditorialWorkspace[]> {
  const result = await env.DB.prepare(`
    SELECT w.*, creator.name AS created_by_name, editor.name AS assigned_editor_name,
           approver.name AS approved_by_name, p.title AS post_title, p.status AS post_status,
           fi.title AS feed_title, fi.source_url AS feed_source_url,
           s.name AS source_name, s.usage_policy, s.requires_noindex
    FROM editorial_ai_workspaces w
    LEFT JOIN users creator ON creator.id = w.created_by_user_id
    LEFT JOIN users editor ON editor.id = w.assigned_editor_user_id
    LEFT JOIN users approver ON approver.id = w.approved_by_user_id
    LEFT JOIN posts p ON p.id = w.post_id
    LEFT JOIN editorial_ai_feed_items fi ON fi.id = w.feed_item_id
    LEFT JOIN editorial_ai_sources s ON s.id = fi.source_id
    ORDER BY w.updated_at DESC, w.id DESC
    LIMIT ?
  `).bind(Math.max(1, Math.min(100, limit))).all<EditorialWorkspace>()
  return result.results || []
}

export async function getEditorialWorkspace(env: Env, id: number): Promise<EditorialWorkspace | null> {
  return env.DB.prepare(`
    SELECT w.*, creator.name AS created_by_name, editor.name AS assigned_editor_name,
           approver.name AS approved_by_name, p.title AS post_title, p.status AS post_status,
           fi.title AS feed_title, fi.source_url AS feed_source_url,
           s.name AS source_name, s.usage_policy, s.requires_noindex
    FROM editorial_ai_workspaces w
    LEFT JOIN users creator ON creator.id = w.created_by_user_id
    LEFT JOIN users editor ON editor.id = w.assigned_editor_user_id
    LEFT JOIN users approver ON approver.id = w.approved_by_user_id
    LEFT JOIN posts p ON p.id = w.post_id
    LEFT JOIN editorial_ai_feed_items fi ON fi.id = w.feed_item_id
    LEFT JOIN editorial_ai_sources s ON s.id = fi.source_id
    WHERE w.id = ? LIMIT 1
  `).bind(id).first<EditorialWorkspace>()
}

export async function listEditorialMaterials(env: Env, workspaceId: number): Promise<EditorialMaterial[]> {
  const result = await env.DB.prepare(`
    SELECT m.*, u.name AS created_by_name
    FROM editorial_ai_materials m
    LEFT JOIN users u ON u.id = m.created_by_user_id
    WHERE m.workspace_id = ?
    ORDER BY m.created_at ASC, m.id ASC
  `).bind(workspaceId).all<EditorialMaterial>()
  return result.results || []
}

export async function addEditorialMaterial(env: Env, input: {
  workspaceId: number
  kind: EditorialMaterial['kind']
  label: string
  sourceUrl?: string
  contentText?: string
  rightsBasis: EditorialMaterial['rights_basis']
  confidential: boolean
  userId: number
}): Promise<number> {
  const result = await env.DB.prepare(`
    INSERT INTO editorial_ai_materials (
      workspace_id, kind, label, source_url, content_text, rights_basis,
      is_confidential, created_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.workspaceId,
    input.kind,
    input.label.trim(),
    input.sourceUrl || null,
    input.contentText?.trim() || null,
    input.rightsBasis,
    input.confidential ? 1 : 0,
    input.userId,
    new Date().toISOString()
  ).run()
  await env.DB.prepare('UPDATE editorial_ai_workspaces SET updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), input.workspaceId).run()
  return Number(result.meta.last_row_id)
}

export async function updateEditorialWorkspaceBrief(env: Env, id: number, input: {
  title: string
  brief: string
  sensitivity: EditorialSensitivity
  editorialFormat: EditorialWorkspace['editorial_format']
  editorialDepth: EditorialWorkspace['editorial_depth']
  primaryAngle: string
  targetAudience: string
  geographicScope: string
  requiredInformation: string
  keyQuestions: string
  targetWordCount: number | null
}): Promise<void> {
  await env.DB.prepare(`
    UPDATE editorial_ai_workspaces
    SET title = ?, brief = ?, sensitivity = ?, editorial_format = ?, editorial_depth = ?,
        primary_angle = ?, target_audience = ?, geographic_scope = ?, required_information = ?,
        key_questions = ?, target_word_count = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    input.title.trim(),
    input.brief.trim() || null,
    input.sensitivity,
    input.editorialFormat,
    input.editorialDepth,
    input.primaryAngle.trim() || null,
    input.targetAudience.trim() || null,
    input.geographicScope.trim() || null,
    input.requiredInformation.trim() || null,
    input.keyQuestions.trim() || null,
    input.targetWordCount,
    new Date().toISOString(),
    id
  ).run()
}

export async function setEditorialWorkspaceStatus(env: Env, id: number, status: EditorialWorkspaceStatus, userId?: number): Promise<void> {
  const now = new Date().toISOString()
  if (status === 'approved' && userId) {
    await env.DB.prepare(`
      UPDATE editorial_ai_workspaces
      SET status = 'approved', approved_by_user_id = ?, approved_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(userId, now, now, id).run()
    return
  }
  await env.DB.prepare(`
    UPDATE editorial_ai_workspaces SET status = ?, updated_at = ? WHERE id = ?
  `).bind(status, now, id).run()
}

export async function saveEditorialTriage(env: Env, workspace: EditorialWorkspace, output: EditorialTriageOutput): Promise<void> {
  if (workspace.feed_item_id) {
    await env.DB.prepare(`
      UPDATE editorial_ai_feed_items
      SET ai_summary = ?, ai_topics_json = ?, ai_local_angle = ?, relevance_score = ?,
          status = CASE WHEN status = 'new' THEN 'shortlisted' ELSE status END, updated_at = ?
      WHERE id = ?
    `).bind(
      output.summary,
      JSON.stringify(output.topics),
      output.local_angle,
      Math.max(0, Math.min(100, Math.round(output.relevance_score))),
      new Date().toISOString(),
      workspace.feed_item_id
    ).run()
  }
  await env.DB.prepare(`
    UPDATE editorial_ai_workspaces SET sensitivity = ?, updated_at = ? WHERE id = ?
  `).bind(output.sensitivity, new Date().toISOString(), workspace.id).run()
}

export async function startEditorialAiRun(env: Env, input: {
  workspaceId: number
  action: EditorialAiRun['action']
  model: string
  promptVersion: string
  inputSummary: string
  userId: number
}): Promise<number> {
  const result = await env.DB.prepare(`
    INSERT INTO editorial_ai_runs (
      workspace_id, action, provider, model, prompt_version, status,
      input_summary, requested_by_user_id, created_at
    ) VALUES (?, ?, 'openai', ?, ?, 'running', ?, ?, ?)
  `).bind(
    input.workspaceId,
    input.action,
    input.model,
    input.promptVersion,
    input.inputSummary,
    input.userId,
    new Date().toISOString()
  ).run()
  return Number(result.meta.last_row_id)
}

export async function completeEditorialAiRun(env: Env, id: number, input: {
  output: unknown
  responseId: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  durationMs: number
}): Promise<void> {
  await env.DB.prepare(`
    UPDATE editorial_ai_runs
    SET status = 'completed', output_json = ?, provider_response_id = ?, model = ?,
        input_tokens = ?, output_tokens = ?, total_tokens = ?, duration_ms = ?, completed_at = ?
    WHERE id = ?
  `).bind(
    JSON.stringify(input.output),
    input.responseId || null,
    input.model,
    input.inputTokens,
    input.outputTokens,
    input.totalTokens,
    input.durationMs,
    new Date().toISOString(),
    id
  ).run()
}

export async function failEditorialAiRun(env: Env, id: number, error: string, durationMs: number): Promise<void> {
  await env.DB.prepare(`
    UPDATE editorial_ai_runs
    SET status = 'failed', error_message = ?, duration_ms = ?, completed_at = ?
    WHERE id = ?
  `).bind(error.slice(0, 1500), durationMs, new Date().toISOString(), id).run()
}

export async function listEditorialAiRuns(env: Env, workspaceId: number): Promise<EditorialAiRun[]> {
  const result = await env.DB.prepare(`
    SELECT r.*, u.name AS requested_by_name
    FROM editorial_ai_runs r
    LEFT JOIN users u ON u.id = r.requested_by_user_id
    WHERE r.workspace_id = ?
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT 40
  `).bind(workspaceId).all<EditorialAiRun>()
  return result.results || []
}

export async function saveEditorialRevision(env: Env, input: {
  workspaceId: number
  runId: number
  title: string
  hat: string
  excerpt: string
  contentMarkdown: string
  seoTitle: string
  seoDescription: string
  originalityNote: string
  revisionKind: EditorialRevision['revision_kind']
  editorialPlan: string
  reportingGaps: string[]
  qualityAssessment: string
  claims: EditorialClaimOutput[]
  userId: number
}): Promise<number> {
  const now = new Date().toISOString()
  const result = await env.DB.prepare(`
    INSERT INTO editorial_ai_revisions (
      workspace_id, run_id, title, hat, excerpt, content_markdown,
      seo_title, seo_description, originality_note, revision_kind, editorial_plan,
      reporting_gaps_json, quality_assessment, created_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.workspaceId,
    input.runId,
    input.title,
    input.hat || null,
    input.excerpt || null,
    input.contentMarkdown,
    input.seoTitle || null,
    input.seoDescription || null,
    input.originalityNote || null,
    input.revisionKind,
    input.editorialPlan || null,
    JSON.stringify(input.reportingGaps || []),
    input.qualityAssessment || null,
    input.userId,
    now
  ).run()
  const revisionId = Number(result.meta.last_row_id)
  if (input.claims.length) {
    await env.DB.batch(input.claims.slice(0, 80).map(claim => env.DB.prepare(`
      INSERT INTO editorial_ai_claims (
        workspace_id, revision_id, run_id, claim_text, evidence_text, source_label,
        source_url, source_locator, status, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      input.workspaceId,
      revisionId,
      input.runId,
      claim.claim,
      claim.evidence || null,
      claim.source_label || null,
      claim.source_url || null,
      claim.source_locator || null,
      claim.status,
      Math.max(0, Math.min(100, Math.round(claim.confidence))),
      now
    )))
  }
  await setEditorialWorkspaceStatus(env, input.workspaceId, 'draft')
  return revisionId
}

export async function saveEditorialFactCheck(env: Env, input: {
  workspaceId: number
  revisionId: number
  runId: number
  claims: EditorialClaimOutput[]
}): Promise<void> {
  await env.DB.prepare('DELETE FROM editorial_ai_claims WHERE workspace_id = ? AND revision_id = ?')
    .bind(input.workspaceId, input.revisionId).run()
  const now = new Date().toISOString()
  if (input.claims.length) {
    await env.DB.batch(input.claims.slice(0, 100).map(claim => env.DB.prepare(`
      INSERT INTO editorial_ai_claims (
        workspace_id, revision_id, run_id, claim_text, evidence_text, source_label,
        source_url, source_locator, status, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      input.workspaceId,
      input.revisionId,
      input.runId,
      claim.claim,
      claim.evidence || null,
      claim.source_label || null,
      claim.source_url || null,
      claim.source_locator || null,
      claim.status,
      Math.max(0, Math.min(100, Math.round(claim.confidence))),
      now
    )))
  }
  await setEditorialWorkspaceStatus(env, input.workspaceId, 'fact_check')
}

export async function listEditorialRevisions(env: Env, workspaceId: number): Promise<EditorialRevision[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM editorial_ai_revisions
    WHERE workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT 20
  `).bind(workspaceId).all<EditorialRevision>()
  return result.results || []
}

export async function getEditorialRevision(env: Env, id: number, workspaceId: number): Promise<EditorialRevision | null> {
  return env.DB.prepare(`
    SELECT * FROM editorial_ai_revisions WHERE id = ? AND workspace_id = ? LIMIT 1
  `).bind(id, workspaceId).first<EditorialRevision>()
}

export async function listEditorialClaims(env: Env, workspaceId: number, revisionId?: number): Promise<EditorialClaim[]> {
  const query = revisionId
    ? 'SELECT * FROM editorial_ai_claims WHERE workspace_id = ? AND revision_id = ? ORDER BY id ASC'
    : 'SELECT * FROM editorial_ai_claims WHERE workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT 100'
  const statement = env.DB.prepare(query)
  const result = revisionId
    ? await statement.bind(workspaceId, revisionId).all<EditorialClaim>()
    : await statement.bind(workspaceId).all<EditorialClaim>()
  return result.results || []
}

export async function reviewEditorialClaim(env: Env, input: {
  workspaceId: number
  claimId: number
  status: EditorialClaimStatus
  note?: string
  userId: number
}): Promise<void> {
  await env.DB.prepare(`
    UPDATE editorial_ai_claims
    SET status = ?, reviewer_note = ?, reviewer_user_id = ?, reviewed_at = ?
    WHERE id = ? AND workspace_id = ?
  `).bind(
    input.status,
    input.note?.trim() || null,
    input.userId,
    new Date().toISOString(),
    input.claimId,
    input.workspaceId
  ).run()
  await env.DB.prepare(`
    UPDATE editorial_ai_workspaces
    SET status = 'review', updated_at = ?
    WHERE id = ? AND status = 'fact_check'
      AND NOT EXISTS (
        SELECT 1 FROM editorial_ai_claims
        WHERE workspace_id = ?
          AND revision_id = (
            SELECT id FROM editorial_ai_revisions
            WHERE workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT 1
          )
          AND (reviewer_user_id IS NULL OR status IN ('needs_review', 'divergent', 'unsupported'))
      )
  `).bind(new Date().toISOString(), input.workspaceId, input.workspaceId, input.workspaceId).run()
}

export async function markRevisionApplied(env: Env, revisionId: number, workspaceId: number, postId: number): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare(`UPDATE editorial_ai_revisions SET applied_to_post_at = ? WHERE id = ? AND workspace_id = ?`)
      .bind(now, revisionId, workspaceId),
    env.DB.prepare(`UPDATE editorial_ai_workspaces SET post_id = ?, status = 'review', updated_at = ? WHERE id = ?`)
      .bind(postId, now, workspaceId),
    env.DB.prepare(`
      UPDATE editorial_ai_feed_items SET status = 'converted', updated_at = ?
      WHERE id = (SELECT feed_item_id FROM editorial_ai_workspaces WHERE id = ?)
    `).bind(now, workspaceId)
  ])
}

export async function getEditorialAiStats(env: Env): Promise<Record<string, number>> {
  const [feeds, workspaces, runs] = await Promise.all([
    env.DB.prepare(`SELECT status, COUNT(*) AS total FROM editorial_ai_feed_items GROUP BY status`).all<{ status: string; total: number }>(),
    env.DB.prepare(`SELECT status, COUNT(*) AS total FROM editorial_ai_workspaces GROUP BY status`).all<{ status: string; total: number }>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS runs, COALESCE(SUM(total_tokens), 0) AS tokens
      FROM editorial_ai_runs WHERE created_at >= datetime('now', '-30 days')
    `).first<{ runs: number; tokens: number }>()
  ])
  const stats: Record<string, number> = { feed_total: 0, workspace_total: 0, runs_30d: runs?.runs || 0, tokens_30d: runs?.tokens || 0 }
  for (const row of feeds.results || []) {
    stats[`feed_${row.status}`] = Number(row.total)
    stats.feed_total += Number(row.total)
  }
  for (const row of workspaces.results || []) {
    stats[`workspace_${row.status}`] = Number(row.total)
    stats.workspace_total += Number(row.total)
  }
  return stats
}
