import { describe, expect, it, vi } from 'vitest'
import { runInNewContext } from 'node:vm'
import { renderLiveBlogScript, renderLiveBlogTimeline } from '../../packages/core/web/liveblog'
import { listPosts } from '../../packages/core/db/posts'
import { renderPostFormPage } from '../../packages/core/admin/posts'
import { renderMarkdownToHtml } from '../../packages/core/render/sanitize'

describe('liveblog', () => {
  it('shows updates saved in the article body even without timeline blocks', () => {
    const html = renderLiveBlogTimeline([], true, '<p>Primeira atualização</p><p><strong>Nova apuração</strong></p>')
    expect(html).toContain('<strong>Nova apuração</strong>')
    expect(html).not.toContain('Aguardando atualizações')
    expect(html).not.toContain('Ainda não há atualizações')
  })

  it('starts a new coverage with the liveblog template and live status selected', () => {
    const html = renderPostFormPage({ categories: [], authors: [], tags: [], user: { id: 1, name: 'Editor', role: 'admin' } as any, csrfToken: 'csrf', cspNonce: 'nonce', defaultTemplate: 'liveblog' })
    expect(html).toContain('value="liveblog" selected')
    expect(html).toMatch(/name="is_live"\s+value="1"\s+checked/)
  })

  it('renders formatted update content and removes executable markup', () => {
    const html = renderLiveBlogTimeline([{ id: 1, title: '<unsafe>', content: renderMarkdownToHtml('**Confirmado**') + '<script>alert(1)</script>', published_at: '2026-10-25T12:00:00Z' } as any])
    expect(html).toContain('<strong>Confirmado</strong>')
    expect(html).toContain('&lt;unsafe&gt;')
    expect(html).not.toContain('<script>')
  })

  it('renders an empty feed that can receive the first update', () => {
    expect(renderLiveBlogTimeline([], true)).toContain('id="liveblog-feed"')
    expect(renderLiveBlogTimeline([], false)).toContain('Cobertura encerrada')
  })

  it('waits for the DOM, refreshes the feed and stops when coverage ends', async () => {
    const feed = { outerHTML: '' }
    const handlers: Record<string, () => void> = {}
    let tick: () => Promise<void>
    const clearInterval = vi.fn()
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      success: true, data: [{ id: 1 }], is_live: true, html: '<section>first update</section>'
    }) })
    const html = renderLiveBlogScript('eleição', 'test-nonce')
    expect(html).toContain('nonce="test-nonce"')
    runInNewContext(html.replace(/^\s*<script[^>]*>/, '').replace(/<\/script>\s*$/, ''), {
      document: { readyState: 'loading', addEventListener: (event: string, fn: () => void) => { handlers[event] = fn }, getElementById: () => feed },
      window: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
      fetch, setInterval: (fn: () => Promise<void>) => { tick = fn; return 1 }, clearInterval, console
    })
    expect(fetch).not.toHaveBeenCalled()
    handlers.DOMContentLoaded()
    await vi.waitFor(() => expect(feed.outerHTML).toContain('first update'))
    expect(fetch).toHaveBeenCalledWith('/api/public/posts/elei%C3%A7%C3%A3o/live-updates', { cache: 'no-store' })
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: [], is_live: false, html: '<section>ended and deleted</section>' }) })
    await tick!()
    expect(feed.outerHTML).toContain('ended and deleted')
    expect(clearInterval).toHaveBeenCalledWith(1)
  })

  it('filters coverages in SQL before applying pagination', async () => {
    const all = vi.fn().mockResolvedValue({ results: [] })
    const bind = vi.fn().mockReturnValue({ all })
    const prepare = vi.fn().mockReturnValue({ bind })
    await listPosts({ prepare } as any, { template: 'liveblog', is_live: 0, status: 'published', limit: 10 })
    expect(prepare.mock.calls[0][0]).toContain('p.template = ?')
    expect(prepare.mock.calls[0][0]).toContain('p.is_live = ?')
    expect(bind.mock.calls[0]).toEqual(['liveblog', 0, 'published', 10, 0])
  })
})
