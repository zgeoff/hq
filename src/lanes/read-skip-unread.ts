import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { metaJson } from '../db/meta-json.ts';
import { SKIP_UNREAD_KEY } from './skip-unread-key.ts';

export function readSkipUnread(db: Database): Record<string, string> {
  return metaJson(db, SKIP_UNREAD_KEY, z.record(z.string(), z.string()), {});
}
