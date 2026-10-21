import { z } from 'zod';

export const TREE_SYNC = z.object({ at: z.string(), ok: z.boolean(), changed: z.boolean(), line: z.string(), transient: z.boolean().optional(), reattached: z.string().optional() });
