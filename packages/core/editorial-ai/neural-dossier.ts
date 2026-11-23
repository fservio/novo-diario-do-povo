import { z } from 'zod'

const text = z.string().trim().min(1).max(12000)
const url = z.string().url().max(2048)

export const neuralDossierSchema = z.object({
  findings: z.array(z.object({
    claim: text,
    quote: text,
    url,
    source_title: text,
    consulted_at: z.string().datetime()
  }).strict()).max(30),
  source_results: z.array(z.object({
    url,
    kind: z.enum(['jornalistica', 'institucional']),
    status: z.number().int().nullable()
  }).strict()).max(8),
  open_questions: z.array(text).max(50)
}).strict()

export type NeuralDossier = z.infer<typeof neuralDossierSchema>
