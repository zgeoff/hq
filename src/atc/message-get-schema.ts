import { z } from 'zod';

// atc's message.get: a sent message's outcome. unanswered is final; delivered stays so for a
// session that never answers.
export const messageGetSchema = z.looseObject({
  message: z.string(),
  session: z.string(),
  from: z.string(),
  sender: z.looseObject({}),
  text: z.string(),
  status: z.enum(['queued', 'delivered', 'answered', 'unanswered']),
  sentAt: z.number(),
  deliveredAt: z.number().nullable(),
  answeredAt: z.number().nullable(),
  answer: z.string().nullable(),
  turn: z.unknown(),
  answeredWith: z.array(z.unknown()),
});
export type MessageGet = z.infer<typeof messageGetSchema>;
