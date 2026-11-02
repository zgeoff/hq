import type { Database } from 'bun:sqlite';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';
import { getMeta } from './db/get-meta.ts';
import { setMeta } from './db/set-meta.ts';
import type { Runner } from './runner/types.ts';
import { attachGitHubPRs } from './runs/attach-github-prs.ts';
import { closeGitHubRunPRs } from './runs/close-github-run-prs.ts';

export async function runGitHubFactsTick(db: Database, run: Runner, at: Date = now()): Promise<{ closed: string[]; attached: string[]; errors: string[] } | null> {
  const CHECKED_AT = 'run_prs_checked_at';
  const MERGED_SINCE = 'run_prs_merged_since';
  const checkedAt = getMeta(db, CHECKED_AT);
  const last = Date.parse(checkedAt ?? '1970-01-01T00:00:00Z');
  if (at.getTime() - last < 10 * 60_000) {
    return null;
  }
  setMeta(db, CHECKED_AT, iso(at));

  // The merged search reaches an hour before its last full answer, for search lag.
  const searchedAt = getMeta(db, MERGED_SINCE) ?? checkedAt;
  const dayBack = at.getTime() - 24 * 60 * 60_000;
  const reach = searchedAt === null ? dayBack : Math.min(Date.parse(searchedAt) - 60 * 60_000, dayBack);
  const mergedSince = new Date(reach);
  const attach = await attachGitHubPRs(db, run, mergedSince);
  if (attach.mergedSearched) {
    setMeta(db, MERGED_SINCE, iso(at));
  } else if (getMeta(db, MERGED_SINCE) === null) {
    setMeta(db, MERGED_SINCE, iso(new Date(reach + 60 * 60_000)));
  }
  const closed = await closeGitHubRunPRs(db, run);
  return { closed: closed.closed, attached: attach.attached, errors: [...closed.errors, ...attach.errors] };
}
