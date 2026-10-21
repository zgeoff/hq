import { z } from 'zod';
import { sessionSchema } from './session-schema.ts';

export const sessionListSchema = z.looseObject({ sessions: z.array(sessionSchema).optional() });
