export type EditorialSourceKind = 'auto' | 'rss' | 'atom'
export type EditorialTrustLevel = 'official' | 'partner' | 'monitored'
export type EditorialUsagePolicy = 'link_only' | 'summary' | 'licensed'
export type EditorialFeedItemStatus = 'new' | 'shortlisted' | 'in_progress' | 'discarded' | 'converted'
export type EditorialWorkspaceStatus = 'briefing' | 'draft' | 'fact_check' | 'review' | 'approved' | 'archived'
export type EditorialSensitivity = 'normal' | 'sensitive'
export type EditorialClaimStatus = 'confirmed' | 'divergent' | 'unsupported' | 'needs_review' | 'reviewed'

export interface EditorialAiSource {
  id: number
  name: string
  feed_url: string
  site_url: string | null
  source_kind: EditorialSourceKind
  trust_level: EditorialTrustLevel
  usage_policy: EditorialUsagePolicy
  attribution_label: string | null
  allow_full_text: number
  allow_images: number
  requires_noindex: number
  is_active: number
  fetch_interval_minutes: number
  etag: string | null
  last_modified: string | null
  last_fetched_at: string | null
  last_success_at: string | null
  last_error: string | null
  created_by_user_id: number
  created_at: string
  updated_at: string
}

export interface EditorialFeedItem {
  id: number
  source_id: number
  external_guid: string
  source_url: string
  title: string
  summary: string | null
  source_content: string | null
  author: string | null
  published_at: string | null
  image_url: string | null
  fingerprint: string
  status: EditorialFeedItemStatus
  relevance_score: number
  ai_summary: string | null
  ai_topics_json: string | null
  ai_local_angle: string | null
  rights_warning: string | null
  imported_at: string
  updated_at: string
  source_name?: string
  source_site_url?: string | null
  trust_level?: EditorialTrustLevel
  usage_policy?: EditorialUsagePolicy
  requires_noindex?: number
}

export interface EditorialWorkspace {
  id: number
  post_id: number | null
  feed_item_id: number | null
  title: string
  brief: string | null
  status: EditorialWorkspaceStatus
  sensitivity: EditorialSensitivity
  human_approval_required: number
  created_by_user_id: number
  assigned_editor_user_id: number | null
  approved_by_user_id: number | null
  approved_at: string | null
  created_at: string
  updated_at: string
  created_by_name?: string | null
  assigned_editor_name?: string | null
  approved_by_name?: string | null
  post_title?: string | null
  post_status?: string | null
  feed_title?: string | null
  feed_source_url?: string | null
  source_name?: string | null
  usage_policy?: EditorialUsagePolicy | null
  requires_noindex?: number | null
}

export interface EditorialMaterial {
  id: number
  workspace_id: number
  kind: 'note' | 'url' | 'rss' | 'document' | 'interview' | 'official'
  label: string
  source_url: string | null
  content_text: string | null
  media_id: number | null
  rights_basis: 'internal' | 'link_only' | 'quotation' | 'licensed' | 'public_record'
  is_confidential: number
  created_by_user_id: number
  created_at: string
  created_by_name?: string | null
}

export interface EditorialAiRun {
  id: number
  workspace_id: number
  action: 'triage' | 'draft' | 'fact_check' | 'rewrite' | 'seo'
  provider: string
  model: string
  prompt_version: string
  status: 'running' | 'completed' | 'failed'
  input_summary: string | null
  output_json: string | null
  provider_response_id: string | null
  input_tokens: number
  output_tokens: number
  total_tokens: number
  duration_ms: number | null
  error_message: string | null
  requested_by_user_id: number
  requested_by_name?: string | null
  created_at: string
  completed_at: string | null
}

export interface EditorialRevision {
  id: number
  workspace_id: number
  run_id: number | null
  title: string
  hat: string | null
  excerpt: string | null
  content_markdown: string
  seo_title: string | null
  seo_description: string | null
  originality_note: string | null
  created_by_user_id: number
  applied_to_post_at: string | null
  created_at: string
}

export interface EditorialClaim {
  id: number
  workspace_id: number
  revision_id: number | null
  run_id: number | null
  claim_text: string
  evidence_text: string | null
  source_label: string | null
  source_url: string | null
  source_locator: string | null
  status: EditorialClaimStatus
  confidence: number
  reviewer_user_id: number | null
  reviewed_at: string | null
  reviewer_note: string | null
  created_at: string
}

export interface EditorialAiRuntimeConfig {
  enabled: boolean
  apiKeyConfigured: boolean
  model: string
  reasoningEffort: 'none' | 'low' | 'medium' | 'high'
  maxSourceCharacters: number
  maxDailyRuns: number
}

export interface ParsedFeedItem {
  guid: string
  url: string
  title: string
  summary: string
  content: string
  author: string
  publishedAt: string | null
  imageUrl: string | null
}

export interface EditorialTriageOutput {
  summary: string
  topics: string[]
  local_angle: string
  relevance_score: number
  sensitivity: EditorialSensitivity
  risks: string[]
}

export interface EditorialClaimOutput {
  claim: string
  evidence: string
  source_label: string
  source_url: string
  source_locator: string
  status: EditorialClaimStatus
  confidence: number
}

export interface EditorialDraftOutput {
  hat: string
  title: string
  excerpt: string
  content_markdown: string
  seo_title: string
  seo_description: string
  originality_note: string
  claims: EditorialClaimOutput[]
}

export interface EditorialFactCheckOutput {
  overall_assessment: string
  claims: EditorialClaimOutput[]
}

export interface OpenAiStructuredResult<T> {
  data: T
  responseId: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  durationMs: number
}
