import { describe, expect, it } from 'vitest'
import {
  campaignMatchesRequest,
  classifyPublicPath,
  normalizePathRule,
  pathMatchesRule
} from '../../packages/core/engagement'
import type { EngagementCampaign } from '../../packages/core/engagement'
import { parseEngagementCampaignInput } from '../../packages/core/engagement/validation'
import { renderEditorialLayout } from '../../packages/core/web/layout-editorial'

function campaign(overrides: Partial<EngagementCampaign> = {}): EngagementCampaign {
  return {
    id: 1, internal_name: 'Newsletter', campaign_type: 'newsletter', status: 'active', display_format: 'slide_in',
    eyebrow: 'Newsletter', title: 'Receba o Diário', body: 'Notícias essenciais.', cta_label: 'Quero receber', cta_url: null,
    image_media_id: null, image_position_x: 50, image_position_y: 50, post_id: null, advertiser_name: null, page_scope: 'all', include_paths_json: '[]',
    exclude_paths_json: '["/assinar*","/conta*"]', devices: 'all', trigger_type: 'scroll', trigger_value: 40,
    min_pageviews: 2, cooldown_hours: 168, click_cooldown_hours: 336, max_per_session: 1,
    max_impressions_30d: 2, priority: 50, starts_at: null, ends_at: null, created_by_user_id: 1,
    created_at: '2026-08-21T12:00:00.000Z', updated_at: '2026-08-21T12:00:00.000Z', published_at: null, archived_at: null,
    ...overrides
  }
}

describe('engagement campaign targeting', () => {
  it('classifies public pages and excludes account or application flows', () => {
    expect(classifyPublicPath('/')).toBe('home')
    expect(classifyPublicPath('/2026/08/21/materia/')).toBe('article')
    expect(classifyPublicPath('/categoria/politica')).toBe('listing')
    expect(classifyPublicPath('/conta')).toBe('excluded')
    expect(classifyPublicPath('/admin/posts')).toBe('excluded')
  })

  it('supports exact and prefix path rules', () => {
    expect(normalizePathRule('categoria/politica*')).toBe('/categoria/politica*')
    expect(pathMatchesRule('/categoria/politica/nacional', '/categoria/politica*')).toBe(true)
    expect(pathMatchesRule('/categoria/economia', '/categoria/politica*')).toBe(false)
  })

  it('honours scope, device and exclusions before returning a campaign', () => {
    expect(campaignMatchesRequest(campaign(), '/2026/08/21/materia/', 'mobile')).toBe(true)
    expect(campaignMatchesRequest(campaign(), '/assinar', 'desktop')).toBe(false)
    expect(campaignMatchesRequest(campaign({ devices: 'desktop' }), '/', 'mobile')).toBe(false)
    expect(campaignMatchesRequest(campaign({ page_scope: 'articles' }), '/', 'desktop')).toBe(false)
    expect(campaignMatchesRequest(campaign({ page_scope: 'specific', include_paths_json: '["/categoria/politica*"]' }), '/categoria/politica', 'desktop')).toBe(true)
  })
})

describe('engagement public runtime', () => {
  it('is loaded deferred by the premium editorial layout', () => {
    const html = renderEditorialLayout({
      title: 'Diário do Povo', bodyHtml: '<article>Notícia</article>', baseUrl: 'https://example.com', siteName: 'Diário do Povo', nonce: 'test', navItems: []
    })
    expect(html).toContain('/static/engagement.css')
    expect(html).toContain('<script src="/static/engagement.js')
    expect(html).toContain('defer')
  })
})

function campaignBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    campaign_type: 'newsletter', internal_name: 'Campanha de teste', display_format: 'slide_in',
    eyebrow: 'Diário do Povo', title: 'Uma chamada editorial', body: 'Texto de apoio.', cta_label: 'Saiba mais',
    image_media_id: '', image_position_x: '50', image_position_y: '50', page_scope: 'all',
    include_paths: '', exclude_paths: '', devices: 'all', trigger_type: 'scroll', trigger_value: '40',
    min_pageviews: '2', cooldown_hours: '168', click_cooldown_hours: '336', max_per_session: '1',
    max_impressions_30d: '2', priority: '50', starts_at: '', ends_at: '', ...overrides
  }
}

describe('engagement objective validation', () => {
  it('keeps newsletter as an email-capture action and strips unrelated destinations', () => {
    const parsed = parseEngagementCampaignInput(campaignBody({ cta_url: 'https://example.com', post_id: '44', advertiser_name: 'Marca' }))
    expect(parsed.campaignType).toBe('newsletter')
    expect(parsed.ctaUrl).toBe('')
    expect(parsed.postId).toBeNull()
    expect(parsed.advertiserName).toBeUndefined()
  })

  it('requires a published-post selection payload for editorial campaigns', () => {
    expect(() => parseEngagementCampaignInput(campaignBody({ campaign_type: 'editorial', post_id: '' }))).toThrow('Selecione uma matéria publicada')
    expect(parseEngagementCampaignInput(campaignBody({ campaign_type: 'editorial', post_id: '12' })).postId).toBe(12)
  })

  it('accepts only Instagram destinations for Instagram campaigns', () => {
    expect(() => parseEngagementCampaignInput(campaignBody({ campaign_type: 'instagram', cta_url: 'https://example.com/perfil' }))).toThrow('Instagram')
    expect(parseEngagementCampaignInput(campaignBody({ campaign_type: 'instagram', cta_url: 'https://www.instagram.com/diariodopovo/' })).ctaUrl).toContain('instagram.com')
  })

  it('requires advertiser identification and an HTTPS destination', () => {
    expect(() => parseEngagementCampaignInput(campaignBody({ campaign_type: 'advertising', advertiser_name: 'Marca', cta_url: 'http://example.com' }))).toThrow('HTTPS')
    const parsed = parseEngagementCampaignInput(campaignBody({ campaign_type: 'advertising', advertiser_name: 'Marca', cta_url: 'https://example.com/campanha' }))
    expect(parsed.advertiserName).toBe('Marca')
  })
})
