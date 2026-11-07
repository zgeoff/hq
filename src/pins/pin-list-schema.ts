import { z } from 'zod';

// atc may add or drop a lifecycle field, so a malformed one reads as missing.
/* oxlint-disable promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's .catch, not a promise's */
const lifecycleSchema = z.looseObject({ desired: z.string().optional().catch(undefined), vm: z.string().optional().catch(undefined), harness: z.string().optional().catch(undefined) });
const pinSessionSchema = z.looseObject({ id: z.string(), name: z.string(), state: z.string(), alive: z.boolean(), pinned: z.boolean().optional().catch(undefined), lifecycle: lifecycleSchema.optional().catch(undefined) });
/* oxlint-enable promise/prefer-await-to-then, unicorn/prefer-top-level-await */

export const pinListSchema = z.looseObject({ sessions: z.array(pinSessionSchema) });
