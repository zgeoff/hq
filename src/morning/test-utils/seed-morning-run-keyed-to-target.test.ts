import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedMorningRunKeyedToTarget } from './seed-morning-run-keyed-to-target.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRuns: () => fresh.db.query('SELECT job, key, at, result, detail, outbox_key FROM job_runs ORDER BY key').all() };
}

test('#seedMorningRunKeyedToTarget stores a queued morning run, and input overrides apply', () => {
  const ctx = setupTest();

  seedMorningRunKeyedToTarget(ctx, { key: '2026-10-18', outbox_key: 'hq-ev4-z-stu' });

  expect(ctx.readRuns()).toStrictEqual([{ job: 'morning-reports', key: '2026-10-18', at: '2026-10-16T22:16:00Z', result: 'queued', detail: null, outbox_key: 'hq-ev4-z-stu' }]);
});

test('#seedMorningRunKeyedToTarget refuses a second run for the same day', () => {
  const ctx = setupTest();
  seedMorningRunKeyedToTarget(ctx);

  expect(() => seedMorningRunKeyedToTarget(ctx)).toThrow();
});
