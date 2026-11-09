import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedCIRun } from './seed-ci-run.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRuns: () => fresh.db.query('SELECT id, repo, path, event, status, conclusion, attempt, created_at, started_at, updated_at FROM ci_runs ORDER BY id').all() };
}

test('#seedCIRun stores a completed run, and input overrides apply', () => {
  const ctx = setupTest();

  seedCIRun(ctx, { id: 9, repo: 'cloud', conclusion: 'failure' });

  expect(ctx.readRuns()).toStrictEqual([
    {
      id: 9,
      repo: 'cloud',
      path: '.github/workflows/ci.yml',
      event: 'push',
      status: 'completed',
      conclusion: 'failure',
      attempt: 1,
      created_at: '2026-10-16T02:00:00Z',
      started_at: '2026-10-16T02:00:00Z',
      updated_at: '2026-10-16T02:10:00Z',
    },
  ]);
});

test('#seedCIRun keeps every run it stores', () => {
  const ctx = setupTest();

  seedCIRun(ctx, { id: 1 });
  seedCIRun(ctx, { id: 2 });

  expect(ctx.readRuns()).toHaveLength(2);
});
