import { z } from 'zod';
import { sessionSchema } from './session-schema.ts';

// For callers that must have the list: a missing one is a bad answer, not an empty fleet.
export const sessionListRequiredSchema = z.looseObject({ sessions: z.array(sessionSchema) });
