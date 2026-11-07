import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { readDeployRuns } from './read-deploy-runs.ts';
import { syncDeploys } from './sync-deploys.ts';
import { syncRunsDay } from './sync-runs-day.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it reads the stored outcome of every deploy run, ordered by run', async () => {
  const ctx = setupTest();
  const runs = {
    total_count: 2,
    workflow_runs: [
      { id: 9002, path: '.github/workflows/deploy-prod.yml', event: 'push', status: 'completed', conclusion: 'success', run_attempt: 1, created_at: '2026-10-21T02:00:00Z', run_started_at: '2026-10-21T02:00:00Z', updated_at: '2026-10-21T02:05:00Z' },
      { id: 9001, path: '.github/workflows/deploy-prod.yml', event: 'push', status: 'completed', conclusion: 'success', run_attempt: 1, created_at: '2026-10-21T01:00:00Z', run_started_at: '2026-10-21T01:00:00Z', updated_at: '2026-10-21T01:05:00Z' },
    ],
  };
  await syncRunsDay(ctx.db, async () => ({ code: 0, stdout: JSON.stringify(runs), stderr: '' }), 'cloud', '2026-10-21', undefined, new Date('2026-10-22T00:00:00Z'));
  const jobs = { total_count: 1, jobs: [{ name: 'decide', conclusion: 'success' }] };
  await syncDeploys(ctx.db, async () => ({ code: 0, stdout: JSON.stringify(jobs), stderr: '' }), undefined, new Date('2026-10-22T00:10:00Z'));

  expect(readDeployRuns(ctx.db)).toStrictEqual([
    { run_id: 9001, outcome: 'no_apply', attempt: 1, apply_conclusion: null, failed_step: null, fetched_at: '2026-10-22T00:10:00Z' },
    { run_id: 9002, outcome: 'no_apply', attempt: 1, apply_conclusion: null, failed_step: null, fetched_at: '2026-10-22T00:10:00Z' },
  ]);
});

test('it reads no rows before the first deploy sync', () => {
  const ctx = setupTest();

  expect(readDeployRuns(ctx.db)).toStrictEqual([]);
});
