import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import type { Hold } from './types.ts';

export function currentHold(db: Database): Hold | null {
  return metaJson(db, 'hold', z.object({ reason: z.string(), since: z.string(), by: z.string() }).nullable(), null);
}
