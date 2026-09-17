import { describe, expect, it } from 'vitest'
import { renderNewsletterEmail } from '../../packages/core/newsletter/renderer'
import type { NewsletterCampaignWithItems } from '../../packages/core/newsletter/types'

function campaign(): NewsletterCampaignWithItems {
  return {
    id: 7,
    subject: 'As notícias essenciais desta manhã',
    preheader: 'Política, economia e os fatos do Piauí',
    intro_text: 'Uma seleção preparada pela redação.',
    content_html: '',
    segments_json: '["geral"]',
    status: 'draft',
    sent_count: 0,
    recipient_count: 0,
    failed_count: 0,
    scheduled_at: null,
    sent_at: null,
    created_by_user_id: 1,
    created_at: '2026-08-19T12:00:00.000Z',
    updated_at: null,
    items: [
      {
        id: 10,
        slug: 'materia-principal',
        title: 'A manchete principal do Diário',
        hat: 'Política',
        excerpt: 'O resumo da notícia mais importante desta edição.',
        published_at: '2026-08-19T10:00:00.000Z',
        created_at: '2026-08-19T10:00:00.000Z',
        category_name: 'Política',
        cover_media_url: 'media/2026/08/capa.jpg',
        position: 0
      },
      {
        id: 11,
        slug: 'segunda-materia',
        title: 'Economia ganha novo destaque',
        hat: null,
        excerpt: 'Outro resumo para o leitor.',
        published_at: '2026-08-19T09:00:00.000Z',
        created_at: '2026-08-19T09:00:00.000Z',
        category_name: 'Economia',
        cover_media_url: null,
        position: 1
      }
    ]
  }
}

describe('newsletter email renderer', () => {
  it('renders a portable email with editorial hierarchy and absolute links', () => {
    const result = renderNewsletterEmail({
      campaign: campaign(),
      baseUrl: 'https://diario.dopovo.com.br',
      unsubscribeUrl: 'https://diario.dopovo.com.br/newsletter/unsubscribe/token',
      recipientName: 'Maria da Silva'
    })

    expect(result.html).toContain('A manchete principal do Diário')
    expect(result.html).toContain('Economia ganha novo destaque')
    expect(result.html).toContain('Olá, Maria.')
    expect(result.html).toContain('https://diario.dopovo.com.br/i/media/2026/08/capa.jpg?w=1120')
    expect(result.html).toContain('https://diario.dopovo.com.br/2026/08/19/materia-principal/')
    expect(result.html).toContain('Cancelar inscrição')
    expect(result.text).toContain('Cancelar inscrição: https://diario.dopovo.com.br/newsletter/unsubscribe/token')
  })

  it('escapes editorial content before inserting it in the email', () => {
    const unsafe = campaign()
    unsafe.items[0].title = '<script>alert("x")</script>'

    const result = renderNewsletterEmail({
      campaign: unsafe,
      baseUrl: 'https://diario.dopovo.com.br',
      unsubscribeUrl: 'https://diario.dopovo.com.br/newsletter/unsubscribe/token'
    })

    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })
})
