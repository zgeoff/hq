import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { RC_PENDING } from './rc-pending.ts';
import type { RcPending } from './types.ts';

export function loadRcPending(db: Database): Record<string, RcPending> {
  const marker = z.object({ id: z.string(), since: z.string(), typedAt: z.string().optional() });
  return metaJson(db, RC_PENDING, z.record(z.string(), marker), {});
}
