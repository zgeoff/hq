import { z } from 'zod';

// Readers share this schema, so a pending shape they don't read must not fail the parse.
// oxlint-disable-next-line promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's .catch, not a promise's
const pendingSchema = z.looseObject({ message: z.string().optional().catch(undefined) }).nullish().catch(undefined);

export const sessionGetSchema = z.looseObject({ lastActivityAt: z.number(), prompt: z.string().nullable(), pending: pendingSchema });
