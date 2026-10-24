import { z } from 'zod';

export const USAGE_SAMPLE = z.object({
  at: z.string(),
  account: z.string(),
  five_hour: z.number().nullable(),
  seven_day: z.number().nullable(),
  five_hour_resets_at: z.string().nullable(),
  seven_day_resets_at: z.string().nullable(),
});

export type UsageSample = z.output<typeof USAGE_SAMPLE>;
