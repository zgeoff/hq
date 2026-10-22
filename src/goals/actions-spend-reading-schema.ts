import { z } from 'zod';

// A good reading of the month's Actions spend as meta `actions_spend` holds it: when it was read,
// the UTC month it covers, and the net spend in US dollars. A failed read holds an error in place
// of net, so it fails this schema.
export const actionsSpendReadingSchema = z.object({
  at: z.iso.datetime(),
  month: z.string().regex(/^\d{4}-\d{2}$/u),
  net: z.number(),
});
export type ActionsSpendReading = z.infer<typeof actionsSpendReadingSchema>;
