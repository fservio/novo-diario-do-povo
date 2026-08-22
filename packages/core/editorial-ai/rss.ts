import { parseStringPromise } from 'xml2js'
import type { EditorialAiSource, ParsedFeedItem } from './types'

const MAX_FEED_BYTES = 2 * 1024 * 1024
const MAX_ITEMS_PER_SYNC = 100

function first<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined
}

function stringValue(value: unknown): string {
  const current = first(value as any)
  if (typeof current === 'string' || typeof current === 'number') return String(current).trim()
  if (current && typeof current === 'object') {
    const record = current as Record<string, unknown>
    if (typeof record._ === 'string') return record._.trim()
    if (typeof record['#text'] === 'string') return String(record['#text']).trim()
  }
  return ''
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '
  }
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
    const key = entity.toLowerCase()
    if (key.startsWith('#x')) {
      const code = Number.parseInt(key.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ''
    }
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ''
    }
    return named[key] ?? `&${entity};`
  })
}

export function feedHtmlToText(value: string, maxLength = 50000): string {
  return decodeEntities(value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
}

function normalizedDate(value: unknown): string | null {
  const raw = stringValue(value)
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function publicItemUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

function rssImage(item: Record<string, any>): string | null {
  const media = first(item['media:content']) as Record<string, any> | undefined
  const thumbnail = first(item['media:thumbnail']) as Record<string, any> | undefined
  const enclosure = first(item.enclosure) as Record<string, any> | undefined
  const candidate = stringValue(media?.$?.url || thumbnail?.$?.url || enclosure?.$?.url)
  return publicItemUrl(candidate) || null
}

function atomLink(entry: Record<string, any>): string {
  const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : []
  for (const link of links) {
    if (typeof link === 'string') {
      const parsed = publicItemUrl(link)
      if (parsed) return parsed
    }
    const attrs = link?.$ || {}
    if ((!attrs.rel || attrs.rel === 'alternate') && attrs.href) {
      const parsed = publicItemUrl(String(attrs.href))
      if (parsed) return parsed
    }
  }
  return ''
}

function rssItems(root: any): ParsedFeedItem[] {
  const channel = first(root?.rss?.channel) || first(root?.channel)
  const rawItems = channel?.item || root?.RDF?.item || root?.['rdf:RDF']?.item || []
  return (Array.isArray(rawItems) ? rawItems : [rawItems]).slice(0, MAX_ITEMS_PER_SYNC).flatMap((raw: any) => {
    const title = feedHtmlToText(stringValue(raw?.title), 500)
    const url = publicItemUrl(stringValue(raw?.link || raw?.['atom:link']?.$?.href))
    if (!title || !url) return []
    const description = stringValue(raw?.description || raw?.summary)
    const fullContent = stringValue(raw?.['content:encoded'] || raw?.content)
    const guid = stringValue(raw?.guid || raw?.id) || url
    return [{
      guid: guid.slice(0, 1000),
      url,
      title,
      summary: feedHtmlToText(description, 8000),
      content: feedHtmlToText(fullContent || description, 50000),
      author: feedHtmlToText(stringValue(raw?.['dc:creator'] || raw?.author), 300),
      publishedAt: normalizedDate(raw?.pubDate || raw?.published || raw?.date || raw?.['dc:date']),
      imageUrl: rssImage(raw || {})
    }]
  })
}

function atomItems(root: any): ParsedFeedItem[] {
  const feed = root?.feed || root?.['atom:feed']
  const rawEntries = feed?.entry || []
  return (Array.isArray(rawEntries) ? rawEntries : [rawEntries]).slice(0, MAX_ITEMS_PER_SYNC).flatMap((raw: any) => {
    const title = feedHtmlToText(stringValue(raw?.title), 500)
    const url = atomLink(raw || {})
    if (!title || !url) return []
    const summary = stringValue(raw?.summary)
    const content = stringValue(raw?.content)
    const authorNode = first(raw?.author) as Record<string, unknown> | undefined
    const guid = stringValue(raw?.id) || url
    const media = first(raw?.['media:content']) as Record<string, any> | undefined
    return [{
      guid: guid.slice(0, 1000),
      url,
      title,
      summary: feedHtmlToText(summary, 8000),
      content: feedHtmlToText(content || summary, 50000),
      author: feedHtmlToText(stringValue(authorNode?.name || raw?.['dc:creator']), 300),
      publishedAt: normalizedDate(raw?.published || raw?.updated),
      imageUrl: publicItemUrl(stringValue(media?.$?.url)) || null
    }]
  })
}

export async function parseEditorialFeed(xml: string): Promise<ParsedFeedItem[]> {
  if (!xml.trim()) throw new Error('O feed retornou conteúdo vazio.')
  const root = await parseStringPromise(xml, {
    explicitArray: false,
    trim: true,
    normalizeTags: false,
    mergeAttrs: false,
    explicitRoot: true
  })
  const items = root?.feed || root?.['atom:feed'] ? atomItems(root) : rssItems(root)
  if (!items.length) throw new Error('Nenhuma publicação válida foi encontrada no RSS ou Atom.')
  return items
}

function isPrivateIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return false
  const octets = match.slice(1).map(Number)
  if (octets.some(value => value < 0 || value > 255)) return true
  const [a, b] = octets
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
}

export function validateEditorialFeedUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Informe uma URL de feed válida.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('O feed deve usar HTTP ou HTTPS.')
  if (url.username || url.password) throw new Error('URLs com credenciais embutidas não são permitidas.')
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('Use um feed nas portas públicas 80 ou 443.')
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const blockedNames = new Set(['localhost', 'metadata.google.internal', 'instance-data', '0', '::', '::1'])
  if (blockedNames.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal') ||
      hostname.endsWith('.lan') || hostname.includes(':') || isPrivateIpv4(hostname)) {
    throw new Error('O endereço do feed aponta para uma rede privada ou reservada.')
  }
  url.hash = ''
  return url.toString()
}

