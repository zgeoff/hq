import { z } from 'zod';

// The fields in FIELDS.
export const NodeSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  completedAt: z.string().nullable(),
  canceledAt: z.string().nullable(),
  labels: z.object({ nodes: z.array(z.object({ name: z.string(), parent: z.object({ name: z.string() }).nullable() })) }),
});
