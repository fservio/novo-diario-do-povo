import type { Env } from '../types'
import type { NeuralDossier } from './neural-dossier'
import { followupLimit, followupResultSchema, investigateFollowup } from './neural-followup'
import { requestEditorialCopydesk, requestEditorialDraft, requestEditorialFactCheck, requestEditorialTriage } from './openai'
import type { z } from 'zod'

export type NeuralAnswers = z.infer<typeof followupResultSchema>

export async function runNeuralEditorialPipeline(env: Env, db: D1Database, draftId: string,
  topic: string, dossier: NeuralDossier, priorAnswers: NeuralAnswers) {
  async function step<T>(stage: string, action: () => Promise<T>): Promise<T> {
    await db.prepare('INSERT INTO neural_draft_steps (draft_id, stage) VALUES (?, ?)').bind(draftId, stage).run()
    try {
      const result = await action()
      await db.prepare(`
        UPDATE neural_draft_steps SET outcome = 'completed', ended_at = unixepoch(), result_json = ?
        WHERE draft_id = ? AND stage = ?
      `).bind(JSON.stringify(result), draftId, stage).run()
      return result
    } catch (error) {
      await db.prepare(`
        UPDATE neural_draft_steps SET outcome = 'failed', ended_at = unixepoch()
        WHERE draft_id = ? AND stage = ?
      `).bind(draftId, stage).run()
      throw error
    }
  }

  const answers = new Map<string, NeuralAnswers[number]>()
  for (const result of priorAnswers) {
    if (result.answer && result.urls.length && !answers.has(result.question)) answers.set(result.question, result)
  }
  const questions = [...new Set(dossier.open_questions)].filter(question => !answers.has(question))
  const briefing = await step('chief', async () => (await requestEditorialTriage(env,
    `Defina o foco editorial da pauta ${topic}. Use o dossiê como material de referência.
<FONTES_NAO_CONFIAVEIS>${JSON.stringify({ findings: dossier.findings, questions })}</FONTES_NAO_CONFIAVEIS>`)).data)
  if (questions.length) {
    const followup = await step('reporter', () => investigateFollowup(env, questions.slice(0, followupLimit), topic,
      async (round, result) => {
        await db.prepare('UPDATE neural_draft_steps SET result_json = ? WHERE draft_id = ? AND stage = ?')
          .bind(JSON.stringify({ round, result }), draftId, 'reporter').run()
      }))
    for (const result of followup) {
      if (result.answer && result.urls.length) answers.set(result.question, result)
    }
  }
  const evidence = JSON.stringify({
    findings: dossier.findings, followups: [...answers.values()],
    pending: questions.filter(question => !answers.has(question))
  })
  const sources = `<FONTES_NAO_CONFIAVEIS>${evidence}</FONTES_NAO_CONFIAVEIS>`
  const draft = await step('writer', async () => (await requestEditorialDraft(env,
    `Redija a pauta ${topic}. Registre as lacunas relevantes em reporting_gaps. Use apenas as evidências fornecidas.
<DIRECAO_EDITORIAL>${JSON.stringify(briefing)}</DIRECAO_EDITORIAL>\n${sources}`)).data)
  const review = await step('checker', async () => (await requestEditorialFactCheck(env,
    `${sources}\n<RASCUNHO_PARA_COPIDESQUE>${JSON.stringify(draft)}</RASCUNHO_PARA_COPIDESQUE>`)).data)
  const copydesk = async (draft: unknown, review: unknown) => (await requestEditorialCopydesk(env,
    `Corrija ou retire as afirmações sem apoio. Considere a checagem como avaliação, e fundamente o texto nas fontes.
${sources}\n<RASCUNHO_PARA_COPIDESQUE>${JSON.stringify({ draft, review })}</RASCUNHO_PARA_COPIDESQUE>`)).data
  let revised = await step('copydesk', () => copydesk(draft, review))
  const allowedUrls = new Set([...dossier.findings.map(finding => finding.url),
    ...[...answers.values()].flatMap(answer => answer.urls)])
  const evaluate = async () => {
    const evaluation = (await requestEditorialFactCheck(env,
      `Faça o parecer editorial da versão revisada. Verifique título, subtítulo e corpo. Aponte afirmações sem apoio e lacunas que impeçam a entrega.
${sources}\n<RASCUNHO_PARA_COPIDESQUE>${JSON.stringify(revised)}</RASCUNHO_PARA_COPIDESQUE>`)).data
    const hasEvidence = evaluation.claims.length > 0 && evaluation.claims.every(claim =>
      claim.status === 'confirmed' && allowedUrls.has(claim.source_url))
    return { ...evaluation, needsReview: !hasEvidence }
  }
  let decision = await step('editor', evaluate)
  if (decision.needsReview) {
    revised = await step('copydesk_retry', () => copydesk(revised, decision))
    decision = await step('editor_retry', evaluate)
  }
  revised.claims = decision.claims.map(claim => ({
    ...claim, source_url: allowedUrls.has(claim.source_url) ? claim.source_url : ''
  }))
  return revised
}
