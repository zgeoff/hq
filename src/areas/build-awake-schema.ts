import { z } from 'zod';

const awakeSchema = z.object({ at: z.string(), idle: z.record(z.string(), z.string()).optional(), ids: z.array(z.string()), present: z.array(z.string()).optional(), local: z.array(z.string()).optional() }).nullable();

export function buildAwakeSchema(): typeof awakeSchema {
  return awakeSchema;
}
