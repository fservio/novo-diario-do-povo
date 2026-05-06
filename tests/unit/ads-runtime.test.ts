import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { generateAdsLoaderScript, renderAdSlot } from '../../packages/core/ads'
import { renderPublicLayout, type PublicLayoutParams } from '../../packages/core/web/layout'

function createEnv(settings: Record<string, unknown>) {
  return {
    DB: {
      prepare: () => ({
        bind: (_scope: string, ...keys: string[]) => ({
          all: async () => ({
            results: keys
              .filter(key => key in settings)
              .map(key => ({ key, value_json: JSON.stringify(settings[key]) }))
          })
        })
      })
    },
    KV: {
      get: async () => null,
      put: async () => {},
      delete: async () => {}
    }
  } as any
}

describe('Ads runtime', () => {
  it('initializes AdSense slots after the external script is ready', async () => {
    const env = createEnv({
      'ads.provider_mode': 'adsense',
      'ads.consent.enabled': false,
      'ads.adsense.client_id': 'ca-pub-123',
      'ads.gam.network_code': ''
    })

    const script = await generateAdsLoaderScript(env, 'nonce-1')

    expect(script).toContain('script.onload = function()')
    expect(script).toContain('loadAdSenseScript(function()')
    expect(script).toContain("el.querySelector('ins.adsbygoogle')")
    expect(script).toContain("ins.style.width = '100%'")
  })

  it('renders standard AdSense ins markup server-side', () => {
    const html = renderAdSlot({
      slot: {
        id: 1,
        name: 'article_inread_1',
        template: 'article',
        provider: 'adsense',
        sizes_json: '[[300,250]]',
        lazy: 1,
        min_height: 250,
        is_active: 1,
        adsense_slot_id: '9752337983',
        adsense_format: 'auto'
      },
      page: { template: 'article' },
      user: { isSubscriber: false }
    })

    expect(html).toContain('<ins class="adsbygoogle"')
    expect(html).toContain('data-ad-slot="9752337983"')
    expect(html).toContain('data-ad-format="fluid"')
    expect(html).toContain('data-ad-layout="in-article"')
    expect(html).toContain('width: 100%')
  })

  it('allows Google ad traffic quality frames in CSP', () => {
    const source = readFileSync('packages/core/middleware/security.ts', 'utf-8')

    expect(source).toContain('ep1.adtrafficquality.google')
    expect(source).toContain('ep2.adtrafficquality.google')
  })

  it('does not preload a hardcoded Google font file', () => {
    const params: PublicLayoutParams = {
      title: 'Test Page',
      canonicalUrl: 'https://example.com/test',
      siteName: 'Test Site',
      navItems: [],
      bodyHtml: '<div>Test Content</div>'
    }

    const html = renderPublicLayout(params)

    expect(html).not.toContain('UcC7EFIdjxPjmlpbc0Q-QSv_D8w.woff2')
    expect(html).toContain('https://fonts.googleapis.com/css2')
    expect(html).toContain('.ad-slot[data-provider="adsense"]')
    expect(html).toContain('display: block !important')
  })
})
