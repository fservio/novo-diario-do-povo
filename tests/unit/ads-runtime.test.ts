import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { generateAdsLoaderScript } from '../../packages/core/ads'
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
    expect(script).toContain("ins.dataset.adLayout = 'in-article'")
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
  })
})
