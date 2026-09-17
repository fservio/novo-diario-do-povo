import { escapeHtml, escapeAttr } from './layout'
import { renderAlltypeHeader } from './components/header'
import { renderAlltypeFooter } from './components/footer'

export function renderAlltypeLayout(params: {
  title: string
  description?: string
  bodyHtml: string
  baseUrl: string
  siteName: string
  navItems: Array<{
    label: string
    href: string
    active?: boolean
  }>
  nonce: string
  canonicalUrl?: string
  ogImage?: string
  extraHeadHtml?: string
  extraScriptsHtml?: string
}): string {
  const {
    title,
    description,
    bodyHtml,
    baseUrl,
    siteName,
    navItems,
    nonce,
    canonicalUrl,
    ogImage,
    extraHeadHtml = '',
    extraScriptsHtml = ''
  } = params

  const canonical = canonicalUrl || `${baseUrl}/`
  const metaDesc = description || `Notícias e informações de qualidade sobre ${siteName}`
  const ogImgUrl = ogImage || `${baseUrl}/static/logo-dp.png`

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>

  <meta name="description" content="${escapeAttr(metaDesc)}">
  <link rel="canonical" href="${escapeAttr(canonical)}">

  <!-- Open Graph -->
  <meta property="og:site_name" content="${escapeAttr(siteName)}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(metaDesc)}">
  <meta property="og:url" content="${escapeAttr(canonical)}">
  <meta property="og:image" content="${escapeAttr(ogImgUrl)}">
  <meta property="og:type" content="website">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(metaDesc)}">
  <meta name="twitter:image" content="${escapeAttr(ogImgUrl)}">

  <!-- Style Sheets -->
  <link rel="stylesheet" href="/static/alltype.v2.css">

  <!-- Custom Fonts Preconnect -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

  ${extraHeadHtml}
</head>
<body>
  ${renderAlltypeHeader({
    siteName,
    logoUrl: '/static/logo-dp.png',
    navItems,
    nonce
  })}

  <main class="dp-shell" style="margin-top: 40px; min-height: 60vh;">
    ${bodyHtml}
  </main>

  ${renderAlltypeFooter(siteName, '/static/logo-dp.png')}

  ${extraScriptsHtml}
</body>
</html>`
}
