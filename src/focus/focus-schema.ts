import { z } from 'zod';

const filterSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('class'), value: z.enum(['maintenance', 'roadmap']) }),
  z.object({ kind: z.literal('type'), value: z.enum(['bug', 'feature', 'chore', 'improvement', 'investigation']) }),
  z.object({ kind: z.literal('project'), value: z.string() }),
  z.object({ kind: z.literal('area'), value: z.string() }),
  z.object({ kind: z.literal('label'), value: z.string() }),
  z.object({ kind: z.literal('priority'), value: z.enum(['urgent', 'high+', 'medium+']) }),
]);

// The focus row's JSON columns, as hq focus set writes them. An area is any string here: one dropped
// from FOCUS_AREAS since then matches nothing, and its reserve lends, rather than failing every tick.
export const FOCUS_SCHEMA = {
  terms: z.array(z.object({ text: z.string(), filters: z.array(filterSchema) })),
  reserves: z.array(z.object({ area: z.string(), slots: z.number().int().positive() })),
};
