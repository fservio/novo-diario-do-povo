/**
 * Content Snippet Helper
 * Corta conteúdo HTML de forma segura (sem quebrar tags)
 */

export function createSafeSnippet(htmlContent: string, ratio: number): string {
  if (ratio >= 1.0) return htmlContent

  // Remove HTML tags to count text
  const textOnly = htmlContent.replace(/<[^>]*>/g, '')
  const targetLength = Math.floor(textOnly.length * ratio)

  if (targetLength <= 0) return ''

  // Find the position in original HTML
  let textCount = 0
  let htmlIndex = 0
  let inTag = false

  for (let i = 0; i < htmlContent.length; i++) {
    const char = htmlContent[i]

    if (char === '<') {
      inTag = true
    } else if (char === '>') {
      inTag = false
      htmlIndex = i + 1
      continue
    }

    if (!inTag) {
      textCount++
      if (textCount >= targetLength) {
        htmlIndex = i + 1
        break
      }
    }
    
    htmlIndex = i + 1
  }

  // Cut at safe point (end of tag)
  let snippet = htmlContent.substring(0, htmlIndex)

  // Close any open tags
  const openTags: string[] = []
  const tagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi
  let match

  while ((match = tagRegex.exec(snippet)) !== null) {
    const fullTag = match[0]
    const tagName = match[1].toLowerCase()

    if (fullTag.startsWith('</')) {
      // Closing tag
      const lastIndex = openTags.lastIndexOf(tagName)
      if (lastIndex !== -1) {
        openTags.splice(lastIndex, 1)
      }
    } else if (!fullTag.endsWith('/>') && !['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tagName)) {
      // Opening tag (not self-closing)
      openTags.push(tagName)
    }
  }

  // Close remaining open tags
  for (let i = openTags.length - 1; i >= 0; i--) {
    snippet += `</${openTags[i]}>`
  }

  return snippet
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m] || m)
}
