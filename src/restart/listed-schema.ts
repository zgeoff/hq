import { z } from 'zod';

export const listedSchema = buildListedSchema();

function buildListedSchema() {
  const lifecycle = z.looseObject({ harness: z.string().optional() });
  const session = z.looseObject({ id: z.string(), alive: z.boolean().optional(), lifecycle: lifecycle.optional() });
  return z.looseObject({ sessions: z.array(session).optional() });
}
