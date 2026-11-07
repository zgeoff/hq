import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { ISO_Z } from './iso-z.ts';
import { readGhJSON } from './read-gh-json.ts';
import { NAME } from './name.ts';
import { toUTCDay } from './to-utc-day.ts';
import { upsertGoalDay } from './upsert-goal-day.ts';

const RunSchema = z.object({
  id: z.number().int().safe().positive(),
  path: z.string(),
  event: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  run_attempt: z.number().int().safe().min(1),
  created_at: z.string().regex(ISO_Z),
  run_started_at: z.string().regex(ISO_Z).nullable(),
  updated_at: z.string().regex(ISO_Z),
});
const RunListSchema = z.object({ total_count: z.number().int().safe().min(0), workflow_runs: z.array(z.unknown()) });

type Run = z.output<typeof RunSchema>;

// The API lists at most 1000 runs per query, so a busier window is split in half, down to one hour
// (nixie ran 1,277 on 2026-10-16).
const HOUR = 3_600_000;
export async function syncRunsDay(db: Database, run: Runner, repo: string, day: string, env?: RunOpts['env'], at: Date = now()): Promise<number> {
  if (!NAME.test(repo) || /^\.+$/.test(repo)) throw new HqError('bad_args', `bad repo name ${repo}`);
  const rows = new Map<number, Run>();
  const stamp = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const fetchWindow = async (from: number, to: number): Promise<void> => {
    const range = `${stamp(from)}..${stamp(to - 1000)}`;
    const got: Run[] = [];
    for (let page = 1; page <= 10; page++) {
      const body = await readGhJSON(run, ['api', `repos/zgeoff/${repo}/actions/runs?created=${range}&per_page=100&page=${page}`], env, `runs of ${repo} on ${day}`);
      const list = RunListSchema.safeParse(body);
      if (!list.success) {
        throw new HqError('command_failed', `runs of ${repo} on ${day}: not a run list`);
      }
      const listed = list.data;
      if (listed.total_count > 1000) {
        if (to - from <= HOUR) {
          throw new HqError('too_many', `${repo} has ${listed.total_count} runs in the hour from ${stamp(from)}, more than the API lists; not recorded`);
        }
        const mid = from + Math.ceil((to - from) / 2 / HOUR) * HOUR;
        await fetchWindow(from, mid);
        await fetchWindow(mid, to);
        return;
      }
      for (const entry of listed.workflow_runs) {
        const parsedRun = RunSchema.safeParse(entry);
        if (!parsedRun.success || parsedRun.data.created_at.slice(0, 10) !== day) {
          throw new HqError('command_failed', `runs of ${repo} on ${day}: a run hq can't read; not recorded`);
        }
        got.push(parsedRun.data);
      }
      if (listed.workflow_runs.length < 100) {
        break;
      }
    }
    for (const r of got) rows.set(r.id, r);
  };
  const start = Date.parse(`${day}T00:00:00Z`);
  await fetchWindow(start, start + 24 * HOUR);
  db.transaction(() => {
    const up = db.query(`INSERT INTO ci_runs (id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET status = excluded.status, conclusion = excluded.conclusion, attempt = excluded.attempt, started_at = excluded.started_at, updated_at = excluded.updated_at`);
    for (const r of rows.values()) up.run(r.id, repo, r.path, r.event, r.status, r.conclusion, r.run_attempt, r.created_at, r.run_started_at, r.updated_at);
    if (toUTCDay(at.getTime()) > day && [...rows.values()].every((r) => r.status === 'completed')) {
      upsertGoalDay(db, { kind: 'ci', key: repo, day, n: rows.size, at });
    }
  }).immediate();
  return rows.size;
}
