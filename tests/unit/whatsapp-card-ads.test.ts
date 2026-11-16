import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { renderWhatsAppChannelCta } from '../../packages/core/web/components/whatsapp-channel'
import { generateAdsLoaderScript } from '../../packages/core/ads'

function createEnv(settings: Record<string, unknown>) {
  return {
    DB: {
      prepare: () => ({
        bind: (_scope: string, ...keys: string[]) => ({
          all: async () => ({
            results: keys.filter(key => key in settings).map(key => ({ key, value_json: JSON.stringify(settings[key]) }))
          })
        })
      })
    },
    KV: { get: async () => null, put: async () => {}, delete: async () => {} }
  } as any
}

describe('AdSense automatic placements', () => {
  it('leaves placements in the WhatsApp card to AdSense', () => {
    expect(renderWhatsAppChannelCta()).not.toContain('data-no-auto-ads')
  })

  it('keeps Google placements outside CMS slots', async () => {
    const env = createEnv({
      'ads.provider_mode': 'adsense',
      'ads.consent.enabled': false,
      'ads.adsense.client_id': 'ca-pub-123',
      'ads.gam.network_code': ''
    })
    const html = await generateAdsLoaderScript(env, 'nonce')
    const code = html.replace(/^[\s\S]*?<script[^>]*>/, '').replace(/<\/script>[\s\S]*$/, '')
    const removed: string[] = []
    const autoAd = {
      closest: (selector: string) => selector === '.ad-slot' ? null : { remove: () => removed.push('auto-wrapper') },
      remove: () => removed.push('auto')
    }
    const cmsAd = {
      closest: (selector: string) => selector === '.ad-slot' ? {} : null,
      remove: () => removed.push('cms-slot-removed-by-mistake')
    }
    let observerCallback: (() => void) | null = null
    const document: any = {
      documentElement: {},
      querySelectorAll: (selector: string) => selector.includes('google-auto-placed') ? [autoAd, cmsAd] : [],
      addEventListener: () => {},
      readyState: 'complete',
      createElement: () => ({}),
      head: { appendChild: () => {} }
    }
    const window: any = {
      requestAnimationFrame: (fn: () => void) => fn(),
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {},
      removeEventListener: () => {},
      diarioConsent: { allows: () => true }
    }
    class FakeObserver {
      constructor(callback: () => void) { observerCallback = callback }
      observe() {}
      disconnect() {}
    }
    runInNewContext(code, { window, document, MutationObserver: FakeObserver, setTimeout, console, IntersectionObserver: undefined })
    observerCallback?.()
    expect(removed).toEqual([])
  })
})
