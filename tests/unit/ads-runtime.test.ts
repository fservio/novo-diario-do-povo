import { describe, expect, it, vi } from 'vitest'
import { runInNewContext } from 'node:vm'
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
    expect(script).toContain("window.matchMedia('(max-width: 768px)')")
    expect(script).toContain('setTimeout(startAds, 2500)')
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

  it('reserves horizontal banner sizes without allowing square full-width expansion', () => {
    const html = renderAdSlot({
      slot: { id: 17, name: 'article_top', template: 'article', provider: 'adsense',
        sizes_json: '[[728,90],[320,100]]', lazy: 0, min_height: 90,
        is_active: 1, adsense_slot_id: '123', adsense_format: 'horizontal' },
      page: { template: 'article' }, user: { isSubscriber: false }
    })
    expect(html).toContain('min-height: 100px')
    expect(html).toContain('width: 320px; height: 100px')
    expect(html).toContain('@container (min-width: 728px)')
    expect(html).toContain('width: 728px; height: 90px')
    expect(html).toContain('data-adsense-fixed-size="1"')
    expect(html).toContain('data-full-width-responsive="false"')
    expect(html).not.toContain('data-ad-format=')
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
    expect(html).toContain('display=optional')
    expect(html).toContain('data-desktop-media="(min-width: 769px)"')
    expect(html).toContain('window.matchMedia(desktopMedia)')
    expect(html).toContain('.ad-slot[data-provider="adsense"]')
    expect(html).toContain('display: block !important')
    expect(html).toContain('.ad-slot[data-ad-slot="home_top_leaderboard"]')
    expect(html).not.toContain('height: 100px !important')
    expect(html).not.toContain('rel="preconnect" href="https://pagead2.googlesyndication.com"')
  })
})


describe('ad visibility scheduling', () => {
  function slot(lazy: boolean, width = 320, top = 0) {
    const ins = { style: {}, dataset: {} }
    const rect = { width, top, bottom: top + 250 }
    return {
      dataset: { provider: 'adsense', adSlot: 'article_inread_1', lazy: lazy ? '1' : '0', adsenseSlot: '123' } as Record<string, string>,
      style: { minHeight: '250px' },
      getBoundingClientRect: () => rect,
      querySelector: () => ins,
      rect
    }
  }

  async function runtime(slots: ReturnType<typeof slot>[], observerSupported = true, readyState = 'complete') {
    const script = await generateAdsLoaderScript(createEnv({
      'ads.provider_mode': 'adsense', 'ads.adsense.client_id': 'ca-pub-123'
    }), 'test')
    const scripts: any[] = []
    const listeners: Record<string, () => void> = {}
    let intersect: (entries: any[]) => void = () => {}
    const observe = vi.fn()
    const unobserve = vi.fn()
    const window: any = {
      matchMedia: () => ({ matches: false }), innerHeight: 800,
      addEventListener: (name: string, fn: () => void) => { listeners[name] = fn },
      removeEventListener: (name: string) => { delete listeners[name] }
    }
    const Observer = class {
      constructor(callback: typeof intersect) { intersect = callback }
      observe = observe
      unobserve = unobserve
    }
    if (observerSupported) window.IntersectionObserver = Observer
    runInNewContext(script.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''), {
      window, IntersectionObserver: Observer,
      document: { readyState, querySelectorAll: () => slots,
        createElement: () => ({}), head: { appendChild: (node: any) => scripts.push(node) } },
      setTimeout
    })
    return { scripts, window, observe, unobserve, listeners, intersect: (target: any) => intersect([{ target, isIntersecting: true }]) }
  }

  it('waits for page load before requesting desktop ads', async () => {
    const eager = slot(false)
    const r = await runtime([eager], true, 'interactive')
    expect(r.scripts).toHaveLength(0)
    expect(eager.dataset.adInitialized).toBeUndefined()
    r.listeners.load()
    expect(r.scripts).toHaveLength(1)
    expect(eager.dataset.adInitialized).toBe('1')
  })

  it('requests eager slots immediately and lazy slots only as they approach the viewport', async () => {
    const eager = slot(false)
    const deferred = slot(true, 320, 3000)
    const r = await runtime([eager, deferred])
    expect(eager.dataset.adInitialized).toBe('1')
    expect(deferred.dataset.adInitialized).toBeUndefined()
    expect(r.observe).toHaveBeenCalledWith(deferred)
    expect(r.scripts).toHaveLength(1)
    r.scripts[0].onload()
    expect(r.window.adsbygoogle).toHaveLength(1)
    r.intersect(deferred)
    r.intersect(deferred)
    expect(r.window.adsbygoogle).toHaveLength(2)
    expect(r.unobserve).toHaveBeenCalledWith(deferred)
  })

  it('preserves fixed-size markup when requesting a horizontal banner', async () => {
    const banner = slot(false)
    banner.dataset.adsenseFixedSize = '1'
    banner.dataset.adsenseFormat = 'horizontal'
    banner.dataset.adSlot = 'article_top'
    const ins = banner.querySelector() as any
    const r = await runtime([banner])
    r.scripts[0].onload()
    expect(ins.dataset.fullWidthResponsive).toBe('false')
    expect(ins.dataset.adFormat).toBeUndefined()
    expect(ins.style.width).toBeUndefined()
    expect(ins.style.minHeight).toBeUndefined()
    expect(r.window.adsbygoogle).toHaveLength(1)
  })

  it('waits for hidden containers to acquire width before sending a request', async () => {
    const hidden = slot(false, 0)
    const r = await runtime([hidden])
    r.intersect(hidden)
    expect(r.scripts).toHaveLength(0)
    expect(hidden.dataset.adInitialized).toBeUndefined()
    hidden.rect.width = 320
    r.intersect(hidden)
    expect(r.scripts).toHaveLength(1)
    expect(hidden.dataset.adInitialized).toBe('1')
  })

  it('supports browsers without IntersectionObserver and releases fallback listeners', async () => {
    const deferred = slot(true, 320, 3000)
    const r = await runtime([deferred], false)
    expect(r.scripts).toHaveLength(0)
    deferred.rect.top = 900
    deferred.rect.bottom = 1150
    r.listeners.scroll()
    expect(r.scripts).toHaveLength(1)
    expect(r.listeners.scroll).toBeUndefined()
    expect(r.listeners.resize).toBeUndefined()
  })
})
