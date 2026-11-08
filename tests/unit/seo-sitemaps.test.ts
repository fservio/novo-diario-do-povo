import { describe, expect, it, vi } from 'vitest'
import { generateSitemapIndex, generateMonthlyPostSitemap, generateFullSitemap, SITEMAP_PAGE_SIZE } from '../../packages/core/seo'

function mockEnv(results: unknown[] = []) {
  const all = vi.fn().mockResolvedValue({ results })
  const bind = vi.fn().mockReturnValue({ all })
  const prepare = vi.fn().mockReturnValue({ all, bind })
  return { env: { DB: { prepare } } as any, prepare, bind, all }
}

describe('archive sitemap discovery', () => {
  it('lists archive months and categories on the production domain without invented update dates', async () => {
    const { env } = mockEnv([{ year: '2026', month: '10' }, { year: '2025', month: '01' }])
    const xml = await generateSitemapIndex(env)
    expect(xml).toContain('https://diario.dopovo.com.br/sitemap/archive/2025/01.xml')
    expect(xml).toContain('/sitemap-categories.xml')
    expect(xml).toContain('/sitemap-news.xml')
    expect(xml).not.toContain('<lastmod>')
  })

  it('normalizes SQLite dates when selecting a monthly archive, including the year boundary', async () => {
    const { env, prepare, bind } = mockEnv([{ slug: 'materia', published_at: '2025-12-01 00:00:00', updated_at: '2025-12-02 12:00:00' }])
    const xml = await generateMonthlyPostSitemap(env, '2025', '12')
    expect(prepare.mock.calls[0][0]).toContain('datetime(p.published_at) >= datetime(?)')
    expect(bind).toHaveBeenCalledWith('2025-12-01T00:00:00', '2026-01-01T00:00:00', SITEMAP_PAGE_SIZE, 0)
    expect(xml).toContain('/2025/12/01/materia/')
  })

  it('propagates database failure instead of reporting a successful empty archive', async () => {
    const { env, all } = mockEnv()
    all.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(generateMonthlyPostSitemap(env, '2026', '10')).rejects.toThrow('database unavailable')
  })
})


describe('bounded sitemap archives', () => {
  it('serves the legacy sitemap as an index instead of an overflowing flat list', async () => {
    const { env } = mockEnv([{ year: '2026', month: '10', total: 50001 }])
    const xml = await generateFullSitemap(env)
    expect(xml).toContain('<sitemapindex ')
    expect(xml.match(/sitemap\/archive\/2026\/10.xml/g)).toHaveLength(6)
    expect(xml).toContain('10.xml?page=6')
    expect(xml).not.toContain('<url>')
  })

  it('uses stable pagination and excludes future publications', async () => {
    const { env, prepare, bind } = mockEnv([])
    await generateMonthlyPostSitemap(env, '2026', '10', 3)
    expect(bind).toHaveBeenCalledWith('2026-10-01T00:00:00', '2026-11-01T00:00:00', 10000, 20000)
    expect(prepare.mock.calls[0][0]).toContain('p.id DESC')
    expect(prepare.mock.calls[0][0]).toContain("datetime(p.published_at) <= datetime('now')")
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER])('rejects invalid page %s before querying', async page => {
    const { env, prepare } = mockEnv()
    await expect(generateMonthlyPostSitemap(env, '2026', '10', page)).rejects.toThrow('Invalid sitemap page')
    expect(prepare).not.toHaveBeenCalled()
  })
})


it('omits alternate articles but retains explicit self canonicals', async () => {
  const { env } = mockEnv([
    { slug: 'original', published_at: '2026-10-01T12:00:00Z', seo_canonical: 'https://diario.dopovo.com.br/2026/10/01/original/' },
    { slug: 'copia', published_at: '2026-10-01T12:00:00Z', seo_canonical: 'https://diario.dopovo.com.br/2026/10/01/original/' },
    { slug: 'externa', published_at: '2026-10-01T12:00:00Z', seo_canonical: 'https://example.com/original/' }
  ])
  const xml = await generateMonthlyPostSitemap(env, '2026', '10')
  expect(xml).toContain('/original/')
  expect(xml).not.toContain('/copia/')
  expect(xml).not.toContain('/externa/')
})
