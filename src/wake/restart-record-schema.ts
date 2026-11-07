import { z } from 'zod';

export const RestartRecordSchema = z.object({
  runID: z.string(),
  code: z.number(),
  restored: z.number(),
  total: z.number(),
  interrupted: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  failed: z.array(z.unknown()).optional(),
  error: z.unknown().optional(),
});
