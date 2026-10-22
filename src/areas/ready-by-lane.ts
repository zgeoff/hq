import { z } from 'zod';

export const READY_BY_LANE = z.record(z.string(), z.object({ n: z.number(), at: z.string() }));
export type LaneReady = z.infer<typeof READY_BY_LANE>[string];

const SKIPPED = z.object({ issue: z.string(), reason: z.string() });

export const READY_DETAIL = z.object({ at: z.string(), total: z.number().nullable(), skipped: z.array(SKIPPED) }).nullable();
