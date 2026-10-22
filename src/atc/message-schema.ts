import { z } from 'zod';

// atc 5.0.0 answers a message with its id and status.
export const messageSchema = z.looseObject({ message: z.string(), status: z.string() });
