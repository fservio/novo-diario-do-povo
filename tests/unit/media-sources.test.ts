import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRUSTED_IMAGE_SOURCES,
  matchTrustedImageSource,
  normalizeSourceDomain,
  normalizeTrustedImageSources
} from '../../packages/core/media-sources'

describe('trusted image sources', () => {
  it('normalizes domains and rejects overly broad suffixes', () => {
    expect(normalizeSourceDomain('https://www.Agenciabrasil.ebc.com.br/politica')).toBe('agenciabrasil.ebc.com.br')
    expect(normalizeSourceDomain('pi.gov.br')).toBe('pi.gov.br')
    expect(normalizeSourceDomain('gov.br')).toBeNull()
    expect(normalizeSourceDomain('com.br')).toBeNull()
    expect(normalizeSourceDomain('not a domain')).toBeNull()
  })

  it('matches defaults, subdomains and blocks commercial sources', () => {
    const sources = DEFAULT_TRUSTED_IMAGE_SOURCES
    expect(matchTrustedImageSource(sources, 'https://agenciabrasil.ebc.com.br/x')).toBe('Agência Brasil')
    expect(matchTrustedImageSource(sources, 'https://www.camara.leg.br/noticias/1')).toBe('Agência Câmara')
    expect(matchTrustedImageSource(sources, 'https://oglobo.globo.com/a')).toBeNull()
    expect(matchTrustedImageSource(sources, 'https://g1.globo.com/a')).toBeNull()
    expect(matchTrustedImageSource(sources, 'https://evil-pi.gov.br.example.com/a')).toBeNull()
  })

  it('ignores institutional images only for image URLs and honors the enabled flag', () => {
    const sources = normalizeTrustedImageSources([
      { domain: 'exemplo.gov.br', credit: 'Exemplo', enabled: true },
      { domain: 'off.gov.br', credit: 'Off', enabled: false }
    ])
    expect(matchTrustedImageSource(sources, 'https://exemplo.gov.br/wp/logo_color.svg', true)).toBeNull()
    expect(matchTrustedImageSource(sources, 'https://exemplo.gov.br/noticia-sobre-logotipo/')).toBe('Exemplo')
    expect(matchTrustedImageSource(sources, 'https://off.gov.br/foto.jpg', true)).toBeNull()
  })

  it('falls back to defaults when the stored value is invalid', () => {
    expect(normalizeTrustedImageSources(null)).toEqual(DEFAULT_TRUSTED_IMAGE_SOURCES)
    expect(normalizeTrustedImageSources([])).toEqual([])
  })
})

