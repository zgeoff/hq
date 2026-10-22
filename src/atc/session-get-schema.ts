import { z } from 'zod';

// `prompt` is the text the session was first spawned with; atc revives a session with it.
export const sessionGetSchema = z.looseObject({ lastActivityAt: z.number(), prompt: z.string().nullable() });
