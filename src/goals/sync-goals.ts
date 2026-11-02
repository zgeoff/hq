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

interface SyncGoalsOptions {
  from: Date;
  env?: RunOpts['env'];
  maxRepoDays?: number;
  signal?: AbortSignal;
}

export async function syncGoals(db: Database, run: Runner, opts: SyncGoalsOptions, at: Date = now()): Promise<{ days: number; runs: number; closed: number; left: number; deployRuns: number; deployLeft: number; errors: string[] }> {
  const all = buildUTCDays(opts.from, at);
  const errors: string[] = [];
  const names = await loadRepos(run, opts.env);
  const want = names.flatMap((repo) => all.filter((day) => !isDayDone(db, 'ci', repo, day)).map((day) => [repo, day] as const)).toSorted((first, second) => second[1].localeCompare(first[1]));
  let runs = 0;
  let closed = 0;
  let days = 0;
  // Four repo-days at a time: the watcher's step has 120 s for about 80 of them.
  const todo = want.slice(0, opts.maxRepoDays ?? want.length);
  const left = want.length - todo.length;
  const worker = async () => {
    for (let job = todo.shift(); job && !opts.signal?.aborted; job = todo.shift()) {
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
  opts.signal?.throwIfAborted();
  const dep = await syncDeploys(db, run, opts.env, at, DEPLOY_BATCH, opts.from);
  errors.push(...dep.errors);
  let first = true;
  for (const d of all) {
    if (isDayDone(db, 'closed', '*', d)) {
      continue;
    }
    opts.signal?.throwIfAborted();
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
