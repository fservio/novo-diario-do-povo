import { sanitizeHtml } from '../render/sanitize'

export type EditorialContentFormat = 'legacy' | 'markdown' | 'visual'

export interface EditorialMark {
  type: 'bold' | 'italic' | 'underline' | 'strike' | 'link'
  attrs?: Record<string, unknown>
}

export interface EditorialNode {
  type: string
  attrs?: Record<string, unknown>
  content?: EditorialNode[]
  marks?: EditorialMark[]
  text?: string
}

export interface EditorialDocument extends EditorialNode {
  type: 'doc'
  content: EditorialNode[]
}

const ALLOWED_NODES = new Set([
  'doc', 'paragraph', 'heading', 'text', 'bulletList', 'orderedList',
  'listItem', 'blockquote', 'horizontalRule', 'hardBreak', 'editorialImage'
])
const ALLOWED_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'link'])
const MAX_JSON_BYTES = 500_000
const MAX_TEXT_LENGTH = 200_000
const MAX_NODES = 4_000
const MAX_DEPTH = 16

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeUrl(value: unknown, image = false): string | null {
  if (typeof value !== 'string' || value.length > 2_000) return null
  const url = value.trim()
  if (!url) return null
  if (url.startsWith('/')) return url.startsWith('/i/') || (!image && !url.startsWith('//')) ? url : null
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || (!image && parsed.protocol === 'http:') ? parsed.toString() : null
  } catch {
    return null
  }
}

function optionalText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : ''
}

export function parseEditorialDocument(input: string | unknown): EditorialDocument {
  const serialized = typeof input === 'string' ? input : JSON.stringify(input)
  if (!serialized || serialized.length > MAX_JSON_BYTES) throw new Error('O documento visual excede o limite permitido.')

  let raw: unknown
  try {
    raw = typeof input === 'string' ? JSON.parse(input) : input
  } catch {
    throw new Error('O documento visual está corrompido.')
  }

  let nodeCount = 0
  let textLength = 0
  const visit = (value: unknown, depth: number): EditorialNode => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Bloco editorial inválido.')
    if (depth > MAX_DEPTH) throw new Error('A estrutura da matéria é profunda demais.')
    nodeCount += 1
    if (nodeCount > MAX_NODES) throw new Error('A matéria possui blocos demais.')

    const candidate = value as Record<string, unknown>
    const type = typeof candidate.type === 'string' ? candidate.type : ''
    if (!ALLOWED_NODES.has(type)) throw new Error(`Bloco editorial não permitido: ${type || 'desconhecido'}.`)

    const node: EditorialNode = { type }
    if (type === 'text') {
      if (typeof candidate.text !== 'string') throw new Error('Trecho de texto inválido.')
      textLength += candidate.text.length
      if (textLength > MAX_TEXT_LENGTH) throw new Error('O texto excede o limite permitido.')
      node.text = candidate.text
      if (candidate.marks !== undefined) {
        if (!Array.isArray(candidate.marks)) throw new Error('Formatação de texto inválida.')
        node.marks = candidate.marks.map(mark => {
          if (!mark || typeof mark !== 'object' || Array.isArray(mark)) throw new Error('Formatação de texto inválida.')
          const markValue = mark as Record<string, unknown>
          const markType = typeof markValue.type === 'string' ? markValue.type : ''
          if (!ALLOWED_MARKS.has(markType)) throw new Error(`Formatação não permitida: ${markType || 'desconhecida'}.`)
          return { type: markType as EditorialMark['type'], attrs: typeof markValue.attrs === 'object' && markValue.attrs ? markValue.attrs as Record<string, unknown> : undefined }
        })
      }
      return node
    }

    if (candidate.attrs && typeof candidate.attrs === 'object' && !Array.isArray(candidate.attrs)) {
      const attrs = candidate.attrs as Record<string, unknown>
      if (type === 'heading') node.attrs = { level: attrs.level === 3 ? 3 : 2 }
      if (type === 'editorialImage') {
        const src = safeUrl(attrs.src, true)
        if (!src) throw new Error('A imagem do conteúdo possui uma URL inválida.')
        node.attrs = {
          src,
          alt: optionalText(attrs.alt, 300),
          caption: optionalText(attrs.caption, 1_000),
          credit: optionalText(attrs.credit, 300),
          mediaId: Number.isInteger(Number(attrs.mediaId)) && Number(attrs.mediaId) > 0 ? Number(attrs.mediaId) : null,
          width: Number.isInteger(Number(attrs.width)) && Number(attrs.width) > 0 ? Number(attrs.width) : null,
          height: Number.isInteger(Number(attrs.height)) && Number(attrs.height) > 0 ? Number(attrs.height) : null
        }
      }
    }

    if (candidate.content !== undefined) {
      if (!Array.isArray(candidate.content)) throw new Error('Conteúdo de bloco inválido.')
      node.content = candidate.content.map(child => visit(child, depth + 1))
    }
    return node
  }

  const document = visit(raw, 0)
  if (document.type !== 'doc') throw new Error('O conteúdo precisa ser um documento editorial.')
  if (!Array.isArray(document.content)) document.content = []
  return document as EditorialDocument
}

