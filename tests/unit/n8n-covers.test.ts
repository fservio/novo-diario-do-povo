import { describe, expect, it } from 'vitest'
import { validateCoverFile } from '../../packages/core/web/n8n-covers'

const bytes = (size: number) => new ArrayBuffer(size)

describe('AI cover validation', () => {
  it('accepts a 1600x900 WebP of reasonable size', () => {
    expect(validateCoverFile(bytes(120_000), 'image/webp', { width: 1600, height: 900 })).toMatchObject({ ok: true, width: 1600, height: 900 })
  })

  it('rejects other formats, tiny or huge files', () => {
    expect(validateCoverFile(bytes(120_000), 'image/png', { width: 1600, height: 900 }).ok).toBe(false)
    expect(validateCoverFile(bytes(2_000), 'image/webp', { width: 1600, height: 900 }).ok).toBe(false)
    expect(validateCoverFile(bytes(1_500_000), 'image/webp', { width: 1600, height: 900 }).ok).toBe(false)
  })

  it('requires the Discover width and the 16:9 ratio', () => {
    expect(validateCoverFile(bytes(120_000), 'image/webp', { width: 1000, height: 562 }).ok).toBe(false)
    expect(validateCoverFile(bytes(120_000), 'image/webp', { width: 1536, height: 1024 }).ok).toBe(false)
    expect(validateCoverFile(bytes(120_000), 'image/webp', null).ok).toBe(false)
  })
})
