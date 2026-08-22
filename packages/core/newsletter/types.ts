export type NewsletterCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent'

export interface NewsletterCampaign {
  id: number
  subject: string
  preheader: string | null
  intro_text: string | null
  content_html: string
  segments_json: string | null
  status: NewsletterCampaignStatus
  sent_count: number
  recipient_count: number
  failed_count: number
  scheduled_at: string | null
  sent_at: string | null
  created_by_user_id: number | null
  created_at: string
  updated_at: string | null
}

export interface NewsletterPost {
  id: number
  slug: string
  title: string
  hat: string | null
  excerpt: string | null
  published_at: string | null
  created_at: string
  category_name: string | null
  cover_media_url: string | null
  cover_media_id?: number | null
  position: number
}

export interface NewsletterRecipient {
  id: number
  email: string
  name: string | null
  unsubscribe_token: string | null
}

export interface NewsletterCampaignWithItems extends NewsletterCampaign {
  items: NewsletterPost[]
}

export interface NewsletterDeliveryResult {
  recipient: string
  ok: boolean
  messageId?: string
  error?: string
}
