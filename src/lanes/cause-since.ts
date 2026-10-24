import { z } from 'zod';

// The cause the last look tagged and when it began; null while no cause holds.
export const CAUSE_SINCE = z.object({ cause: z.string(), since: z.string() }).nullable();
