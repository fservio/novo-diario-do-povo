export type InstagramPublicationStatus =
  | 'draft'
  | 'caption_ready'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'

export interface InstagramSourcePost {
  id: number
  slug: string
  title: string
  hat: string | null
  excerpt: string | null
  content: string
  content_markdown: string | null
  published_at: string | null
  created_at: string
  category_name: string | null
  author_name: string | null
  cover_media_url: string | null
  cover_alt: string | null
  cover_credits: string | null
}

export interface InstagramPublication {
  id: number
  post_id: number
  status: InstagramPublicationStatus
  format: 'feed_4x5'
  template: 'editorial_overlay'
  hat: string | null
  title: string
  subtitle: string | null
  photo_credit: string | null
  caption: string | null
  hashtags: string | null
  alt_text: string | null
  render_token: string
  output_image_url: string | null
  image_position_x: number
  image_position_y: number
  scheduled_at: string | null
  n8n_execution_id: string | null
  meta_container_id: string | null
  meta_media_id: string | null
  permalink: string | null
  last_error: string | null
  version: number
  created_by_user_id: number
  approved_by_user_id: number | null
  approved_at: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  slug: string
  article_title: string
  article_excerpt: string | null
  article_content: string
  article_content_markdown: string | null
  article_published_at: string | null
  article_created_at: string
  category_name: string | null
  author_name: string | null
  cover_media_url: string | null
  cover_alt: string | null
  cover_credits: string | null
  created_by_name: string | null
  approved_by_name: string | null
}

export interface InstagramPublicationAttempt {
  id: number
  publication_id: number
  action: string
  status: string
  provider_reference: string | null
  error_message: string | null
  response_json: string | null
  attempted_at: string
}

export interface InstagramRuntimeConfig {
  captionWebhookUrl: string
  publishWebhookUrl: string
  accountLabel: string
  captionReady: boolean
  publishReady: boolean
}
