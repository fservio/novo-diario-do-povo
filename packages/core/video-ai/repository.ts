import type { Env } from '../types'
import type {
  VideoAiRun,
  VideoAvatar,
  VideoAvatarRole,
  VideoProject,
  VideoProjectCreateInput,
  VideoReviewOutput,
  VideoScriptOutput,
  VideoVersion
} from './types'

export async function listVideoAvatars(env: Env, activeOnly = false): Promise<VideoAvatar[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM video_ai_avatars
    ${activeOnly ? 'WHERE is_active = 1' : ''}
    ORDER BY CASE role WHEN 'anchor' THEN 1 WHEN 'reporter' THEN 2 ELSE 3 END, name
  `).all<VideoAvatar>()
  return result.results || []
}

export async function createVideoAvatar(env: Env, input: {
  name: string
  role: VideoAvatarRole
  externalLabel: string
  speakingStyle: string
  pronunciationNotes: string
  userId: number
}): Promise<number> {
  const now = new Date().toISOString()
  const result = await env.DB.prepare(`
    INSERT INTO video_ai_avatars (
      name, role, external_label, speaking_style, pronunciation_notes,
      is_active, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).bind(
    input.name.trim(), input.role, input.externalLabel.trim() || null,
    input.speakingStyle.trim() || null, input.pronunciationNotes.trim() || null,
    input.userId, now, now
  ).run()
  return Number(result.meta.last_row_id)
}

export async function setVideoAvatarActive(env: Env, id: number, active: boolean): Promise<void> {
  await env.DB.prepare('UPDATE video_ai_avatars SET is_active = ?, updated_at = ? WHERE id = ?')
    .bind(active ? 1 : 0, new Date().toISOString(), id).run()
}

const PROJECT_SELECT = `
  SELECT p.*,
    post.title AS post_title, post.status AS post_status, post.updated_at AS post_updated_at,
    anchor.name AS anchor_name, reporter.name AS reporter_name, commentator.name AS commentator_name,
    creator.name AS created_by_name, approver.name AS approved_by_name,
    (SELECT MAX(v.version_number) FROM video_ai_versions v WHERE v.project_id = p.id) AS latest_version_number
  FROM video_ai_projects p
  LEFT JOIN posts post ON post.id = p.post_id
  LEFT JOIN video_ai_avatars anchor ON anchor.id = p.anchor_avatar_id
  LEFT JOIN video_ai_avatars reporter ON reporter.id = p.reporter_avatar_id
  LEFT JOIN video_ai_avatars commentator ON commentator.id = p.commentator_avatar_id
  LEFT JOIN users creator ON creator.id = p.created_by_user_id
  LEFT JOIN users approver ON approver.id = p.approved_by_user_id
`

export async function listVideoProjects(env: Env, limit = 80): Promise<VideoProject[]> {
  const result = await env.DB.prepare(`${PROJECT_SELECT}
    WHERE p.status != 'archived'
    ORDER BY p.updated_at DESC, p.id DESC
    LIMIT ?
  `).bind(Math.max(1, Math.min(200, limit))).all<VideoProject>()
  return result.results || []
}

export async function getVideoProject(env: Env, id: number): Promise<VideoProject | null> {
  return env.DB.prepare(`${PROJECT_SELECT} WHERE p.id = ? LIMIT 1`).bind(id).first<VideoProject>()
}

export async function getVideoProjectStats(env: Env): Promise<Record<string, number>> {
  const result = await env.DB.prepare('SELECT status, COUNT(*) AS total FROM video_ai_projects GROUP BY status')
    .all<{ status: string; total: number }>()
  const stats: Record<string, number> = { draft: 0, review: 0, approved: 0, ready: 0, archived: 0 }
  for (const row of result.results || []) stats[row.status] = Number(row.total || 0)
  return stats
}

