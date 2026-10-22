import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';

export const SKIP_UNREAD_KEY = 'lanes_skips_unread';

// The until issues the last Ready tick could not read from Linear, each with why; their skips stay
// in force until a read settles them.
export function readSkipUnread(db: Database): Record<string, string> {
  return metaJson(db, SKIP_UNREAD_KEY, z.record(z.string(), z.string()), {});
}
