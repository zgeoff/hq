import { z } from 'zod';

export const sessionGetSchema = z.looseObject({ lastActivityAt: z.number(), prompt: z.string().nullable() });
