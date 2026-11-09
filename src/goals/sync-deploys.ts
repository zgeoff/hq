import type { Database } from 'bun:sqlite';
import { sql } from 'kysely';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import type { RunOpts, Runner } from '../runner/types.ts';
import { classifyDeploy } from './classify-deploy.ts';
import { DEPLOY } from './deploy.ts';
import { DEPLOY_BATCH } from './deploy-batch.ts';

import { readGhJSON } from './read-gh-json.ts';
import { toErrorMessage } from '../to-error-message.ts';
import { writeDeployRun } from './write-deploy-run.ts';

const TodoSchema = buildRowSchema('ci_runs').pick({ id: true, conclusion: true, attempt: true, created_at: true });

// The jobs come from the run's current attempt, so a re-run GitHub made since hq cached the run can't
// stand in for it.
export async function syncDeploys(db: Database, run: Runner, env?: RunOpts['env'], at: Date = now(), cap = DEPLOY_BATCH, from: Date = new Date(0)): Promise<{ fetched: number; left: number; errors: string[]; oldErrors: string[] }> {
  const since = iso(from);
  const todo = runSyncQuery(db, sql`SELECT c.id AS id, c.conclusion AS conclusion, c.attempt AS attempt, c.created_at AS created_at FROM ci_runs c LEFT JOIN deploy_runs d ON d.run_id = c.id WHERE c.repo = ${DEPLOY.repo} AND c.path = ${DEPLOY.path} AND c.status = 'completed' AND (d.run_id IS NULL OR d.attempt != c.attempt) ORDER BY (c.created_at >= ${since}) DESC, c.created_at ASC, c.id ASC`.compile(kdb(db)), TodoSchema);
  const batch = todo.slice(0, cap);
  const errors: string[] = [];
  const oldErrors: string[] = [];
  let fetched = 0;
  const worker = async () => {
    for (let r = batch.shift(); r; r = batch.shift()) {
      try {
        const jobs = await readGhJSON(run, ['api', `repos/zgeoff/${DEPLOY.repo}/actions/runs/${r.id}/attempts/${r.attempt}/jobs?per_page=100`], env, `jobs of deploy-prod run ${r.id} attempt ${r.attempt}`);
        const c = classifyDeploy(jobs, r.conclusion);
        if (!c) throw new HqError('command_failed', `jobs of deploy-prod run ${r.id}: not a job list hq can read; not recorded`);
        writeDeployRun(db, { run_id: r.id, outcome: c.outcome, attempt: r.attempt, apply_conclusion: c.apply_conclusion, failed_step: c.failed_step, fetched_at: iso(at) });
        fetched++;
      } catch (e) {
        const message = toErrorMessage(e);
        if (/HTTP 404|Not Found/u.test(message)) {
          writeDeployRun(db, { run_id: r.id, outcome: 'unknown', attempt: r.attempt, apply_conclusion: null, failed_step: null, fetched_at: iso(at) });
          fetched++;
        } else {
          (r.created_at >= since ? errors : oldErrors).push(message);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  const left = todo.slice(cap).filter((pending) => pending.created_at >= since).length;
  return { fetched, left, errors, oldErrors };
}
