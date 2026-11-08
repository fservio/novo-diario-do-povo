import { describe, expect, it } from 'vitest'
import { renderReadingPath, removeLegacyReadingLink } from '../../packages/core/web/components/reading-path'
const post={id:2,slug:'como-funciona',title:'Como funciona a contratação pública',published_at:'2026-11-05T12:00:00Z',excerpt:'Conheça as etapas e como acompanhar.',reading_path:'next' as const}
describe('Reading path cards',()=>{
  it('shows a contextual next-read label and description with one full-card link',()=>{
    const html=renderReadingPath(post,'https://diario.example')
    expect(html).toContain('Como funciona</span>')
    expect(html).toContain(post.excerpt)
    expect(html).toContain('Continuar a leitura')
    expect(html.match(/<a /g)?.length).toBe(1)
    expect(html).toContain('data-reading-path="next"')
  })
  it('distinguishes the return card and escapes CMS text',()=>{
    const html=renderReadingPath({...post,reading_path:'origin',title:'<script>teste</script>'},'https://diario.example')
    expect(html).toContain('A notícia original')
    expect(html).toContain('Voltar à notícia')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
  it('removes the automated backlink only when the matching card replaces it',()=>{
    const link='<p>Leia a notícia que motivou esta explicação: <a href="https://diario.example/original/">Original</a></p>'
    expect(removeLegacyReadingLink('<p>Texto</p>'+link,'https://diario.example/original/')).toBe('<p>Texto</p>')
    expect(removeLegacyReadingLink(link,'https://diario.example/outra/')).toBe(link)
    expect(removeLegacyReadingLink('<p>Veja também <a href="https://diario.example/original/">Original</a></p>','https://diario.example/original/')).toContain('Veja também')
  })
})
