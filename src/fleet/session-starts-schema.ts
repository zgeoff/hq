import { z } from 'zod';

export const sessionStartsSchema = z.record(z.string(), z.object({ sessionId: z.string(), at: z.string() }));
export type SessionStartsMap = z.infer<typeof sessionStartsSchema>;
