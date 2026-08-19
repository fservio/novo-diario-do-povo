import { describe, expect, it } from 'vitest'
import {
  editorialDraftZod,
  editorialFactCheckZod,
  editorialTriageZod,
  extractOpenAiResponseText
} from '../../packages/core/editorial-ai/openai'
import { describeSourcePolicy, materialCanBeSentToAi } from '../../packages/core/editorial-ai/service'
import type { EditorialMaterial } from '../../packages/core/editorial-ai/types'

describe('Redação IA', () => {
  it('extrai a saída textual da Responses API', () => {
    expect(extractOpenAiResponseText({ output_text: '  {"ok":true}  ' })).toBe('{"ok":true}')
    expect(extractOpenAiResponseText({
      output: [{ content: [{ type: 'output_text', text: '{"parte":' }, { type: 'output_text', text: '2}' }] }]
    })).toBe('{"parte":\n2}')
  })

  it('rejeita respostas editoriais incompletas e aceita estruturas válidas', () => {
    expect(() => editorialTriageZod.parse({ summary: 'Sem os demais campos' })).toThrow()
    expect(() => editorialDraftZod.parse({ title: 'Só um título' })).toThrow()
    expect(() => editorialFactCheckZod.parse({ overall_assessment: '' })).toThrow()

    const triage = editorialTriageZod.parse({
      summary: 'A pauta tem relevância local.',
      topics: ['saúde'],
      local_angle: 'Impacto nos municípios do Piauí.',
      relevance_score: 82,
      sensitivity: 'sensitive',
      risks: ['Confirmar o número de beneficiários.']
    })
    expect(triage.relevance_score).toBe(82)
  })

  it('mantém materiais confidenciais fora do envio à IA', () => {
    const material = { is_confidential: 1 } as EditorialMaterial
    expect(materialCanBeSentToAi(material)).toBe(false)
    expect(materialCanBeSentToAi({ ...material, is_confidential: 0 })).toBe(true)
  })

  it('diferencia monitoramento, síntese e conteúdo licenciado', () => {
    expect(describeSourcePolicy({ usage_policy: 'link_only' })).toContain('não publique')
    expect(describeSourcePolicy({ usage_policy: 'summary' })).toContain('atribua')
    expect(describeSourcePolicy({ usage_policy: 'licensed' })).toContain('contratuais')
  })
})
