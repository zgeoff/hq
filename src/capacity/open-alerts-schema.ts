import { z } from 'zod';

export const OPEN_ALERTS_SCHEMA = z.record(z.string(), z.object({ since: z.string(), line: z.string(), told: z.boolean() }));
