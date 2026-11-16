import { z } from 'zod'

export const publicationIdSchema = z.enum(['diario', 'do-povo'])
export type PublicationId = z.infer<typeof publicationIdSchema>
export const doPovoPublicDeliveryUnavailable = 'O Do Povo já aceita rascunhos. A publicação e o agendamento serão liberados com a entrega pública do portal.'
