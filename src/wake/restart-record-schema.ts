import { z } from 'zod';

const InterruptedSchema = z.object({ id: z.string(), name: z.string() });

export const RestartRecordSchema = z.object({
  runID: z.string(),
  code: z.number(),
  restored: z.number(),
  total: z.number(),
  interrupted: z.array(InterruptedSchema).optional(),
  failed: z.array(z.unknown()).optional(),
  error: z.unknown().optional(),
});
