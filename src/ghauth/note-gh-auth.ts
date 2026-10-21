// GitHub auth failures in the watcher's gh calls (2026-10-17: a bad GITHUB_TOKEN made every call
// 401 for a day, and hq health said only "no run today"). The last one is kept in meta, so the
// checks that depend on GitHub data can name the cause.
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
