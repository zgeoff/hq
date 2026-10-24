import { z } from 'zod';

export const SLOT_ROWS = z.array(
  z.object({
    at: z.string(),
    slot: z.number(),
    status: z.string(),
    five_hour: z.number().nullable(),
    five_hour_resets_at: z.string().nullable(),
    seven_day: z.number().nullable(),
    seven_day_resets_at: z.string().nullable(),
    working_lanes: z.number(),
  }),
);
