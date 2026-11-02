import { z } from 'zod';
import { sessionSchema } from './session-schema.ts';

export const sessionListRequiredSchema = z.looseObject({ sessions: z.array(sessionSchema) });
