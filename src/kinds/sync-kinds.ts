// PR kinds: every merged zgeoff PR, its kind from the conventional-commit title prefix, and the
// Linear issue its body names; with linear.ts, each issue's Type and the issues closed each Sydney
// week. Three bug shares: fix PRs, PRs for Bug issues, closed Bug issues.
import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { config } from '../config/config.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { DAY } from './day.ts';
import { syncDay } from './sync-day.ts';
import { toUTCDay as utcDay } from './to-utc-day.ts';

// Every day from `from` to today that has no record yet, oldest first; today always. At most
// maxDays fetches, so a tick stays short; the backfill passes a large max.
export async function syncKinds(db: Database, run: Runner, opts: { from: Date; maxDays: number; env?: RunOpts['env'] }, at: Date = now()): Promise<{ days: string[]; prs: number; left: number }> {
  const have = new Set((db.query('SELECT day FROM merged_pr_days').all() as { day: string }[]).map((r) => r.day));
  const want: string[] = [];
  for (let t = Date.parse(`${utcDay(opts.from.getTime())}T00:00:00Z`); t <= at.getTime(); t += DAY) {
    const d = utcDay(t);
    if (!have.has(d)) want.push(d);
  }
  const days = want.slice(0, opts.maxDays);
  let prs = 0;
  // GitHub's search API allows 30 requests a minute: space them, or a backfill hits the limit.
  const gap = config().HQ_SEARCH_GAP_MS;
  for (const [i, d] of days.entries()) {
    if (i > 0 && gap > 0) await Bun.sleep(gap);
    prs += await syncDay(db, run, d, opts.env, at);
  }
  return { days, prs, left: want.length - days.length };
}
