import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { config } from '../config/config.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { DAY } from './day.ts';
import { syncDay } from './sync-day.ts';
import { toUTCDay as utcDay } from './to-utc-day.ts';

export async function syncKinds(db: Database, run: Runner, opts: { from: Date; maxDays: number; env?: RunOpts['env'] }, at: Date = now()): Promise<{ days: string[]; prs: number; left: number }> {
  const have = new Set(runSyncQuery(db, kdb(db).selectFrom('merged_pr_days').select('day').compile(), buildRowSchema('merged_pr_days').pick({ day: true })).map((r) => r.day));
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
