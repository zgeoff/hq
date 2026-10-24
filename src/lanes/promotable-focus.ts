import { z } from 'zod';

export const PROMOTABLE_FOCUS = z.object({ at: z.string(), count: z.number().nullable(), focus: z.string(), error: z.string().nullable().default(null) }).nullable();
