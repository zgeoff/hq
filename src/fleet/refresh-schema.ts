import { z } from 'zod';

// meta fleet_refresh: where each stale session stands in the restart. `scheduled` holds why a
// scheduled restart is due; without it the restart is for a stale prompt.
export const refreshSchema = z.record(
  z.string(),
  z.object({
    sessionId: z.string(),
    phase: z.enum(['idle', 'asked', 'restarting']),
    askedAt: z.string().optional(),
    eventSeq: z.number().optional(),
    retryAt: z.string().optional(),
    skips: z.number(),
    reported: z.boolean().optional(),
    scheduled: z.string().optional(),
  }),
);
export type RefreshMap = z.infer<typeof refreshSchema>;
export type RefreshPhase = RefreshMap[string]['phase'];
