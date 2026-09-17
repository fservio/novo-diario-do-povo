import { describe, expect, it } from 'vitest'
import type { HomePost } from '../../packages/core/db/home'
import { selectEditorialHighlights } from '../../packages/core/web/home'

function post(id: number): HomePost {
  return {
    id,
    slug: `materia-${id}`,
    title: `Matéria ${id}`,
    excerpt: `Resumo ${id}`,
    published_at: '2026-08-22T12:00:00.000Z',
    featured_image_r2_key: null,
    category_name: 'Política',
    category_slug: 'politica',
    author_name: 'Redação'
  }
}

describe('editorial home highlights', () => {
  it('fills four cards with stories not already used in the lead area', () => {
    const result = selectEditorialHighlights({
      hero: post(1),
      hotRail: [post(2), post(3), post(4), post(5), post(6), post(7), post(8)],
      dualFeatures: [post(2), post(3)],
      explainers: [post(9)]
    })

    expect(result.map(item => item.id)).toEqual([9, 5, 6, 7])
  })

  it('does not repeat a story when sources overlap', () => {
    const result = selectEditorialHighlights({
      hero: post(1),
      hotRail: [post(2), post(3), post(4), post(5), post(5), post(6)],
      dualFeatures: [post(5), post(6)],
      explainers: [post(5)]
    })

    expect(result.map(item => item.id)).toEqual([5, 6])
  })
})
