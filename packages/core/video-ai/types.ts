export type VideoAvatarRole = 'anchor' | 'reporter' | 'commentator'
export type VideoProjectFormat = 'bulletin' | 'report' | 'explainer' | 'commentary'
export type VideoProjectStatus = 'draft' | 'review' | 'approved' | 'ready' | 'archived'
export type VideoOrientation = 'vertical' | 'horizontal' | 'square'
export type VideoTone = 'factual' | 'didactic' | 'urgent' | 'analytical' | 'conversational'

export interface VideoAvatar {
  id: number
  name: string
  role: VideoAvatarRole
  external_label: string | null
  speaking_style: string | null
  pronunciation_notes: string | null
  is_active: number
  created_by_user_id: number | null
  created_at: string
  updated_at: string
}

export interface VideoProject {
  id: number
  post_id: number
  internal_title: string
  format: VideoProjectFormat
  status: VideoProjectStatus
  duration_seconds: number
  orientation: VideoOrientation
  tone: VideoTone
  target_audience: string | null
  editorial_instructions: string | null
  closing_cta: string | null
  anchor_avatar_id: number | null
  reporter_avatar_id: number | null
  commentator_avatar_id: number | null
  source_snapshot_json: string
  source_hash: string
  source_updated_at: string | null
  created_by_user_id: number | null
  approved_by_user_id: number | null
  approved_at: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
  post_title?: string | null
  post_status?: string | null
  post_updated_at?: string | null
  anchor_name?: string | null
  reporter_name?: string | null
  commentator_name?: string | null
  created_by_name?: string | null
  approved_by_name?: string | null
  latest_version_number?: number | null
}

export interface VideoScriptSegment {
  sequence: number
  speaker_role: VideoAvatarRole
  segment_type: 'opening' | 'transition' | 'report' | 'context' | 'analysis' | 'service' | 'closing'
  dialogue: string
  on_screen_text: string
  visual_cue: string
  estimated_seconds: number
  factual_basis: string[]
}

export interface VideoPronunciationNote {
  term: string
  guidance: string
}

export interface VideoScriptOutput {
  title: string
  summary: string
  estimated_duration_seconds: number
  word_count: number
  disclosure: string
  segments: VideoScriptSegment[]
  pronunciation_notes: VideoPronunciationNote[]
  editorial_notes: string[]
  unresolved_points: string[]
}

export interface VideoReviewIssue {
  severity: 'info' | 'warning' | 'blocking'
  segment_sequence: number
  claim: string
  evidence: string
  status: 'confirmed' | 'divergent' | 'unsupported' | 'needs_review'
  recommendation: string
  human_status?: 'pending' | 'resolved'
  human_note?: string
  reviewed_by_user_id?: number
  reviewed_at?: string
}

export interface VideoReviewOutput {
  overall_assessment: string
  ready_for_human_review: boolean
  issues: VideoReviewIssue[]
}

export interface VideoVersion {
  id: number
  project_id: number
  run_id: number | null
  version_number: number
  script_json: string
  review_json: string | null
  word_count: number
  estimated_seconds: number
  is_human_edited: number
  created_by_user_id: number | null
  updated_by_user_id: number | null
  created_at: string
  updated_at: string
}

export interface VideoAiRun {
  id: number
  project_id: number
  action: 'generate' | 'review'
  provider: string
  model: string
  prompt_version: string
  status: 'running' | 'completed' | 'failed'
  output_json: string | null
  provider_response_id: string | null
  input_tokens: number
  output_tokens: number
  total_tokens: number
  duration_ms: number | null
  error_message: string | null
  requested_by_user_id: number | null
  requested_by_name?: string | null
  created_at: string
  completed_at: string | null
}

export interface VideoProjectCreateInput {
  postId: number
  internalTitle: string
  format: VideoProjectFormat
  durationSeconds: number
  orientation: VideoOrientation
  tone: VideoTone
  targetAudience: string
  editorialInstructions: string
  closingCta: string
  anchorAvatarId: number | null
  reporterAvatarId: number | null
  commentatorAvatarId: number | null
  sourceSnapshotJson: string
  sourceHash: string
  sourceUpdatedAt: string | null
  createdByUserId: number
}

export interface OpenAiVideoResult<T> {
  data: T
  responseId: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  durationMs: number
}
