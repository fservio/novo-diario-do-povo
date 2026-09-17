import { describe, expect, it } from 'vitest'
import {
  editorialDraftZod,
  editorialFactCheckZod,
  editorialTriageZod,
  extractOpenAiResponseText
} from '../../packages/core/editorial-ai/openai'
import {
  buildEditorialDraftPrompt,
  describeSourcePolicy,
  materialCanBeSentToAi,
  resolveEditorialWordRange
} from '../../packages/core/editorial-ai/service'
import type { EditorialMaterial, EditorialWorkspace } from '../../packages/core/editorial-ai/types'

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

    const draft = editorialDraftZod.parse({
      hat: 'SERVIÇO',
      title: 'Nova medida passa a valer nesta semana',
      excerpt: 'Mudança alcança moradores da capital.',
      content_markdown: 'A nova medida entra em vigor nesta semana, segundo o documento oficial.',
      seo_title: 'Nova medida passa a valer nesta semana',
      seo_description: 'Entenda a mudança e quem será afetado.',
      originality_note: 'O texto organiza os fatos e destaca o impacto local.',
      editorial_plan: 'Lide, explicação da medida, impacto e próximo passo.',
      reporting_gaps: ['Confirmar o número total de beneficiários.'],
      quality_assessment: 'A versão está sustentada, mas ainda depende do dado de alcance.',
      claims: []
    })
    expect(draft.reporting_gaps).toHaveLength(1)
  })

  it('define extensão por gênero e respeita uma meta editorial explícita', () => {
    expect(resolveEditorialWordRange('report', 'deep')).toEqual([1200, 1800])
    expect(resolveEditorialWordRange('news', 'standard', 1000)).toEqual([850, 1150])
  })

  it('monta um contrato editorial completo para a geração', () => {
    const workspace = {
      title: 'Governo anuncia nova medida',
      brief: 'Explique o impacto para os municípios.',
      editorial_format: 'report',
      editorial_depth: 'deep',
      target_word_count: null,
      primary_angle: 'Efeito sobre os serviços municipais',
      target_audience: 'Moradores do Piauí',
      geographic_scope: 'Piauí',
      required_information: 'Cronograma de implantação',
      key_questions: 'Quando começa?\nQuem será afetado?',
      sensitivity: 'normal',
      usage_policy: 'summary'
    } as EditorialWorkspace
    const prompt = buildEditorialDraftPrompt(workspace, '[FONTE 1]\nConteúdo apurado')

    expect(prompt).toContain('FORMATO: reportagem contextualizada')
    expect(prompt).toContain('FAIXA DE EXTENSÃO: 1200 a 1800 palavras')
    expect(prompt).toContain('Efeito sobre os serviços municipais')
    expect(prompt).toContain('O primeiro parágrafo entrega o fato mais relevante')
    expect(prompt).toContain('<FONTES_NAO_CONFIAVEIS>')
    expect(prompt).toContain('Não preencha lacunas para atingir a faixa')
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
