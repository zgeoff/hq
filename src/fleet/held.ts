import { z } from 'zod';

export const HELD = z.array(z.object({ seq: z.number(), text: z.string() }));
