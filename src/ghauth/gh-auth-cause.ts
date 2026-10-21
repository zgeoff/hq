import type { Database } from 'bun:sqlite';
import { getMeta } from '../db/get-meta.ts';

// The cause to name, when the last GitHub call hq made failed on auth.
export function ghAuthCause(db: Database): string | null {
  const at = getMeta(db, 'gh_auth_failed_at');
  if (!at) return null;
  return `GitHub auth failed (401) for hq's gh calls since ${getMeta(db, 'gh_auth_failed_since') || at}; check GITHUB_TOKEN/GH_TOKEN in hq-lanes' environment, then gh auth status`;
}
