import { describe, expect, it } from 'vitest'
import {
  feedHtmlToText,
  parseEditorialFeed,
  validateEditorialFeedUrl
} from '../../packages/core/editorial-ai/rss'

describe('Radar editorial RSS', () => {
  it('normaliza RSS sem carregar marcação ou scripts para o dossiê', async () => {
    const items = await parseEditorialFeed(`<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
        <channel>
          <title>Fonte oficial</title>
          <item>
            <guid>noticia-42</guid>
            <title><![CDATA[ Governo publica <b>novo decreto</b> ]]></title>
            <link>https://example.com/noticias/decreto#trecho</link>
            <description><![CDATA[Resumo &amp; contexto.<script>alert(1)</script>]]></description>
            <content:encoded><![CDATA[<p>Texto integral.</p><p>Segundo parágrafo.</p>]]></content:encoded>
            <pubDate>Wed, 19 Aug 2026 12:00:00 GMT</pubDate>
            <media:content url="https://example.com/imagem.jpg" />
          </item>
        </channel>
      </rss>`)

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      guid: 'noticia-42',
      title: 'Governo publica novo decreto',
      url: 'https://example.com/noticias/decreto',
      summary: 'Resumo & contexto.',
      content: 'Texto integral.\n\nSegundo parágrafo.',
      publishedAt: '2026-08-19T12:00:00.000Z',
      imageUrl: 'https://example.com/imagem.jpg'
    })
  })

  it('interpreta Atom e escolhe o link alternativo público', async () => {
    const items = await parseEditorialFeed(`<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Diário oficial</title>
        <entry>
          <id>tag:example.com,2026:7</id>
          <title>Boletim da manhã</title>
          <link rel="self" href="https://example.com/feed/7" />
          <link rel="alternate" href="https://example.com/boletim/7" />
          <summary type="html">Fatos &amp;amp; serviço</summary>
          <author><name>Redação</name></author>
          <updated>2026-08-19T09:30:00-03:00</updated>
        </entry>
      </feed>`)

    expect(items[0].url).toBe('https://example.com/boletim/7')
    expect(items[0].author).toBe('Redação')
    expect(items[0].publishedAt).toBe('2026-08-19T12:30:00.000Z')
  })

  it('bloqueia protocolos, credenciais e destinos privados', () => {
    expect(() => validateEditorialFeedUrl('file:///etc/passwd')).toThrow(/HTTP/)
    expect(() => validateEditorialFeedUrl('https://user:pass@example.com/rss')).toThrow(/credenciais/)
    expect(() => validateEditorialFeedUrl('http://127.0.0.1/rss')).toThrow(/rede privada/)
    expect(() => validateEditorialFeedUrl('http://10.1.2.3/rss')).toThrow(/rede privada/)
    expect(() => validateEditorialFeedUrl('https://metadata.google.internal/rss')).toThrow(/rede privada/)
    expect(validateEditorialFeedUrl('https://example.com/rss.xml#latest')).toBe('https://example.com/rss.xml')
  })

  it('converte HTML de feed em texto limitado', () => {
    expect(feedHtmlToText('<p>Um</p><style>ruído</style><p>Dois&nbsp;e três</p>', 20)).toBe('Um\n\nDois e três')
  })
})
