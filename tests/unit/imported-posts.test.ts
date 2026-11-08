import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../../packages/core/db/posts', () => ({ createPost: vi.fn() }))
import { createPost } from '../../packages/core/db/posts'
import { createImportedPost } from '../../packages/core/db/imported-posts'

describe('import delivery retries', () => {
  beforeEach(() => vi.mocked(createPost).mockReset())
  const input = { title: 'Notícia', content: '<p>Texto</p>', category_id: 1, author_id: 1 }

  it('reuses the source article even when a retry changes its generated title', async () => {
    const first = vi.fn().mockResolvedValue({ id: 42 })
    const bind = vi.fn().mockReturnValue({ first })
    const db = { prepare: vi.fn().mockReturnValue({ bind }) } as any
    expect(await createImportedPost(db, { ...input, original_link: ' https://agencia.example/noticia ' }))
      .toEqual({ id: 42, reused: true })
    expect(bind).toHaveBeenCalledWith('https://agencia.example/noticia')
    expect(createPost).not.toHaveBeenCalled()
  })

  it('creates an article for a new source', async () => {
    const db = { prepare: () => ({ bind: () => ({ first: async () => null }) }) } as any
    vi.mocked(createPost).mockResolvedValue(43)
    expect(await createImportedPost(db, { ...input, original_link: 'https://agencia.example/nova' }))
      .toEqual({ id: 43, reused: false })
    expect(createPost).toHaveBeenCalledOnce()
  })

  it('allows separate original reporting without a source URL', async () => {
    const prepare = vi.fn()
    vi.mocked(createPost).mockResolvedValue(44)
    expect(await createImportedPost({ prepare } as any, input)).toEqual({ id: 44, reused: false })
    expect(prepare).not.toHaveBeenCalled()
  })
})
