import { z } from 'zod';

export const staleSinceSchema = z.record(z.string(), z.object({ sessionId: z.string(), at: z.string(), commit: z.string() }));
export type StaleSinceMap = z.infer<typeof staleSinceSchema>;