async function fetchWithSafeRedirects(source: EditorialAiSource, signal: AbortSignal): Promise<Response> {
  let currentUrl = validateEditorialFeedUrl(source.feed_url)
  for (let redirects = 0; redirects <= 2; redirects++) {
    const headers: Record<string, string> = {
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9',
      'User-Agent': 'DiarioDoPovo-EditorialRadar/1.0'
    }
    if (source.etag) headers['If-None-Match'] = source.etag
    if (source.last_modified) headers['If-Modified-Since'] = source.last_modified
    const response = await fetch(currentUrl, { headers, redirect: 'manual', signal })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response
    const location = response.headers.get('location')
    if (!location || redirects === 2) throw new Error('O feed excedeu o limite seguro de redirecionamentos.')
    currentUrl = validateEditorialFeedUrl(new URL(location, currentUrl).toString())
  }
  throw new Error('Não foi possível acessar o feed.')
}

export async function fetchEditorialFeed(source: EditorialAiSource): Promise<{
  notModified: boolean
  items: ParsedFeedItem[]
  etag: string | null
  lastModified: string | null
}> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetchWithSafeRedirects(source, controller.signal).catch(error => {
      if (controller.signal.aborted) throw new Error('Tempo limite ao consultar o feed.')
      throw error
    })
    if (response.status === 304) {
      return { notModified: true, items: [], etag: source.etag, lastModified: source.last_modified }
    }
    if (!response.ok) throw new Error(`A fonte respondeu com HTTP ${response.status}.`)
    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength > MAX_FEED_BYTES) throw new Error('O feed excede o limite de 2 MB.')
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > MAX_FEED_BYTES) throw new Error('O feed excede o limite de 2 MB.')
    const xml = new TextDecoder().decode(bytes)
    const items = await parseEditorialFeed(xml)
    return {
      notModified: false,
      items,
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified')
    }
  } finally {
    clearTimeout(timeout)
  }
}
