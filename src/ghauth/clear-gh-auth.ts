import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';

// A GitHub call that worked clears it, even when a backfill still has days left.
export function clearGhAuth(db: Database): void {
  if (getMeta(db, 'gh_auth_failed_at')) {
    setMeta(db, 'gh_auth_failed_at', '');
    setMeta(db, 'gh_auth_failed_since', '');
  }
}
