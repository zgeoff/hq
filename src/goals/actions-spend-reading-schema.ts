import { z } from 'zod';

export const actionsSpendReadingSchema = z.object({
  at: z.iso.datetime(),
  month: z.string().regex(/^\d{4}-\d{2}$/u),
  net: z.number(),
});
export type ActionsSpendReading = z.infer<typeof actionsSpendReadingSchema>;
