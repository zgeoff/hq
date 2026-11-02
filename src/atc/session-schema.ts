import { z } from 'zod';

// pluginDirs needs atc 4.15+, and an ended session may lack agentSessionID.
// oxlint-disable-next-line promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's .catch, not a promise's
export const sessionSchema = z.looseObject({ id: z.string(), name: z.string(), alive: z.boolean(), state: z.string(), agentSessionID: z.string().nullish().catch(undefined), pluginDirs: z.array(z.string()).nullish().catch(undefined), parent: z.string().nullish().catch(undefined), pinned: z.boolean().nullish().catch(undefined), cwd: z.string().nullish().catch(undefined), createdAt: z.number().nullish().catch(undefined), locator: z.looseObject({ targetID: z.string().nullish().catch(undefined) }).nullish().catch(undefined), lifecycle: z.looseObject({ vm: z.string().nullish().catch(undefined) }).nullish().catch(undefined) });
export type SessionInfo = z.infer<typeof sessionSchema>;
