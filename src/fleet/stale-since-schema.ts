import { z } from 'zod';

// meta fleet_stale_since: when each declared name's session first read stale, and the commit.
export const staleSinceSchema = z.record(z.string(), z.object({ sessionId: z.string(), at: z.string(), commit: z.string() }));
export type StaleSinceMap = z.infer<typeof staleSinceSchema>;
