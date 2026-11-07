import { z } from 'zod';

// A field of the wrong type reads as missing, so the imp check reports it as a missing reading.
/* oxlint-disable promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's .catch, not a promise's */
const impSchema = z.object({ freeMib: z.number().optional().catch(undefined), room: z.boolean().optional().catch(undefined), error: z.string().optional().catch(undefined) });
const providerSchema = z.object({ room: z.boolean().optional().catch(undefined), unattended: z.boolean().optional().catch(undefined), target: z.string().optional().catch(undefined) });

export const CapacitySchema = z.object({
  imp: impSchema.optional().catch(undefined),
  providers: z.record(z.string(), providerSchema).optional().catch(undefined),
});
/* oxlint-enable promise/prefer-await-to-then, unicorn/prefer-top-level-await */
