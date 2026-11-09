import type { JobRun } from '../types.ts';
import { buildMockJobRun } from './build-mock-job-run.ts';
import type { MorningDeps } from './types.ts';

export function seedMorningRunKeyedToTarget(deps: MorningDeps, input: Partial<JobRun> = {}): JobRun {
  const run = buildMockJobRun(input);

  // A queued morning run whose outbox key ends in the target session, as the other jobs' runs are keyed: the morning job's own run has no target in its key.
  deps.db.query('INSERT INTO job_runs (job, key, at, result, detail, outbox_key) VALUES (?, ?, ?, ?, ?, ?)').run(run.job, run.key, run.at, run.result, run.detail, run.outbox_key);

  return run;
}
