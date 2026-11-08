import type { Env } from '../types'

type ImageDimensions = { r2_key: string; width: number; height: number }

export async function sizeArticleImages(env: Env, html: string): Promise<string> {
  // The article renderer sanitizes this HTML before adding its own image attributes.
  const images = /<img\b[^>]*\bsrc="\/i\/(media\/[\w./-]+\.(?:jpe?g|png|webp|avif))"[^>]*>/gi
  const hasDimensions = (tag: string) => /\swidth="[1-9]\d*"/i.test(tag) && /\sheight="[1-9]\d*"/i.test(tag)
  const keys = [...new Set([...html.matchAll(images)]
    .filter(([tag]) => !hasDimensions(tag)).map(([, key]) => key))].slice(0, 24)
  const dimensions = new Map<string, ImageDimensions>()

  if (keys.length) {
    try {
      const placeholders = keys.map(() => '?').join(',')
      const { results } = await env.DB.prepare(
        `SELECT r2_key, width, height FROM media WHERE r2_key IN (${placeholders}) AND width > 0 AND height > 0`
      ).bind(...keys).all<ImageDimensions>()
      for (const image of results) dimensions.set(image.r2_key, image)
    } catch {
      // Missing metadata must not prevent the article from rendering.
    }
  }

  return html.replace(images, (tag, key: string) => {
    const image = dimensions.get(key)
    const knownWidth = image?.width || Number(tag.match(/\swidth="([1-9]\d*)"/i)?.[1])
    const widths = [400, 800, 1200].filter(width => !knownWidth || width < knownWidth)
    const candidates = widths.map(width => `/i/${key}?w=${width} ${width}w`)
    if (knownWidth && knownWidth <= 1200) candidates.push(`/i/${key} ${knownWidth}w`)
    const sizedTag = image && !hasDimensions(tag)
      ? tag.replace(/\s(?:width|height)="[^"]*"/gi, '')
      : tag
    const size = image && !hasDimensions(tag) ? ` width="${image.width}" height="${image.height}"` : ''
    return sizedTag.replace(/\s*\/?>$/, `${size} srcset="${candidates.join(', ')}" sizes="(max-width: 748px) calc(100vw - 28px), 720px">`)
  })
}
