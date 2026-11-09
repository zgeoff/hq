import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedDeployRun } from './seed-deploy-run.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRuns: () => fresh.db.query('SELECT run_id, outcome, attempt, apply_conclusion, failed_step, fetched_at FROM deploy_runs ORDER BY run_id').all() };
}

test('#seedDeployRun stores an applied run, and input overrides apply', () => {
  const ctx = setupTest();

  seedDeployRun(ctx, { run_id: 4, outcome: 'held', failed_step: 'Hold for a manual dispatch' });

  expect(ctx.readRuns()).toStrictEqual([{ run_id: 4, outcome: 'held', attempt: 1, apply_conclusion: null, failed_step: 'Hold for a manual dispatch', fetched_at: '2026-10-16T05:00:00Z' }]);
});

test('#seedDeployRun replaces the classification a run already has', () => {
  const ctx = setupTest();
  seedDeployRun(ctx, { run_id: 4, outcome: 'held' });

  seedDeployRun(ctx, { run_id: 4, outcome: 'applied_failed' });

  expect(ctx.readRuns()).toMatchObject([{ run_id: 4, outcome: 'applied_failed' }]);
});
