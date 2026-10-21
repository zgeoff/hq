import { z } from 'zod';

// The sweep's record of atc: the sessions awake, when each awake one went idle, and the sessions
// present (awake or asleep). A reading from before 0.54.16 has no present list.
export function buildAwakeSchema(): z.ZodNullable<z.ZodObject<{ at: z.ZodString; ids: z.ZodArray<z.ZodString>; idle: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>; present: z.ZodOptional<z.ZodArray<z.ZodString>> }>> {
  return z.object({ at: z.string(), idle: z.record(z.string(), z.string()).optional(), ids: z.array(z.string()), present: z.array(z.string()).optional() }).nullable();
}
