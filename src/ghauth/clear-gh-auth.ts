import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';

export function clearGhAuth(db: Database): void {
  if (getMeta(db, 'gh_auth_failed_at')) {
    setMeta(db, 'gh_auth_failed_at', '');
    setMeta(db, 'gh_auth_failed_since', '');
  }
}
