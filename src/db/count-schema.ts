import { z } from 'zod';

export const CountSchema = z.object({ n: z.number() });
