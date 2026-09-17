export type EngagementCampaignType = 'newsletter' | 'editorial' | 'instagram' | 'advertising'
export type EngagementCampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'archived'
export type EngagementDisplayFormat = 'banner' | 'slide_in' | 'modal'
export type EngagementPageScope = 'all' | 'home' | 'articles' | 'listings' | 'specific'
export type EngagementDevice = 'all' | 'desktop' | 'mobile'
export type EngagementTriggerType = 'delay' | 'scroll' | 'pageviews' | 'exit_intent'
export type EngagementEventType = 'impression' | 'close' | 'click' | 'conversion'

export interface EngagementCampaign {
  id: number
  internal_name: string
  campaign_type: EngagementCampaignType
  status: EngagementCampaignStatus
  display_format: EngagementDisplayFormat
  eyebrow: string | null
  title: string
  body: string | null
  cta_label: string | null
  cta_url: string | null
  image_media_id: number | null
  image_position_x: number
  image_position_y: number
  post_id: number | null
  advertiser_name: string | null
  page_scope: EngagementPageScope
  include_paths_json: string
  exclude_paths_json: string
  devices: EngagementDevice
  trigger_type: EngagementTriggerType
  trigger_value: number
  min_pageviews: number
  cooldown_hours: number
  click_cooldown_hours: number
  max_per_session: number
  max_impressions_30d: number
  priority: number
  starts_at: string | null
  ends_at: string | null
  created_by_user_id: number | null
  created_at: string
  updated_at: string
  published_at: string | null
  archived_at: string | null
  image_r2_key?: string | null
  image_alt?: string | null
  image_filename?: string | null
  image_credits?: string | null
  post_slug?: string | null
  post_title?: string | null
  post_published_at?: string | null
  post_created_at?: string | null
  impressions?: number
  clicks?: number
  conversions?: number
  closes?: number
}

export interface EngagementCampaignInput {
  internalName: string
  campaignType: EngagementCampaignType
  displayFormat: EngagementDisplayFormat
  eyebrow?: string
  title: string
  body?: string
  ctaLabel?: string
  ctaUrl?: string
  imageMediaId?: number | null
  imagePositionX: number
  imagePositionY: number
  postId?: number | null
  advertiserName?: string
  pageScope: EngagementPageScope
  includePaths: string[]
  excludePaths: string[]
  devices: EngagementDevice
  triggerType: EngagementTriggerType
  triggerValue: number
  minPageviews: number
  cooldownHours: number
  clickCooldownHours: number
  maxPerSession: number
  maxImpressions30d: number
  priority: number
  startsAt?: string | null
  endsAt?: string | null
}

export interface PublicEngagementCampaign {
  id: number
  type: EngagementCampaignType
  format: EngagementDisplayFormat
  eyebrow: string
  title: string
  body: string
  ctaLabel: string
  ctaUrl: string
  imageUrl: string | null
  imageAlt: string
  imagePositionX: number
  imagePositionY: number
  advertiserName: string
  trigger: { type: EngagementTriggerType; value: number }
  frequency: {
    minPageviews: number
    cooldownHours: number
    clickCooldownHours: number
    maxPerSession: number
    maxImpressions30d: number
  }
}
