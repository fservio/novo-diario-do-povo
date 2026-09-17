export type SocialImageMeta = {
  url: string
  secureUrl?: string
  type?: string | null
  width?: number | null
  height?: number | null
  alt: string
}

export type SocialMeta = {
  title: string
  description: string
  url: string
  siteName: string
  type?: 'website' | 'article'
  locale?: string
  image?: SocialImageMeta
  article?: {
    publishedTime?: string | null
    modifiedTime?: string | null
    section?: string | null
  }
}

function escapeMeta(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function normalizeSocialSiteName(siteName: string): string {
  const normalized = String(siteName || '').trim()
  const comparable = normalized.toLocaleLowerCase('pt-BR')
  if (!normalized || comparable === 'jornal' || comparable.includes('diário do povo') || comparable.includes('diario do povo')) return 'Diário do Povo'
  return normalized
}

export function appendSiteName(title: string, siteName: string): string {
  const cleanTitle = String(title || '').trim()
  const cleanSiteName = normalizeSocialSiteName(siteName)
  if (!cleanTitle) return cleanSiteName
  if (cleanTitle.toLocaleLowerCase('pt-BR').includes(cleanSiteName.toLocaleLowerCase('pt-BR'))) return cleanTitle
  return `${cleanTitle} | ${cleanSiteName}`
}

export function renderSocialMetaTags(meta: SocialMeta): string {
  const type = meta.type || 'website'
  const locale = meta.locale || 'pt_BR'
  const image = meta.image

  return `
  <meta property="og:locale" content="${escapeMeta(locale)}">
  <meta property="og:site_name" content="${escapeMeta(meta.siteName)}">
  <meta property="og:type" content="${escapeMeta(type)}">
  <meta property="og:title" content="${escapeMeta(meta.title)}">
  <meta property="og:description" content="${escapeMeta(meta.description)}">
  <meta property="og:url" content="${escapeMeta(meta.url)}">
  ${image ? `<meta property="og:image" content="${escapeMeta(image.url)}">
  <meta property="og:image:secure_url" content="${escapeMeta(image.secureUrl || image.url)}">
  ${image.type ? `<meta property="og:image:type" content="${escapeMeta(image.type)}">` : ''}
  ${image.width ? `<meta property="og:image:width" content="${escapeMeta(image.width)}">` : ''}
  ${image.height ? `<meta property="og:image:height" content="${escapeMeta(image.height)}">` : ''}
  <meta property="og:image:alt" content="${escapeMeta(image.alt)}">` : ''}
  ${type === 'article' && meta.article?.publishedTime ? `<meta property="article:published_time" content="${escapeMeta(meta.article.publishedTime)}">` : ''}
  ${type === 'article' && meta.article?.modifiedTime ? `<meta property="article:modified_time" content="${escapeMeta(meta.article.modifiedTime)}">` : ''}
  ${type === 'article' && meta.article?.section ? `<meta property="article:section" content="${escapeMeta(meta.article.section)}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeMeta(meta.title)}">
  <meta name="twitter:description" content="${escapeMeta(meta.description)}">
  ${image ? `<meta name="twitter:image" content="${escapeMeta(image.url)}">
  <meta name="twitter:image:alt" content="${escapeMeta(image.alt)}">` : ''}`
}

export function buildTrackedShareUrl(url: string, channel: 'whatsapp' | 'native' | 'copy'): string {
  const tracked = new URL(url)
  tracked.searchParams.set('utm_source', channel === 'copy' ? 'copy_link' : channel)
  tracked.searchParams.set('utm_medium', 'share')
  tracked.searchParams.set('utm_campaign', 'article_share')
  return tracked.toString()
}

export function buildArticleShareMessage(input: {
  title: string
  description?: string | null
  url: string
  siteName: string
  template?: string | null
}): string {
  const title = String(input.title || '').trim()
  const description = String(input.description || '').replace(/\s+/g, ' ').trim()
  const siteName = normalizeSocialSiteName(input.siteName)
  const template = String(input.template || '').trim()

  if (template) {
    const rendered = template
      .replace(/\{\{title\}\}/gi, title)
      .replace(/\{\{summary\}\}/gi, description)
      .replace(/\{\{journal\}\}/gi, siteName)
      .replace(/\{\{url\}\}/gi, input.url)
      .trim()

    return rendered.includes(input.url) ? rendered : `${rendered}\n\n${input.url}`
  }

  return [
    `*${title}*`,
    description,
    `Leia a matéria completa no ${siteName}:`,
    input.url
  ].filter(Boolean).join('\n\n')
}
