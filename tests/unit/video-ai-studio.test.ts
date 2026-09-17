import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { videoReviewZod, videoScriptZod } from '../../packages/core/video-ai/openai'
import { countVideoWords, estimateVideoSeconds, parseVideoReview } from '../../packages/core/video-ai/service'
import type { VideoScriptOutput } from '../../packages/core/video-ai/types'

function script(): VideoScriptOutput {
  return {
    title: 'Roteiro de teste', summary: 'Adaptação audiovisual.', estimated_duration_seconds: 10, word_count: 8,
    disclosure: 'Conteúdo apresentado com auxílio de avatar gerado por inteligência artificial.',
    segments: [{
      sequence: 1, speaker_role: 'anchor', segment_type: 'opening',
      dialogue: 'O Diário do Povo apresenta agora os principais fatos.', on_screen_text: 'Notícia',
      visual_cue: 'Capa da matéria', estimated_seconds: 6, factual_basis: ['Título da matéria']
    }],
    pronunciation_notes: [], editorial_notes: [], unresolved_points: []
  }
}

describe('Estúdio de Vídeo IA', () => {
  it('valida um roteiro jornalístico estruturado', () => {
    expect(videoScriptZod.parse(script()).segments[0].speaker_role).toBe('anchor')
  })

  it('rejeita funções que não pertencem à redação virtual', () => {
    const invalid = script() as any
    invalid.segments[0].speaker_role = 'host'
    expect(() => videoScriptZod.parse(invalid)).toThrow()
  })

  it('calcula palavras e duração estimada pelas falas', () => {
    const value = script()
    expect(countVideoWords(value)).toBe(9)
    expect(estimateVideoSeconds(140)).toBe(60)
  })

  it('mantém alertas de checagem com estado editorial explícito', () => {
    const review = videoReviewZod.parse({
      overall_assessment: 'Há uma data que precisa de revisão.', ready_for_human_review: true,
      issues: [{ severity: 'warning', segment_sequence: 1, claim: 'A medida começa amanhã.', evidence: '', status: 'needs_review', recommendation: 'Confirmar a data.' }]
    })
    expect(review.issues[0].status).toBe('needs_review')
    expect(parseVideoReview(JSON.stringify(review))?.issues).toHaveLength(1)
  })

  it('registra as rotas do fluxo antes da rota numérica de detalhe', () => {
    const routes = readFileSync(new URL('../../functions/index.ts', import.meta.url), 'utf8')
    expect(routes).toContain("app.get('/admin/video-ia/avatares'")
    expect(routes).toContain("app.post('/admin/video-ia/:id{[0-9]+}/gerar'")
    expect(routes).toContain("app.post('/admin/video-ia/:id{[0-9]+}/aprovar'")
    expect(routes.indexOf("app.get('/admin/video-ia/novo'")).toBeLessThan(routes.indexOf("app.get('/admin/video-ia/:id{[0-9]+}'"))
  })

  it('disponibiliza perfis editoriais iniciais para todas as funções', () => {
    const migration = readFileSync(new URL('../../migrations/0040_video_ai_default_avatars.sql', import.meta.url), 'utf8')
    expect(migration).toContain("'anchor'")
    expect(migration).toContain("'reporter'")
    expect(migration).toContain("'commentator'")
    expect(migration.match(/WHERE NOT EXISTS/g)).toHaveLength(3)
  })
})
