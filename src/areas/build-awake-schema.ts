import { z } from 'zod';

const awakeSchema = z.object({ at: z.string(), idle: z.record(z.string(), z.string()).optional(), ids: z.array(z.string()), present: z.array(z.string()).optional(), local: z.array(z.string()).optional() }).nullable();

// The sweep's record of atc: the sessions awake, when each awake one went idle, the sessions present
// (awake or asleep), and the awake ones on this PC outside the fleet. A reading from before 0.54.16
// has no present list, and one from before the local list reads local as unknown.
export function buildAwakeSchema(): typeof awakeSchema {
  return awakeSchema;
}
