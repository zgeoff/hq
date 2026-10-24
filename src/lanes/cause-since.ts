import { z } from 'zod';

export const CAUSE_SINCE = z.object({ cause: z.enum(['delivery', 'triage', 'supply', 'unknown']), since: z.string() }).nullable();
