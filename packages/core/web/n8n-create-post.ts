import type { Context } from 'hono'
import type { Env } from '../types'
import type { CreatePostInput } from '../db/posts'
import { getPostUrl } from '../utils/post'

export async function handleN8nCreatePost(c: Pick<Context<{ Bindings: Env }>, 'req' | 'env' | 'json'>, reviewOnly = false) {
  try {
    const { getPostById } = await import('../db/posts')
    const { createImportedPost } = await import('../db/imported-posts')
    const body = await c.req.json() as any // Cast mostly to any to allow flexible input, validated below
    if (reviewOnly && body?.status !== 'review') {
      return c.json({ success: false, error: 'Envie uma matéria com status de revisão.' }, 400)
    }
    const { publicationIdSchema, doPovoPublicDeliveryUnavailable } = await import('../publications')
    const publication = publicationIdSchema.optional().safeParse(body?.publicationId)
    if (!publication.success) {
      return c.json({ success: false, error: 'publicationId deve ser diario ou do-povo.' }, 400)
    }
    if (publication.data === 'do-povo' && body.status === 'published') {
      return c.json({ success: false, error: doPovoPublicDeliveryUnavailable }, 409)
    }
    let agentReview: { source: string; evidence: string; auto: boolean } | undefined
    if (body.status === 'review' || body.agent_review !== undefined) {
      const { agentReviewInput } = await import('../editorial-ai/publication')
      const parsed = agentReviewInput.safeParse(body.agent_review)
      if (!parsed.success || body.status !== 'review' || publication.data === 'do-povo') {
        return c.json({ success: false, error: 'Revisão de agente exige origem e fontes válidas no Diário.' }, 400)
      }
      agentReview = { source: parsed.data.source, evidence: JSON.stringify(parsed.data.sources), auto: parsed.data.auto }
    }

    // Basic validation
    if (!body.title || !body.content) {
      return c.json({ success: false, error: 'Missing title or content' }, 400)
    }

    // Resolve string/string[] tags into numeric tag IDs when needed
    let resolvedTags: number[] | undefined = undefined
    if (Array.isArray(body.tags) && body.tags.every((t: unknown) => typeof t === 'number')) {
      resolvedTags = body.tags
    } else if (typeof body.tags === 'string' || Array.isArray(body.tags)) {
      try {
        const rawList = Array.isArray(body.tags) ? body.tags : String(body.tags).split(',')
        const names: string[] = [...new Set<string>(rawList.map((t: unknown) => String(t || '').trim()).filter((t: string) => t.length >= 2 && t.length <= 60))].slice(0, 6)
        const ids: number[] = []
        for (const name of names) {
          const tagSlug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
          if (!tagSlug) continue
          await c.env.DB.prepare('INSERT INTO tags (name, slug) VALUES (?, ?) ON CONFLICT(slug) DO NOTHING').bind(name, tagSlug).run()
          const row = await c.env.DB.prepare('SELECT id FROM tags WHERE slug = ? LIMIT 1').bind(tagSlug).first<{ id: number }>()
          if (row?.id) ids.push(row.id)
        }
        if (ids.length > 0) resolvedTags = ids
      } catch (tagErr) {
        console.warn('[n8n] Tag resolution skipped:', tagErr)
      }
    }

    // Map default category_id=13 (Geral) to specific editorial category when hat clearly matches
    let resolvedCategoryId = Number(body.category_id) || 1
    if (resolvedCategoryId === 13 && typeof body.hat === 'string' && body.hat.trim()) {
      const hatUpper = body.hat.trim().toUpperCase()
      const hatMap: Record<string, number> = {
        'FUTEBOL': 4, 'ESPORTE': 4, 'ESPORTES': 4, 'FÓRMULA 1': 4, 'FORMULA 1': 4, 'NBA': 4, 'TÊNIS': 4, 'TENIS': 4, 'BASQUETE': 4, 'VÔLEI': 4, 'VOLEI': 4, 'UFC': 4, 'MMA': 4, 'ATLETISMO': 4, 'AUTOMOBILISMO': 4, 'SURFE': 4,
        'ECONOMIA': 2, 'MERCADO': 2, 'NEGÓCIOS': 2, 'NEGOCIOS': 2, 'FINANÇAS': 2, 'FINANCAS': 2, 'IMPOSTOS': 2, 'INSS': 2, 'EMPREGO': 2, 'AGRONEGÓCIO': 2, 'BOLSA': 2,
        'POLÍTICA': 1, 'POLITICA': 1, 'CONGRESSO': 1, 'GOVERNO': 1, 'ELEIÇÕES': 1, 'ELEICOES': 1, 'SENADO': 1, 'CÂMARA': 1, 'CAMARA': 1, 'PLANALTO': 1,
        'JUSTIÇA': 5, 'JUSTICA': 5, 'STF': 5, 'STJ': 5, 'DIREITO': 5, 'POLÍCIA': 5, 'POLICIA': 5, 'SEGURANÇA': 5, 'SEGURANCA': 5, 'SEGURANÇA PÚBLICA': 5,
        'MUNDO': 6, 'INTERNACIONAL': 6, 'GUERRA': 6, 'GEOPOLÍTICA': 6,
        'TECNOLOGIA': 7, 'GAMES': 7, 'JOGOS': 7, 'IA': 7, 'INTELIGÊNCIA ARTIFICIAL': 7, 'CIÊNCIA': 7, 'CIENCIA': 7, 'INTERNET': 7, 'CIBERSEGURANÇA': 7, 'ESPAÇO': 7,
        'PIAUÍ': 8, 'PIAUI': 8, 'TERESINA': 8, 'PARNAÍBA': 8, 'PICOS': 8,
        'CIDADES': 3, 'TRÂNSITO': 3, 'MOBILIDADE': 3,
        'CULTURA': 12, 'ENTRETENIMENTO': 12, 'CELEBRIDADES': 12, 'TELEVISÃO': 12, 'TELEVISAO': 12, 'TV': 12, 'CINEMA': 12, 'MÚSICA': 12, 'MUSICA': 12, 'SÉRIES': 12, 'SERIES': 12, 'STREAMING': 12, 'FAMOSOS': 12, 'ARTE': 12, 'LITERATURA': 12, 'TEATRO': 12, 'SHOWS': 12
      }
      if (hatMap[hatUpper]) resolvedCategoryId = hatMap[hatUpper]
    }

    // Default values suitable for n8n
    const input: CreatePostInput = {
      publication_id: publication.data,
      title: body.title,
      content: body.content,
      slug: body.slug,
      hat: body.hat,
      excerpt: body.excerpt,
      content_markdown: body.content_markdown,
      category_id: resolvedCategoryId,
      author_id: body.author_id || 1,
      cover_media_id: body.cover_media_id,
      template: body.template || 'article',
      seo_title: body.seo_title,
      seo_description: body.seo_description,
      seo_primary_keyword: body.seo_primary_keyword,
      seo_secondary_keywords: body.seo_secondary_keywords,
      social_title: body.social_title,
      social_description: body.social_description,
      social_share_text: body.social_share_text,
      social_image_media_id: body.social_image_media_id,
      social_image_position_x: body.social_image_position_x,
      social_image_position_y: body.social_image_position_y,
      is_premium: body.is_premium || 0,
      seo_noindex: body.seo_noindex || 0,
      is_headline: body.is_headline || 0,
      tags: resolvedTags,
      original_link: body.original_link
    }

    const { id: postId, reused } = await createImportedPost(c.env.DB, input, agentReview)

    // Automatically extract and attach source og:image / image_url ONLY for sources authorized in the CMS (settings: media.trusted_image_sources)
    const existingForCover = reused && c.env?.DB ? await getPostById(c.env.DB, postId) : null
    if ((!reused || !existingForCover?.cover_media_id) && !input.cover_media_id && c.env?.R2 && c.env?.DB) {
      try {
        const { getTrustedImageSources, matchTrustedImageSource } = await import('../media-sources')
        const trustedImageSources = await getTrustedImageSources(c.env)
        const getApprovedPublicSourceCredit = (urlStr: string, isImage = false): string | null =>
          matchTrustedImageSource(trustedImageSources, urlStr, isImage)
        let candidateImgUrl =
          typeof body.image_url === 'string' &&
          /^https?:\/\//i.test(body.image_url.trim()) &&
          Boolean(getApprovedPublicSourceCredit(body.image_url.trim(), true))
            ? body.image_url.trim()
            : null
        let candidateCredit = candidateImgUrl ? getApprovedPublicSourceCredit(candidateImgUrl, true) : null
        if (!candidateImgUrl) {
          const sourceLinks: string[] = []
          if (typeof body.original_link === 'string' && getApprovedPublicSourceCredit(body.original_link.trim())) {
            sourceLinks.push(body.original_link.trim())
          }
          const hrefMatches = String(body.content || '').matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)
          for (const m of hrefMatches) {
            if (m[1] && getApprovedPublicSourceCredit(m[1])) {
              sourceLinks.push(m[1])
            }
          }
          for (const pageUrl of sourceLinks.slice(0, 2)) {
            try {
              const pageRes = await fetch(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Accept': 'text/html,application/xhtml+xml' },
                redirect: 'follow',
                signal: AbortSignal.timeout(3500)
              })
              if (!pageRes.ok) continue
              const htmlSnippet = (await pageRes.text()).slice(0, 200000)
              const ogMatch = htmlSnippet.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i)
                || htmlSnippet.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i)
              const genericImage = /imagem-padrao|imagens-compartilhamento|placeholder|\/tema\/|logo|brasao|favicon|sprite|avatar/i
              let pickedUrl: string | null = null
              if (ogMatch?.[1]) {
                const rawUrl = ogMatch[1].replace(/&amp;/g, '&').trim()
                const resolvedUrl = new URL(rawUrl, pageUrl).toString()
                if (!genericImage.test(resolvedUrl) && getApprovedPublicSourceCredit(resolvedUrl, true)) pickedUrl = resolvedUrl
              }
              if (!pickedUrl) {
                // og:image ausente ou genérica (ex.: imagem padrão de compartilhamento): usa a primeira foto real da matéria
                for (const imgMatch of htmlSnippet.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)) {
                  try {
                    const imgUrl = new URL(imgMatch[1].replace(/&amp;/g, '&').trim(), pageUrl).toString()
                    if (/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(imgUrl) && !genericImage.test(imgUrl) && getApprovedPublicSourceCredit(imgUrl, true)) {
                      pickedUrl = imgUrl
                      break
                    }
                  } catch {
                    // ignore malformed src
                  }
                }
              }
              if (pickedUrl) {
                candidateImgUrl = pickedUrl
                candidateCredit = getApprovedPublicSourceCredit(pickedUrl, true)
                break
              }
            } catch {
              // Ignore individual source fetch failure
            }
          }
        }
        if (candidateImgUrl && /^https?:\/\//i.test(candidateImgUrl) && candidateCredit) {
          const originalUrl = candidateImgUrl.replace(/-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp))(\?.*)?$/i, '$1$2')
          const fetchCandidates = [...new Set([originalUrl, candidateImgUrl])]
          let fetched: { arrayBuffer: ArrayBuffer; contentType: string } | null = null
          for (const imageUrl of fetchCandidates) {
            try {
              const imgRes = await fetch(imageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
                redirect: 'follow',
                signal: AbortSignal.timeout(4500)
              })
              const type = (imgRes.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
              if (!imgRes.ok || !type.startsWith('image/') || type.includes('svg') || type.includes('gif')) continue
              const buffer = await imgRes.arrayBuffer()
              if (buffer.byteLength >= 10000 && buffer.byteLength <= 8000000) {
                fetched = { arrayBuffer: buffer, contentType: type }
                break
              }
            } catch {
              // try the next candidate
            }
          }
          if (fetched) {
            const { arrayBuffer, contentType } = fetched
            if (arrayBuffer.byteLength >= 10000 && arrayBuffer.byteLength <= 8000000) {
              const { createMedia, extractImageDimensions } = await import('../db/media')
              const dimensions = extractImageDimensions(arrayBuffer, contentType)
              if (!dimensions || (dimensions.width >= 400 && dimensions.height >= 220)) {
                const now = new Date()
                const year = now.getFullYear()
                const month = String(now.getMonth() + 1).padStart(2, '0')
                const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('')
                const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
                const r2Key = `media/${year}/${month}/${randomHex}.${ext}`
                await c.env.R2.put(r2Key, arrayBuffer, { httpMetadata: { contentType } })
                const mediaId = await createMedia(c.env, {
                  r2_key: r2Key,
                  filename: `${randomHex}.${ext}`,
                  mime_type: contentType,
                  size_bytes: arrayBuffer.byteLength,
                  width: dimensions?.width || 1200,
                  height: dimensions?.height || 675,
                  alt: body.title || null,
                  credits: candidateCredit,
                  uploaded_by_user_id: 1
                })
                if (mediaId) {
                  await c.env.DB.prepare('UPDATE posts SET cover_media_id = ? WHERE id = ?').bind(mediaId, postId).run()
                }
              }
            }
          }
        }
      } catch (imgErr) {
        console.warn('[n8n] Auto cover image extraction skipped:', imgErr)
      }
    }

    // If status is 'published', we need to publish it
    if (!reused && body.status === 'published') {
      const { publishPost } = await import('../db/posts')
      await publishPost(c.env.DB, postId)
    }

    // Fetch to get the final slug/status
    const post = await getPostById(c.env.DB, postId)

    return c.json({
      success: true,
      data: {
        id: postId,
        reused,
        slug: post?.slug,
        status: post?.status,
        publicationId: post?.publication_id || 'diario',
        url: post && post.publication_id !== 'do-povo' ? getPostUrl(post, 'https://diario.dopovo.com.br') : ''
      }
    })
  } catch (error: any) {
    console.error('[n8n] Create post error:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
}
