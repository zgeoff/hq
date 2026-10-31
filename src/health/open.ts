import { z } from 'zod';

export const OPEN = z.record(z.string(), z.object({ since: z.string(), line: z.string(), asked: z.string().optional(), escalated: z.boolean().optional() }));
