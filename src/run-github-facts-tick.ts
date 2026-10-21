import type { Database } from 'bun:sqlite';
import { iso } from './clock/iso.ts';
import { now } from './clock/now.ts';
import { getMeta } from './db/get-meta.ts';
import { setMeta } from './db/set-meta.ts';
import type { Runner } from './runner/types.ts';
import { attachGitHubPRs } from './runs/attach-github-prs.ts';
import { closeGitHubRunPRs } from './runs/close-github-run-prs.ts';

// At most every 10 min, the watcher attaches PRs to runs, then learns which run PRs merged or
// closed, so a PR opened and merged between passes gets its merge in one pass. The throttle is set
// before the reads, so a pass that fails or hangs waits its 10 min too.
export async function runGitHubFactsTick(db: Database, run: Runner, at: Date = now()): Promise<{ closed: string[]; attached: string[]; errors: string[] } | null> {
  const CHECKED_AT = 'run_prs_checked_at';
  const checkedAt = getMeta(db, CHECKED_AT);
  const last = Date.parse(checkedAt ?? '1970-01-01T00:00:00Z');
  if (at.getTime() - last < 10 * 60_000) {
    return null;
  }
  setMeta(db, CHECKED_AT, iso(at));

  // The merged search reaches an hour before the last pass, for search lag, and at least a day.
  const dayBack = at.getTime() - 24 * 60 * 60_000;
  const reach = checkedAt === null ? dayBack : Math.min(last - 60 * 60_000, dayBack);
  const mergedSince = new Date(reach);
  const attach = await attachGitHubPRs(db, run, mergedSince);
  const closed = await closeGitHubRunPRs(db, run);
  return { closed: closed.closed, attached: attach.attached, errors: [...closed.errors, ...attach.errors] };
}