function renderMarks(text: string, marks: EditorialMark[] | undefined): string {
  return (marks || []).reduce((html, mark) => {
    if (mark.type === 'bold') return `<strong>${html}</strong>`
    if (mark.type === 'italic') return `<em>${html}</em>`
    if (mark.type === 'underline') return `<u>${html}</u>`
    if (mark.type === 'strike') return `<s>${html}</s>`
    if (mark.type === 'link') {
      const href = safeUrl(mark.attrs?.href)
      if (!href) return html
      const target = mark.attrs?.target === '_blank' ? ' target="_blank" rel="noopener noreferrer"' : ''
      return `<a href="${escapeHtml(href)}"${target}>${html}</a>`
    }
    return html
  }, escapeHtml(text))
}

function renderNode(node: EditorialNode): string {
  if (node.type === 'text') return renderMarks(node.text || '', node.marks)
  const children = (node.content || []).map(renderNode).join('')
  if (node.type === 'doc') return children
  if (node.type === 'paragraph') return `<p>${children}</p>`
  if (node.type === 'heading') return node.attrs?.level === 3 ? `<h3>${children}</h3>` : `<h2>${children}</h2>`
  if (node.type === 'bulletList') return `<ul>${children}</ul>`
  if (node.type === 'orderedList') return `<ol>${children}</ol>`
  if (node.type === 'listItem') return `<li>${children}</li>`
  if (node.type === 'blockquote') return `<blockquote>${children}</blockquote>`
  if (node.type === 'horizontalRule') return '<hr>'
  if (node.type === 'hardBreak') return '<br>'
  if (node.type === 'editorialImage') {
    const src = safeUrl(node.attrs?.src, true)
    if (!src) return ''
    const alt = optionalText(node.attrs?.alt, 300)
    const caption = optionalText(node.attrs?.caption, 1_000)
    const credit = optionalText(node.attrs?.credit, 300)
    const width = Number(node.attrs?.width) > 0 ? ` width="${Number(node.attrs?.width)}"` : ''
    const height = Number(node.attrs?.height) > 0 ? ` height="${Number(node.attrs?.height)}"` : ''
    const captionHtml = caption || credit
      ? `<figcaption>${caption ? `<span>${escapeHtml(caption)}</span>` : ''}${credit ? `<span class="photo-credit">${escapeHtml(credit)}</span>` : ''}</figcaption>`
      : ''
    return `<figure class="article-inline-image"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy"${width}${height}>${captionHtml}</figure>`
  }
  return ''
}

export function renderEditorialDocumentToHtml(input: string | unknown): string {
  const document = parseEditorialDocument(input)
  return sanitizeHtml(renderNode(document))
}

export function editorialDocumentHasText(input: string | unknown): boolean {
  const document = parseEditorialDocument(input)
  const stack: EditorialNode[] = [document]
  while (stack.length) {
    const node = stack.pop()!
    if (node.type === 'text' && (node.text || '').trim()) return true
    if (node.type === 'editorialImage') return true
    stack.push(...(node.content || []))
  }
  return false
}
