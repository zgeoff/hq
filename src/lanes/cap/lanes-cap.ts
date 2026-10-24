import { z } from 'zod';

export const LANES_CAP = z.object({
  cap: z.number().int().nonnegative(),
  until: z.iso.datetime().nullable(),
  reason: z.string().nullable(),
  by: z.string(),
  at: z.iso.datetime(),
});

export type LanesCap = z.output<typeof LANES_CAP>;