export async function createVideoProject(env: Env, input: VideoProjectCreateInput): Promise<number> {
  const now = new Date().toISOString()
  const result = await env.DB.prepare(`
    INSERT INTO video_ai_projects (
      post_id, internal_title, format, status, duration_seconds, orientation, tone,
      target_audience, editorial_instructions, closing_cta,
      anchor_avatar_id, reporter_avatar_id, commentator_avatar_id,
      source_snapshot_json, source_hash, source_updated_at,
      created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.postId, input.internalTitle.trim(), input.format, input.durationSeconds,
    input.orientation, input.tone, input.targetAudience.trim() || null,
    input.editorialInstructions.trim() || null, input.closingCta.trim() || null,
    input.anchorAvatarId, input.reporterAvatarId, input.commentatorAvatarId,
    input.sourceSnapshotJson, input.sourceHash, input.sourceUpdatedAt,
    input.createdByUserId, now, now
  ).run()
  return Number(result.meta.last_row_id)
}

export async function setVideoProjectStatus(env: Env, id: number, status: VideoProject['status'], userId?: number): Promise<void> {
  const now = new Date().toISOString()
  if (status === 'approved') {
    await env.DB.prepare(`
      UPDATE video_ai_projects SET status = 'approved', approved_by_user_id = ?, approved_at = ?, updated_at = ? WHERE id = ?
    `).bind(userId || null, now, now, id).run()
    return
  }
  await env.DB.prepare(`
    UPDATE video_ai_projects SET status = ?, archived_at = CASE WHEN ? = 'archived' THEN ? ELSE archived_at END, updated_at = ? WHERE id = ?
  `).bind(status, status, now, now, id).run()
}

export async function startVideoAiRun(env: Env, input: {
  projectId: number
  action: VideoAiRun['action']
  model: string
  promptVersion: string
  userId: number
}): Promise<number> {
  const result = await env.DB.prepare(`
    INSERT INTO video_ai_runs (project_id, action, model, prompt_version, status, requested_by_user_id, created_at)
    VALUES (?, ?, ?, ?, 'running', ?, ?)
  `).bind(input.projectId, input.action, input.model, input.promptVersion, input.userId, new Date().toISOString()).run()
  return Number(result.meta.last_row_id)
}

export async function completeVideoAiRun(env: Env, id: number, result: {
  output: unknown
  responseId: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  durationMs: number
}): Promise<void> {
  await env.DB.prepare(`
    UPDATE video_ai_runs SET status = 'completed', output_json = ?, provider_response_id = ?, model = ?,
      input_tokens = ?, output_tokens = ?, total_tokens = ?, duration_ms = ?, completed_at = ? WHERE id = ?
  `).bind(
    JSON.stringify(result.output), result.responseId || null, result.model,
    result.inputTokens, result.outputTokens, result.totalTokens, result.durationMs,
    new Date().toISOString(), id
  ).run()
}

export async function failVideoAiRun(env: Env, id: number, error: string, durationMs: number): Promise<void> {
  await env.DB.prepare(`
    UPDATE video_ai_runs SET status = 'failed', error_message = ?, duration_ms = ?, completed_at = ? WHERE id = ?
  `).bind(error.slice(0, 1500), durationMs, new Date().toISOString(), id).run()
}

export async function saveVideoVersion(env: Env, input: {
  projectId: number
  runId: number
  script: VideoScriptOutput
  userId: number
}): Promise<number> {
  const latest = await env.DB.prepare('SELECT MAX(version_number) AS latest FROM video_ai_versions WHERE project_id = ?')
    .bind(input.projectId).first<{ latest: number | null }>()
  const versionNumber = Number(latest?.latest || 0) + 1
  const now = new Date().toISOString()
  const result = await env.DB.prepare(`
    INSERT INTO video_ai_versions (
      project_id, run_id, version_number, script_json, word_count, estimated_seconds,
      created_by_user_id, updated_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.projectId, input.runId, versionNumber, JSON.stringify(input.script),
    input.script.word_count, input.script.estimated_duration_seconds,
    input.userId, input.userId, now, now
  ).run()
  await setVideoProjectStatus(env, input.projectId, 'review')
  return Number(result.meta.last_row_id)
}

export async function listVideoVersions(env: Env, projectId: number): Promise<VideoVersion[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM video_ai_versions WHERE project_id = ? ORDER BY version_number DESC LIMIT 30
  `).bind(projectId).all<VideoVersion>()
  return result.results || []
}

export async function getVideoVersion(env: Env, projectId: number, versionId: number): Promise<VideoVersion | null> {
  return env.DB.prepare('SELECT * FROM video_ai_versions WHERE id = ? AND project_id = ? LIMIT 1')
    .bind(versionId, projectId).first<VideoVersion>()
}

export async function getLatestVideoVersion(env: Env, projectId: number): Promise<VideoVersion | null> {
  return env.DB.prepare(`
    SELECT * FROM video_ai_versions WHERE project_id = ? ORDER BY version_number DESC LIMIT 1
  `).bind(projectId).first<VideoVersion>()
}

export async function updateVideoVersionScript(env: Env, input: {
  projectId: number
  versionId: number
  script: VideoScriptOutput
  userId: number
}): Promise<void> {
  await env.DB.prepare(`
    UPDATE video_ai_versions SET script_json = ?, review_json = NULL, word_count = ?, estimated_seconds = ?,
      is_human_edited = 1, updated_by_user_id = ?, updated_at = ? WHERE id = ? AND project_id = ?
  `).bind(
    JSON.stringify(input.script), input.script.word_count, input.script.estimated_duration_seconds,
    input.userId, new Date().toISOString(), input.versionId, input.projectId
  ).run()
  await setVideoProjectStatus(env, input.projectId, 'review')
}

export async function saveVideoReview(env: Env, projectId: number, versionId: number, review: VideoReviewOutput): Promise<void> {
  const normalized = {
    ...review,
    issues: review.issues.map(issue => ({
      ...issue,
      human_status: issue.status === 'confirmed' ? 'resolved' : 'pending'
    }))
  }
  await env.DB.prepare(`
    UPDATE video_ai_versions SET review_json = ?, updated_at = ? WHERE id = ? AND project_id = ?
  `).bind(JSON.stringify(normalized), new Date().toISOString(), versionId, projectId).run()
}

export async function resolveVideoReviewIssue(env: Env, input: {
  projectId: number
  versionId: number
  issueIndex: number
  note: string
  userId: number
}): Promise<void> {
  const version = await getVideoVersion(env, input.projectId, input.versionId)
  if (!version?.review_json) throw new Error('A checagem desta versão não está disponível.')
  const review = JSON.parse(version.review_json) as VideoReviewOutput
  if (!Array.isArray(review.issues) || !review.issues[input.issueIndex]) throw new Error('Alerta de checagem inválido.')
  review.issues[input.issueIndex] = {
    ...review.issues[input.issueIndex],
    human_status: 'resolved',
    human_note: input.note.trim(),
    reviewed_by_user_id: input.userId,
    reviewed_at: new Date().toISOString()
  }
  await env.DB.prepare('UPDATE video_ai_versions SET review_json = ?, updated_at = ? WHERE id = ? AND project_id = ?')
    .bind(JSON.stringify(review), new Date().toISOString(), input.versionId, input.projectId).run()
}

export async function listVideoAiRuns(env: Env, projectId: number): Promise<VideoAiRun[]> {
  const result = await env.DB.prepare(`
    SELECT r.*, u.name AS requested_by_name FROM video_ai_runs r
    LEFT JOIN users u ON u.id = r.requested_by_user_id
    WHERE r.project_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 30
  `).bind(projectId).all<VideoAiRun>()
  return result.results || []
}
