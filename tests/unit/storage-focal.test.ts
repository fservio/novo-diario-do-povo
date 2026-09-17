import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../../packages/core/types'
import { serveMedia } from '../../packages/core/storage'

describe('Recorte focal de mídia', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('repassa as coordenadas relativas para o gravity do Cloudflare', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('imagem'))
    vi.stubGlobal('fetch', fetchMock)

    await serveMedia(
      {} as Env,
      'media/capa.jpg',
      new Request('https://diario.dopovo.com.br/i/media/capa.jpg?w=1200&h=630&fp-x=0.2&fp-y=0.8')
    )

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][1].cf.image.gravity).toEqual({ x: 0.2, y: 0.8 })
  })

  it('limita coordenadas fora da imagem', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('imagem'))
    vi.stubGlobal('fetch', fetchMock)

    await serveMedia(
      {} as Env,
      'media/capa.jpg',
      new Request('https://diario.dopovo.com.br/i/media/capa.jpg?w=1200&h=630&fp-x=-1&fp-y=2')
    )

    expect(fetchMock.mock.calls[0][1].cf.image.gravity).toEqual({ x: 0, y: 1 })
  })
})
