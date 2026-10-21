import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { classifyDeploy } from './classify-deploy.ts';
import { DEPLOY } from './deploy.ts';
import { DEPLOY_BATCH } from './deploy-batch.ts';
import { readGhJSON } from './read-gh-json.ts';

// Classifies completed deploy-prod runs with no deploy_runs row for their current attempt (a re-run is classified again), at most `cap` a call:
// runs inside the window first, so old runs that keep failing can't take every slot, then the older ones, each oldest first.
// The jobs come from that attempt, so a re-run GitHub made since hq cached the run can't stand in for it.
// A run GitHub no longer has (404) is stored as unknown; any other failure gets no row and is tried
// again next sync. Only runs created since `from` hold back the check-in (`left`, `errors`): an
// older run that keeps failing goes to `oldErrors`.
export async function syncDeploys(db: Database, run: Runner, env?: RunOpts['env'], at: Date = now(), cap = DEPLOY_BATCH, from: Date = new Date(0)): Promise<{ fetched: number; left: number; errors: string[]; oldErrors: string[] }> {
  const since = iso(from);
  const todo = db.query(`SELECT c.id AS id, c.conclusion AS conclusion, c.attempt AS attempt, c.created_at AS created_at FROM ci_runs c LEFT JOIN deploy_runs d ON d.run_id = c.id WHERE c.repo = ? AND c.path = ? AND c.status = 'completed' AND (d.run_id IS NULL OR d.attempt != c.attempt) ORDER BY (c.created_at >= ?) DESC, c.created_at ASC, c.id ASC`).all(DEPLOY.repo, DEPLOY.path, since) as { id: number; conclusion: string | null; attempt: number; created_at: string }[];
  const batch = todo.slice(0, cap);
  const errors: string[] = [];
  const oldErrors: string[] = [];
  let fetched = 0;
  const ins = db.query('INSERT OR REPLACE INTO deploy_runs (run_id, outcome, attempt, apply_conclusion, failed_step, fetched_at) VALUES (?, ?, ?, ?, ?, ?)');
  const worker = async () => {
    for (let r = batch.shift(); r; r = batch.shift()) {
      try {
        const jobs = await readGhJSON(run, ['api', `repos/zgeoff/${DEPLOY.repo}/actions/runs/${r.id}/attempts/${r.attempt}/jobs?per_page=100`], env, `jobs of deploy-prod run ${r.id} attempt ${r.attempt}`);
        const c = classifyDeploy(jobs, r.conclusion);
        if (!c) throw new HqError('command_failed', `jobs of deploy-prod run ${r.id}: not a job list hq can read; not recorded`);
        ins.run(r.id, c.outcome, r.attempt, c.apply_conclusion, c.failed_step, iso(at));
        fetched++;
      } catch (e) {
        const m = String((e as Error).message ?? e);
        if (/HTTP 404|Not Found/.test(m)) {
          ins.run(r.id, 'unknown', r.attempt, null, null, iso(at));
          fetched++;
        } else (r.created_at >= since ? errors : oldErrors).push(m);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const left = todo.slice(cap).filter((r) => r.created_at >= since).length; // window runs come first, so these wait only on other window runs
  return { fetched, left, errors, oldErrors };
}
