import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { Hono } from 'hono'
import { createPostSchema, updatePostSchema } from '../../packages/core/admin/posts'
import { handleSeoRestore, renderSeoAutomationPanel, renderSeoEvidence, renderSeoHistoryFragment, renderSeoPilotStatuses, seoEvidenceSources } from '../../packages/core/admin/seo-automation'

const metadata = { seo_title: 'Saúde de Teresina convoca profissionais', seo_description: 'Confira os prazos e as orientações da convocação.', seo_primary_keyword: 'convocação saúde Teresina', seo_secondary_keywords: ['prazo de apresentação', 'documentos exigidos'] }

describe('SEO no editor de matérias', () => {
  it('valida e conserva os quatro campos ao criar e editar, sem substituir tags', () => {
    const input = { ...metadata, seo_secondary_keywords: 'prazo de apresentação\r\ndocumentos exigidos', title: 'Manchete editorial', content: '<p>Notícia.</p>', category_id: 1, author_id: 1, tags: [3, 5], expected_seo_version: '4' }
    const created = createPostSchema.parse(input)
    const edited = updatePostSchema.parse(input)
    for (const parsed of [created, edited]) {
      expect(parsed).toMatchObject({ ...metadata, tags: [3, 5], expected_seo_version: 4 })
      expect(parsed.title).toBe('Manchete editorial')
    }
  })

  it('permite limpar palavras-chave e rejeita limites ou termos secundários repetidos', () => {
    expect(updatePostSchema.parse({ seo_primary_keyword: '', seo_secondary_keywords: '' })).toMatchObject({ seo_primary_keyword: '', seo_secondary_keywords: [] })
    expect(updatePostSchema.safeParse({ seo_primary_keyword: 'a'.repeat(121) }).success).toBe(false)
    expect(updatePostSchema.safeParse({ seo_secondary_keywords: 'termo\nTERMO' }).success).toBe(false)
    expect(updatePostSchema.safeParse({ seo_secondary_keywords: ['1', '2', '3', '4', '5', '6'] }).success).toBe(false)
    expect(updatePostSchema.safeParse({ seo_description: 'a'.repeat(501) }).success).toBe(false)
    expect(updatePostSchema.safeParse({ seo_title: 'a'.repeat(201) }).success).toBe(false)
  })

  it('apresenta a prévia estimada com marca e alternativas, sem meta keywords', () => {
    const html = renderSeoAutomationPanel({ post: { id: 42, title: 'Título <editorial>', excerpt: 'Resumo & contexto', slug: 'materia', published_at: '2026-11-06T12:00:00Z', seo_version: 3 } as any, csrfToken: 'csrf' })
    expect(html).toContain('Título &lt;editorial&gt; | Jornal Diário do Povo')
    expect(html).toContain('Resumo &amp; contexto')
    expect(html).toContain('Prévia estimada')
    expect(html).toContain('name="expected_seo_version" value="3"')
    expect(html).toContain('/2026/11/06/materia/')
    expect(html).toContain('/admin/posts/42/seo/history')
    expect(html).not.toContain('<meta name="keywords"')
    expect(html).not.toContain('<form')
  })

  it('mostra versões e evidência escapadas; restauração inline não cria formulários aninhados', () => {
    const row = { id: 7, created_at: '2026-11-06 12:00:00', actor: 'user:1', before: metadata, after: { ...metadata, seo_title: '<img onerror=alert(1)>' }, reason: '<script>reason</script>', evidence: { used_sources: ['content', 'search_console', 'trends'], content: { post_id: 42 }, search_console: { status: 'available', rows: [{ query: 'termo', impressions: 100 }] }, trends: { status: 'available', items: [{ term: 'termo' }] } } }
    const inline = renderSeoHistoryFragment({ postId: 42, seoVersion: 3, history: [row] as any, csrfToken: 'csrf' })
    const full = renderSeoHistoryFragment({ postId: 42, seoVersion: 3, history: [row] as any, csrfToken: 'csrf', allowRestore: true })
    expect(inline).toContain('Conteúdo · Search Console · Trends')
    expect(inline).toContain('&lt;img onerror=alert(1)&gt;')
    expect(inline).toContain('&lt;script&gt;reason&lt;/script&gt;')
    expect(inline).not.toContain('<form')
    expect(full).toContain('action="/admin/posts/42/seo/revisions/7/restore"')
    expect(full).toContain('name="csrf" value="csrf"')
    expect(full).toContain('name="expected_seo_version" value="3"')
    expect(full).toContain('Restaurar os valores anteriores')
  })

  it('não declara uma origem que não consta na evidência', () => {
    expect(seoEvidenceSources({ arbitrary: 'search_console', used_sources: ['content', 'search_console', 'trends'], content: { post_id: 42 }, search_console: { status: 'not_configured' }, trends: { status: 'unavailable' } })).toEqual(['Conteúdo'])
    expect(seoEvidenceSources(null)).toEqual([])
  })

  it('distingue fonte usada de disponível e mostra métricas sem expor configurações privadas', () => {
    const evidence = { used_sources: ['content'], content: { post_id: 42 }, search_console: { status: 'available', startDate: '2026-10-07', endDate: '2026-11-03', rows: [{ query: '<busca>', impressions: 500, clicks: 10, ctr: .02, position: 6.4 }], token: 'NUNCA MOSTRAR' }, trends: { status: 'not_configured' }, support: [{ term: 'saúde', quote: '<p>trecho</p>' }] }
    const html = renderSeoEvidence(evidence)
    expect(seoEvidenceSources(evidence)).toEqual(['Conteúdo'])
    expect(html).toContain('Disponível; não utilizado nesta versão')
    expect(html).toContain('2026-10-07 a 2026-11-03')
    expect(html).toContain('&lt;busca&gt;')
    expect(html).toContain('<td>500</td><td>10</td><td>2%</td><td>6,4</td>')
    expect(html).toContain('Trends:</strong> Não conectado')
    expect(html).toContain('&lt;p&gt;trecho&lt;/p&gt;')
    expect(html).not.toContain('NUNCA MOSTRAR')
  })

  it('atualiza a prévia com textContent e respeita os campos vazios como alternativa', () => {
    const source = readFileSync('public/static/admin-seo.js', 'utf8')
    const fields: Record<string, any> = {
      seo_title: { value: '', maxLength: 200 }, seo_description: { value: '', maxLength: 500 },
      title: { value: 'Título original' }, excerpt: { value: 'Resumo original' },
    }
    const previewTitle: any = {}, previewDescription: any = {}
    let onInput: () => void = () => {}
    const form = { querySelector: (query: string) => fields[query.match(/name="([^"]+)"/)?.[1] || ''], addEventListener: (_event: string, fn: () => void) => { onInput = fn } }
    const panel = { dataset: { seoBrand: 'Diário do Povo' }, closest: () => form, querySelectorAll: () => [], querySelector: (query: string) => query === '[data-seo-preview-title]' ? previewTitle : query === '[data-seo-preview-description]' ? previewDescription : query.includes('name=') ? form.querySelector(query) : null }
    runInNewContext(source, { document: { querySelectorAll: () => [panel] } })
    expect(previewTitle.textContent).toBe('Título original | Diário do Povo')
    expect(previewDescription.textContent).toBe('Resumo original')
    fields.seo_title.value = '<script>novo título</script>'
    fields.seo_description.value = 'Descrição específica'
    onInput()
    expect(previewTitle.textContent).toBe('<script>novo título</script> | Diário do Povo')
    expect(previewTitle.innerHTML).toBeUndefined()
    expect(previewDescription.textContent).toBe('Descrição específica')
  })

  it('nega restauração sem usuário ou com versão inválida antes de tocar no banco', async () => {
    const app = new Hono<any>()
    app.use('*', async (c, next) => { if (c.req.header('x-test-user')) c.set('adminUser', { id: 1, role: 'editor' }); await next() })
    app.post('/admin/posts/:id/seo/revisions/:revisionId/restore', handleSeoRestore as any)
    const url = '/admin/posts/42/seo/revisions/7/restore'
    expect((await app.request(url, { method: 'POST' })).status).toBe(403)
    expect((await app.request(url, { method: 'POST', headers: { 'x-test-user': '1', 'content-type': 'application/x-www-form-urlencoded' }, body: 'expected_seo_version=-1' })).status).toBe(422)
  })

  it('mantém o piloto como pendente até que todas as tratadas tenham alteração aplicada', () => {
    const pending = renderSeoPilotStatuses([{ pilot_id: 2, status: 'awaiting_treatment', treatment_count: 30, applied_count: 29, pending_count: 1, started_at: null, pending: [{ post_id: 42, state: 'needs_review' }] }])
    expect(pending).toContain('Aguardando aplicação nas tratadas')
    expect(pending).toContain('29 de 30')
    expect(pending).toContain('Matéria #42')
    expect(pending).toContain('revisão necessária')
    expect(pending).not.toContain('Referência de início:')
    const observing = renderSeoPilotStatuses([{ pilot_id: 2, status: 'observing', treatment_count: 30, applied_count: 30, pending_count: 0, started_at: '2026-11-06T14:00:00Z', pending: [] }])
    expect(observing).toContain('Em observação')
    expect(observing).toContain('Referência de início:')
    expect(observing).not.toContain('Aguardando aplicação nas tratadas')
  })
})
