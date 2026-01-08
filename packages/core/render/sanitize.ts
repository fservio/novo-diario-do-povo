/**
 * Sanitização HTML para artigos
 * Remove scripts, event handlers e URLs perigosas
 * Permite apenas tags e atributos seguros
 */

const ALLOWED_TAGS = new Set([
  'p', 'a', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote',
  'h2', 'h3', 'h4', 'figure', 'img', 'figcaption', 'br', 'hr',
  'pre', 'code', 'div', 'span', 'b', 'i', 'u', 's'
])

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  'a': new Set(['href', 'title', 'target', 'rel']),
  'img': new Set(['src', 'alt', 'title', 'width', 'height', 'loading']),
  'figure': new Set(['class']),
  'figcaption': new Set(['class']),
  'div': new Set(['class']),
  'span': new Set(['class']),
  'code': new Set(['class']),
  'pre': new Set(['class'])
}

/**
 * Verifica se uma URL é segura
 */
function isSafeUrl(url: string): boolean {
  if (!url) return false
  
  const trimmed = url.trim().toLowerCase()
  
  // Bloquear javascript: e data: URLs
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) {
    return false
  }
  
  // Permitir URLs relativas
  if (trimmed.startsWith('/')) {
    return true
  }
  
  // Permitir https://
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return true
  }
  
  return false
}

/**
 * Sanitiza atributos HTML
 */
function sanitizeAttributes(tagName: string, attrs: string): string {
  const allowedAttrs = ALLOWED_ATTRIBUTES[tagName]
  if (!allowedAttrs) return ''
  
  const attrRegex = /(\w+)=["']([^"']*)["']/g
  const sanitized: string[] = []
  
  let match
  while ((match = attrRegex.exec(attrs)) !== null) {
    const [, name, value] = match
    
    if (!allowedAttrs.has(name.toLowerCase())) continue
    
    // Validação especial para URLs
    if (name === 'href' || name === 'src') {
      if (!isSafeUrl(value)) continue
      
      // Validação adicional para src de imagens
      if (name === 'src' && tagName === 'img') {
        // Aceitar apenas imagens do R2 (/i/) ou HTTPS externas
        if (!value.startsWith('/i/') && !value.startsWith('https://') && !value.startsWith('http://')) {
          continue
        }
      }
    }
    
    // Escapar valor do atributo
    const escapedValue = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
    
    sanitized.push(`${name}="${escapedValue}"`)
  }
  
  return sanitized.length > 0 ? ' ' + sanitized.join(' ') : ''
}

/**
 * Sanitiza HTML removendo tags e atributos perigosos
 * 
 * @param html - HTML bruto para sanitizar
 * @returns HTML sanitizado seguro
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  
  // Remove scripts inline e event handlers
  let sanitized = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
  
  // Parse e rebuilda apenas com tags permitidas
  const tagRegex = /<\/?(\w+)([^>]*)>/g
  const result: string[] = []
  let lastIndex = 0
  
  let match
  while ((match = tagRegex.exec(sanitized)) !== null) {
    const [fullMatch, tagName, attributes] = match
    const isClosing = fullMatch.startsWith('</')
    
    // Adiciona texto antes da tag
    if (match.index > lastIndex) {
      result.push(sanitized.substring(lastIndex, match.index))
    }
    
    // Verifica se tag é permitida
    if (ALLOWED_TAGS.has(tagName.toLowerCase())) {
      if (isClosing) {
        result.push(`</${tagName}>`)
      } else {
        const sanitizedAttrs = sanitizeAttributes(tagName.toLowerCase(), attributes)
        const isSelfClosing = fullMatch.endsWith('/>')
        result.push(`<${tagName}${sanitizedAttrs}${isSelfClosing ? ' /' : ''}>`)
      }
    }
    
    lastIndex = match.index + fullMatch.length
  }
  
  // Adiciona texto restante
  if (lastIndex < sanitized.length) {
    result.push(sanitized.substring(lastIndex))
  }
  
  return result.join('')
}

/**
 * Renderiza Markdown para HTML (simples, sem biblioteca)
 * Suporta apenas formatação básica + HTML blocks (figure)
 */
export function renderMarkdownToHtml(markdown: string): string {
  if (!markdown) return ''
  
  let html = markdown
  
  // Preservar HTML blocks (figure, etc)
  const htmlBlocks: string[] = []
  html = html.replace(/<(figure|div|pre)[^>]*>.*?<\/\1>/gs, (match) => {
    htmlBlocks.push(match)
    return `__HTML_BLOCK_${htmlBlocks.length - 1}__`
  })
  
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  
  // Bold e Italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  
  // Listas não ordenadas
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
  
  // Listas ordenadas
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
  
  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
  
  // Parágrafos
  html = html.replace(/^(?!<[hul]|<blockquote)(.+)$/gm, '<p>$1</p>')
  
  // Restaurar HTML blocks
  htmlBlocks.forEach((block, i) => {
    html = html.replace(`__HTML_BLOCK_${i}__`, block)
  })
  
  return html
}
