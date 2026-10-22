import { z } from 'zod';

// meta fleet_session_starts: when each scheduled session's current id started.
export const sessionStartsSchema = z.record(z.string(), z.object({ sessionId: z.string(), at: z.string() }));
export type SessionStartsMap = z.infer<typeof sessionStartsSchema>;
