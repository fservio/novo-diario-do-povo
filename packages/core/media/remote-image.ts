import { matchTrustedImageSource, type TrustedImageSource } from '../media-sources'
import { ADMIN_IMAGE_MAX_BYTES, ADMIN_IMAGE_TYPES } from './upload'

function parseImageUrl(input: string, base?: string) {
  try {
    return new URL(input, base)
  } catch {
    return null
  }
}

const PUBLIC_HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/i
const LOCAL_SUFFIX = /\.(?:localhost|local|internal|intranet|lan|home\.arpa)$/i
const JPEG_DOWNLOAD_TYPES = new Set(['', 'application/octet-stream', 'image/jpg', 'image/pjpeg'])

export async function downloadEditorialImage(input: string, sources: TrustedImageSource[], userAgent?: string) {
  let url = parseImageUrl(input)
  const sourceCredit = url && matchTrustedImageSource(sources, url.href)
  const signal = AbortSignal.timeout(15_000)

  for (let redirects = 0; redirects <= 3; redirects++) {
    const hostname = url?.hostname.replace(/\.$/, '') || ''
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.port ||
      !PUBLIC_HOSTNAME.test(hostname) || LOCAL_SUFFIX.test(hostname) ||
      hostname === 'dopovo.com.br' || hostname.endsWith('.dopovo.com.br')) {
      throw new Error('Cole o link HTTPS direto de uma imagem pública externa.')
    }

    const response = await fetch(url, {
      redirect: 'manual',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
        ...(userAgent ? { 'User-Agent': userAgent } : {})
      },
      signal
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('Location')
      url = location ? parseImageUrl(location, url.href) : null
      continue
    }

    const type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase()
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 526) {
        throw new Error('O certificado HTTPS do site de origem não pôde ser validado (HTTP 526). Se a foto abrir no navegador, salve-a e selecione o arquivo neste formulário.')
      }
      throw new Error(`O site de origem não entregou a imagem (HTTP ${response.status}).`)
    }
    const needsJpegCheck = JPEG_DOWNLOAD_TYPES.has(type)
    if (!response.body || (!Object.hasOwn(ADMIN_IMAGE_TYPES, type) && !needsJpegCheck)) {
      await response.body?.cancel()
      throw new Error('O link precisa abrir uma imagem JPEG, PNG, WebP ou AVIF.')
    }

    const tooLarge = 'A imagem ultrapassa o limite de 10 MB.'
    if (Number(response.headers.get('Content-Length')) > ADMIN_IMAGE_MAX_BYTES) {
      await response.body.cancel()
      throw new Error(tooLarge)
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > ADMIN_IMAGE_MAX_BYTES) {
          await reader.cancel()
          throw new Error(tooLarge)
        }
        chunks.push(new Uint8Array(value))
      }
    } finally {
      reader.releaseLock()
    }
    if (!size) throw new Error('A imagem está vazia.')
    let image = new Blob(chunks, { type })
    if (needsJpegCheck) {
      const signature = new Uint8Array(await image.slice(0, 3).arrayBuffer())
      if (signature[0] !== 0xff || signature[1] !== 0xd8 || signature[2] !== 0xff) {
        throw new Error('O link precisa abrir uma imagem JPEG, PNG, WebP ou AVIF.')
      }
      image = image.slice(0, image.size, 'image/jpeg')
    }
    const credit = matchTrustedImageSource(sources, url.href) || sourceCredit || ''
    return { image, credit }
  }

  throw new Error('O link tem muitos redirecionamentos. Cole o endereço final da imagem.')
}
