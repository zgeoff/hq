import { z } from 'zod';

export const refreshSchema = z.record(
  z.string(),
  z.object({
    sessionId: z.string(),
    phase: z.enum(['idle', 'asked', 'restarting']),
    askedAt: z.string().optional(),
    answerReadAt: z.string().optional(),
    eventSeq: z.number().optional(),
    retryAt: z.string().optional(),
    skips: z.number(),
    reported: z.boolean().optional(),
    scheduled: z.string().optional(),
  }),
);
export type RefreshMap = z.infer<typeof refreshSchema>;
export type RefreshPhase = RefreshMap[string]['phase'];
