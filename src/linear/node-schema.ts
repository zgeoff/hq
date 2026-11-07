import { z } from 'zod';

// The fields in FIELDS.
const LabelSchema = z.object({ name: z.string(), parent: z.object({ name: z.string() }).nullable() });

export const NodeSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  completedAt: z.string().nullable(),
  canceledAt: z.string().nullable(),
  labels: z.object({ nodes: z.array(LabelSchema) }),
});
