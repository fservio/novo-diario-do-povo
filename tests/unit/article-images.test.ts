import { expect, it, vi } from 'vitest'
import type { Env } from '../../packages/core/types'
import { sizeArticleImages } from '../../packages/core/web/article-images'

it('adds responsive candidates and reserves the stored dimensions of an older image', async () => {
  const key = 'media/2026/11/infografico.webp'
  const bind = vi.fn().mockReturnValue({
    all: async () => ({ results: [{ r2_key: key, width: 2400, height: 1350 }] })
  })
  const env = { DB: { prepare: () => ({ bind }) } } as unknown as Env
  const external = '<img src="https://example.org/externa.webp">'
  const html = await sizeArticleImages(env, `<img src="/i/${key}" loading="lazy">${external}`)

  expect(bind).toHaveBeenCalledWith(key)
  expect(html).toContain('width="2400" height="1350"')
  expect(html).toContain(`/i/${key}?w=800 800w`)
  expect(html).toContain(external)
})
