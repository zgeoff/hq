import { z } from 'zod';

export const messageSchema = z.looseObject({ message: z.string(), status: z.string() });
