import { describe, expect, it, vi } from 'vitest'
import { autosaveVisualPost } from '../../packages/core/db/posts'

const contentJson = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texto apurado pela redação.' }] }]
})

describe('autosave do editor visual', () => {
  it('salva HTML derivado do JSON e avança a versão editorial', async () => {
    const run = vi.fn(async () => ({ meta: { changes: 1 } }))
    const bind = vi.fn((...values: unknown[]) => ({ run, values }))
    const prepare = vi.fn((sql: string) => ({ bind, sql }))

    const version = await autosaveVisualPost({ prepare } as unknown as D1Database, {
      postId: 42,
      contentJson,
      expectedVersion: 7,
      title: 'Título em edição',
      hat: 'política',
      excerpt: 'Linha de apoio'
    })

    expect(version).toBe(8)
    expect(prepare.mock.calls[0][0]).toContain('content_version = content_version + 1')
    expect(prepare.mock.calls[0][0]).toContain('WHERE id = ? AND content_version = ?')
    expect(bind.mock.calls[0]).toEqual(expect.arrayContaining([
      'Título em edição',
      'POLÍTICA',
      '<p>Texto apurado pela redação.</p>',
      42,
      7
    ]))
  })

  it('detecta conflito quando outra sessão já alterou a matéria', async () => {
    const db = {
      prepare: () => ({
        bind: () => ({ run: async () => ({ meta: { changes: 0 } }) })
      })
    }

    await expect(autosaveVisualPost(db as unknown as D1Database, {
      postId: 42,
      contentJson,
      expectedVersion: 7,
      title: 'Título em edição'
    })).rejects.toThrow('CONTENT_VERSION_CONFLICT')
  })
})
