import { z } from 'zod';

const SKIPPED = z.object({ issue: z.string(), reason: z.string() });

export const READY_DETAIL = z.object({ at: z.string(), total: z.number().nullable(), skipped: z.array(SKIPPED) }).nullable();
