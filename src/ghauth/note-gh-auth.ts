// The last GitHub auth failure is kept in meta (a bad GITHUB_TOKEN once made every call 401
// for a day, and hq health said only "no run today").
import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { getMeta } from '../db/get-meta.ts';
import { setMeta } from '../db/set-meta.ts';
import { isGhAuthFailure } from './is-gh-auth-failure.ts';

export function noteGhAuth(db: Database, text: string): void {
  if (!isGhAuthFailure(text)) return;
  if (!getMeta(db, 'gh_auth_failed_since')) setMeta(db, 'gh_auth_failed_since', iso(now()));
  setMeta(db, 'gh_auth_failed_at', iso(now()));
}
