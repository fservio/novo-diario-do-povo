export const WHATSAPP_TOPICS = [
  'principais', 'urgentes', 'politica', 'economia', 'brasil', 'mundo',
  'piaui', 'teresina', 'esportes', 'cultura', 'tecnologia'
] as const

export type WhatsAppTopic = typeof WHATSAPP_TOPICS[number]
export type WhatsAppFrequency = 'breaking' | 'daily' | 'twice_daily'
export type WhatsAppDestinationType = 'group' | 'community' | 'channel'
export type WhatsAppCampaignType = 'digest' | 'breaking' | 'editorial' | 'subscriber' | 'sponsored'

export interface WhatsAppRuntimeConfig {
  enabled: boolean
  apiReady: boolean
  businessNumber: string
  phoneNumberId: string
  wabaId: string
  defaultTemplate: string
  accessTokenConfigured: boolean
  appSecretConfigured: boolean
  verifyTokenConfigured: boolean
}

export interface WhatsAppLead {
  id: number
  token: string
  preferences_json: string
  frequency: WhatsAppFrequency
  source: string
  consent_version: string
  status: 'pending' | 'activated' | 'expired'
  contact_id: number | null
  created_at: string
  expires_at: string
  activated_at: string | null
}

export interface WhatsAppContact {
  id: number
  wa_id: string
  phone_e164: string
  profile_name: string | null
  status: 'active' | 'paused' | 'unsubscribed' | 'blocked'
  preferences_json: string
  frequency: WhatsAppFrequency
  source: string
  consent_at: string
  consent_version: string
  unsubscribe_token: string
  last_inbound_at: string | null
  last_outbound_at: string | null
  created_at: string
  updated_at: string
}

export interface WhatsAppDestination {
  id: number
  name: string
  type: WhatsAppDestinationType
  scope: string | null
  description: string | null
  invite_url: string
  status: 'active' | 'paused' | 'full' | 'archived'
  priority: number
  click_count: number
  created_at: string
  updated_at: string
}

export interface WhatsAppCampaign {
  id: number
  title: string
  campaign_type: WhatsAppCampaignType
  status: 'draft' | 'approved' | 'sending' | 'sent' | 'failed' | 'archived'
  segment_json: string
  message_title: string
  message_body: string
  target_url: string
  template_name: string | null
  template_language: string
  post_id: number | null
  post_title?: string | null
  scheduled_at: string | null
  sent_at: string | null
  created_by_name?: string | null
  approved_by_name?: string | null
  created_at: string
  updated_at: string
  total_deliveries?: number
  sent_deliveries?: number
  read_deliveries?: number
  failed_deliveries?: number
}
