// Team-goals numbers per Sydney day and week. GitHub is the source for CI runs (cloud's
// deploy-prod among them) and PRs closed unmerged; z-delivery's log gives DEPLOY and HOLD lines;
// merged PRs come from merged_prs (kinds.ts). A past UTC day is fetched once.
import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { config } from '../config/config.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { DEPLOY_BATCH } from './deploy-batch.ts';
import { loadRepos } from './load-repos.ts';
import { syncClosedDay } from './sync-closed-day.ts';
import { syncDeploys } from './sync-deploys.ts';
import { syncRunsDay } from './sync-runs-day.ts';
import { toUTCDay } from './to-utc-day.ts';

const DAY = 86_400_000;

// Every UTC day from `from` to today not yet done, for every repo and for closed PRs.
export async function syncGoals(db: Database, run: Runner, opts: { from: Date; env?: RunOpts['env']; maxRepoDays?: number }, at: Date = now()): Promise<{ days: number; runs: number; closed: number; left: number; deployRuns: number; deployLeft: number; errors: string[] }> {
  const all = buildUTCDays(opts.from, at),
    errors: string[] = [],
    names = await loadRepos(run, opts.env),
    want = names.flatMap((repo) => all.filter((d) => !isDayDone(db, 'ci', repo, d)).map((d) => [repo, d] as const)).toSorted((a, b) => b[1].localeCompare(a[1]));
  let runs = 0;
  let closed = 0;
  let days = 0;
  // Four repo-days at a time: the watcher's step has 120 s for about 80 of them.
  // Newest days first, at most maxRepoDays a call: after a long gap the rest come on later calls.
  const todo = want.slice(0, opts.maxRepoDays ?? want.length);
  const left = want.length - todo.length;
  const worker = async () => {
    for (let job = todo.shift(); job; job = todo.shift()) {
      try {
        const n = await syncRunsDay(db, run, job[0], job[1], opts.env, at); // not runs += await: the workers would lose counts
        runs += n;
        days++;
      } catch (e) {
        errors.push(String((e as Error).message ?? e));
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const dep = await syncDeploys(db, run, opts.env, at, DEPLOY_BATCH, opts.from);
  errors.push(...dep.errors);
  let first = true;
  for (const d of all) {
    if (isDayDone(db, 'closed', '*', d)) {
      continue;
    }
    if (!first && getSearchGap() > 0) {
      await Bun.sleep(getSearchGap());
    }
    first = false;
    try {
      closed += await syncClosedDay(db, run, d, opts.env, at);
    } catch (e) {
      errors.push(String((e as Error).message ?? e));
    }
  }
  return { days, runs, closed, left, deployRuns: dep.fetched, deployLeft: dep.left, errors };
}

function buildUTCDays(from: Date, at: Date): string[] {
  const all: string[] = [];
  for (let t = Date.parse(`${toUTCDay(from.getTime())}T00:00:00Z`); t <= at.getTime(); t += DAY) {
    all.push(toUTCDay(t));
  }
  return all;
}

function getSearchGap(): number {
  return config().HQ_SEARCH_GAP_MS;
}

function isDayDone(db: Database, kind: string, key: string, day: string): boolean {
  return Boolean(db.query('SELECT 1 FROM goal_days WHERE kind = ? AND key = ? AND day = ?').get(kind, key, day));
}
