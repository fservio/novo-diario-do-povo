import { afterEach, describe, expect, it, vi } from 'vitest'
import { investigateFollowup } from '../../packages/core/editorial-ai/neural-followup'
import type { Env } from '../../packages/core/types'

vi.mock('../../packages/core/editorial-ai/openai', async importOriginal => ({
  ...await importOriginal<typeof import('../../packages/core/editorial-ai/openai')>(),
  getEditorialAiRuntimeConfig: async () => ({ enabled: true, model: 'pilot-test-model' })
}))

const source = 'https://www25.senado.leg.br/documento'
const env = { OPENAI_API_KEY: 'local-fixture-key' } as Env

function round(answers: unknown[], leads: unknown[] = [], sources = [source]) {
  return Response.json({
    status: 'completed',
    output_text: JSON.stringify({ answers, leads }),
    output: [{ type: 'web_search_call', action: { sources: sources.map(url => ({ url })) } }]
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('Aprofundamento de Política', () => {
  it('consulta apenas as lacunas com fonte identificada na segunda rodada', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(round([{ id: 0, answer: 'Comprovado', urls: [source] }],
        [{ id: 1, url: source }, { id: 2, url: 'https://example.com' }]))
      .mockResolvedValueOnce(round([{ id: 1, answer: 'Confirmado', urls: [source] }],
        [{ id: 2, url: source }]))
    vi.stubGlobal('fetch', fetch)
    const save = vi.fn()
    const result = await investigateFollowup(env, ['Primeira', 'Segunda', 'Terceira'], 'Pauta', save)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(JSON.parse(fetch.mock.calls[1][1].body).input).questions)
      .toEqual([{ id: 1, question: 'Segunda', lead: source }])
    expect(result.map(item => item.answer)).toEqual(['Comprovado', 'Confirmado', null])
    expect(save.mock.calls.map(call => call[0])).toEqual([1, 2])
  })

  it('encerra a apuração sem fonte consultada e mantém a pergunta em aberto', async () => {
    const fetch = vi.fn().mockResolvedValue(round([
      { id: 0, answer: 'Sem evidência', urls: ['https://example.com'] }
    ], [], []))
    vi.stubGlobal('fetch', fetch)
    const result = await investigateFollowup(env, ['Pergunta'], 'Pauta', vi.fn())
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ question: 'Pergunta', answer: null, urls: [] }])
  })
})
