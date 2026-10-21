import type { Database } from 'bun:sqlite';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { ISO_Z } from './iso-z.ts';
import { readGhJSON } from './read-gh-json.ts';
import { NAME } from './name.ts';
import { toUTCDay } from './to-utc-day.ts';
import { upsertGoalDay } from './upsert-goal-day.ts';

interface Run {
  id: number;
  path: string;
  event: string;
  status: string;
  conclusion: string | null;
  run_attempt: number;
  created_at: string;
  run_started_at: string | null;
  updated_at: string;
}

// One repo's workflow runs created on one UTC day, stored. A bad row refuses the day. The API lists
// at most 1000 runs per query, so a busier window is split in half, down to one hour (nixie ran
// 1,277 on 2026-10-16); an hour with 1000+ runs refuses the day.
const HOUR = 3_600_000;
export async function syncRunsDay(db: Database, run: Runner, repo: string, day: string, env?: RunOpts['env'], at: Date = now()): Promise<number> {
  if (!NAME.test(repo) || /^\.+$/.test(repo)) throw new HqError('bad_args', `bad repo name ${repo}`);
  const rows = new Map<number, Run>();
  const stamp = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const fetchWindow = async (from: number, to: number): Promise<void> => {
    const range = `${stamp(from)}..${stamp(to - 1000)}`;
    const got: Run[] = [];
    for (let page = 1; page <= 10; page++) {
      const j = (await readGhJSON(run, ['api', `repos/zgeoff/${repo}/actions/runs?created=${range}&per_page=100&page=${page}`], env, `runs of ${repo} on ${day}`)) as { total_count?: unknown; workflow_runs?: unknown };
      if (!Array.isArray(j.workflow_runs) || !Number.isSafeInteger(j.total_count) || (j.total_count as number) < 0) throw new HqError('command_failed', `runs of ${repo} on ${day}: not a run list`);
      if ((j.total_count as number) > 1000) {
        if (to - from <= HOUR) throw new HqError('too_many', `${repo} has ${j.total_count} runs in the hour from ${stamp(from)}, more than the API lists; not recorded`);
        const mid = from + Math.ceil((to - from) / 2 / HOUR) * HOUR;
        await fetchWindow(from, mid);
        await fetchWindow(mid, to);
        return;
      }
      for (const x of j.workflow_runs as Partial<Run>[]) {
        if (!goodRun(x, day)) throw new HqError('command_failed', `runs of ${repo} on ${day}: a run hq can't read; not recorded`);
        got.push(x);
      }
      if (j.workflow_runs.length < 100) break;
    }
    for (const r of got) rows.set(r.id, r);
  };
  const start = Date.parse(`${day}T00:00:00Z`);
  await fetchWindow(start, start + 24 * HOUR);
  db.transaction(() => {
    const up = db.query(`INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET status = excluded.status, conclusion = excluded.conclusion, attempt = excluded.attempt, started_at = excluded.started_at, updated_at = excluded.updated_at`);
    for (const r of rows.values()) up.run(r.id, repo, r.path, r.event, r.status, r.conclusion, r.run_attempt, r.created_at, r.run_started_at, r.updated_at);
    // A past day is done once every run in it has finished; one still running is fetched again.
    if (toUTCDay(at.getTime()) > day && [...rows.values()].every((r) => r.status === 'completed')) {
      upsertGoalDay(db, { kind: 'ci', key: repo, day, n: rows.size, at });
    }
  }).immediate();
  return rows.size;
}


function goodRun(x: Partial<Run>, day: string): x is Run {
  return (
    Number.isSafeInteger(x.id) &&
    x.id! > 0 &&
    typeof x.path === 'string' &&
    typeof x.event === 'string' &&
    typeof x.status === 'string' &&
    (x.conclusion === null || typeof x.conclusion === 'string') &&
    Number.isSafeInteger(x.run_attempt) &&
    x.run_attempt! >= 1 &&
    typeof x.created_at === 'string' &&
    ISO_Z.test(x.created_at) &&
    x.created_at.slice(0, 10) === day &&
    (x.run_started_at === null || (typeof x.run_started_at === 'string' && ISO_Z.test(x.run_started_at))) &&
    typeof x.updated_at === 'string' &&
    ISO_Z.test(x.updated_at)
  );
}
