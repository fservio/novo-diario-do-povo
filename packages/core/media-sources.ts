/**
 * Fontes autorizadas para uso automático de imagens (og:image) em matérias importadas via n8n.
 * A lista é editável no CMS (Configurações → Fontes com foto autorizada) e guardada em `settings`.
 */

import type { Env } from './types'

export interface TrustedImageSource {
  domain: string
  credit: string
  enabled: boolean
}

export const TRUSTED_IMAGE_SOURCES_KEY = 'media.trusted_image_sources'

export const DEFAULT_TRUSTED_IMAGE_SOURCES: TrustedImageSource[] = [
  { domain: 'ebc.com.br', credit: 'Agência Brasil', enabled: true },
  { domain: 'agenciasp.sp.gov.br', credit: 'Agência SP', enabled: true },
  { domain: 'ce.gov.br', credit: 'Governo do Ceará', enabled: true },
  { domain: 'ceara.gov.br', credit: 'Governo do Ceará', enabled: true },
  { domain: 'pi.gov.br', credit: 'Governo do Piauí', enabled: true },
  { domain: 'camara.leg.br', credit: 'Agência Câmara', enabled: true }
]

// Sufixos públicos amplos demais: liberar um deles autorizaria milhares de sites.
const TOO_BROAD_DOMAINS = new Set([
  'br', 'com', 'org', 'net', 'gov', 'edu',
  'com.br', 'org.br', 'net.br', 'gov.br', 'leg.br', 'edu.br', 'jus.br', 'mp.br', 'mil.br'
])

const IMAGE_PATH_BLOCKLIST = /logo|brasao|favicon/i

/** Normaliza "https://www.Exemplo.gov.br/pagina" → "exemplo.gov.br". Retorna null se inválido. */
export function normalizeSourceDomain(input: unknown): string | null {
  let value = String(input ?? '').trim().toLowerCase()
  if (!value) return null
  value = value.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '')
  if (!/^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(value)) return null
  if (TOO_BROAD_DOMAINS.has(value)) return null
  return value
}

export function normalizeTrustedImageSources(raw: unknown): TrustedImageSource[] {
  if (!Array.isArray(raw)) return DEFAULT_TRUSTED_IMAGE_SOURCES.map(s => ({ ...s }))
  const seen = new Set<string>()
  const out: TrustedImageSource[] = []
  for (const item of raw) {
    const domain = normalizeSourceDomain((item as any)?.domain)
    const credit = String((item as any)?.credit ?? '').trim().slice(0, 120)
    if (!domain || !credit || seen.has(domain)) continue
    seen.add(domain)
    out.push({ domain, credit, enabled: (item as any)?.enabled !== false })
  }
  return out
}

export async function getTrustedImageSources(env: Env): Promise<TrustedImageSource[]> {
  try {
    const { getSetting } = await import('./db')
    const stored = await getSetting(env, TRUSTED_IMAGE_SOURCES_KEY, 'public')
    if (stored === null || stored === undefined) return DEFAULT_TRUSTED_IMAGE_SOURCES.map(s => ({ ...s }))
    return normalizeTrustedImageSources(stored)
  } catch {
    return DEFAULT_TRUSTED_IMAGE_SOURCES.map(s => ({ ...s }))
  }
}

/**
 * Retorna o crédito da fonte autorizada que corresponde à URL, ou null.
 * Com `isImage`, também rejeita imagens institucionais (logo, brasão, favicon).
 */
export function matchTrustedImageSource(sources: TrustedImageSource[], urlStr: string, isImage = false): string | null {
  try {
    const parsed = new URL(urlStr)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
    for (const source of sources) {
      if (!source.enabled) continue
      if (host === source.domain || host.endsWith('.' + source.domain)) {
        if (isImage && IMAGE_PATH_BLOCKLIST.test(parsed.pathname)) return null
        return source.credit
      }
    }
    return null
  } catch {
    return null
  }
}
