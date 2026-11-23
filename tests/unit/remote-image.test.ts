import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadEditorialImage } from '../../packages/core/media/remote-image'
import { ADMIN_IMAGE_MAX_BYTES } from '../../packages/core/media/upload'

const sources = [{ domain: 'example.org', credit: 'Agência Exemplo', enabled: true }]
const url = 'https://example.org/capa.png'

afterEach(() => vi.unstubAllGlobals())

describe('downloadEditorialImage', () => {
  it('segue um redirecionamento da fonte e devolve a imagem e o crédito', async () => {
    const fetchImage = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: '/original.png' } }))
      .mockResolvedValueOnce(new Response('image bytes', { headers: { 'Content-Type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchImage)
    const { image, credit } = await downloadEditorialImage(url, sources, 'Mozilla/5.0')
    expect(await image.text()).toBe('image bytes')
    expect(image.type).toBe('image/png')
    expect(credit).toBe('Agência Exemplo')
    expect(String(fetchImage.mock.calls[1][0])).toBe('https://example.org/original.png')
    expect(fetchImage.mock.calls[0][1].redirect).toBe('manual')
    expect(fetchImage.mock.calls[0][1].headers['User-Agent']).toBe('Mozilla/5.0')
  })

  it('aceita um domínio público sem cadastro, inclusive após redirecionamento', async () => {
    const fetchImage = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://cdn.example.net/capa.webp' } }))
      .mockResolvedValueOnce(new Response('image bytes', { headers: { 'Content-Type': 'image/webp' } }))
    vi.stubGlobal('fetch', fetchImage)
    const { image, credit } = await downloadEditorialImage('https://photos.example.net/capa.webp', sources)
    expect(image.type).toBe('image/webp')
    expect(credit).toBe('')
    expect(String(fetchImage.mock.calls[1][0])).toBe('https://cdn.example.net/capa.webp')
  })

  it('bloqueia redirecionamento para um IP local antes de fazer outro fetch', async () => {
    const fetchImage = vi.fn().mockResolvedValue(new Response(null, {
      status: 302, headers: { Location: 'https://127.0.0.1/image.png' }
    }))
    vi.stubGlobal('fetch', fetchImage)
    await expect(downloadEditorialImage(url, sources)).rejects.toThrow('imagem pública externa')
    expect(fetchImage).toHaveBeenCalledTimes(1)
  })

  it('rejeita páginas HTML e limita o tamanho mesmo sem Content-Length', async () => {
    const fetchImage = vi.fn()
      .mockResolvedValueOnce(new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array(ADMIN_IMAGE_MAX_BYTES + 1), { headers: { 'Content-Type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchImage)
    await expect(downloadEditorialImage(url, sources)).rejects.toThrow('JPEG, PNG, WebP ou AVIF')
    await expect(downloadEditorialImage(url, sources)).rejects.toThrow('10 MB')
  })

  it('identifica JPEG servido como download genérico e rejeita bytes de outros arquivos', async () => {
    const fetchImage = vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), {
        headers: { 'Content-Type': 'application/octet-stream' }
      }))
      .mockResolvedValueOnce(new Response('bloqueado', { headers: { 'Content-Type': 'image/jpg' } }))
    vi.stubGlobal('fetch', fetchImage)
    const { image } = await downloadEditorialImage(url, sources)
    expect(image.type).toBe('image/jpeg')
    await expect(downloadEditorialImage(url, sources)).rejects.toThrow('JPEG, PNG, WebP ou AVIF')
  })

  it('informa o status quando o servidor de origem bloqueia o download', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bloqueado', { status: 403 })))
    await expect(downloadEditorialImage(url, sources)).rejects.toThrow('HTTP 403')
  })

  it('orienta o uso do arquivo local quando o certificado da origem é rejeitado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('SSL', { status: 526 })))
    await expect(downloadEditorialImage(url, sources)).rejects.toThrow('selecione o arquivo neste formulário')
  })
})
