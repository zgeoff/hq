import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedStartedPR } from './seed-started-pr.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readPRs: () => fresh.db.query('SELECT issue, ref, status, merged_at FROM linear_started_prs ORDER BY issue, ref').all() };
}

test('#seedStartedPR stores a PR on a started issue, and input overrides apply', () => {
  const ctx = setupTest();

  seedStartedPR(ctx, { issue: 'GEO-9', ref: 'kettle#9', status: 'merged', merged_at: '2026-10-13T01:00:00Z' });

  expect(ctx.readPRs()).toStrictEqual([{ issue: 'GEO-9', ref: 'kettle#9', status: 'merged', merged_at: '2026-10-13T01:00:00Z' }]);
});

test('#seedStartedPR keeps each PR of an issue', () => {
  const ctx = setupTest();

  seedStartedPR(ctx, { ref: 'kettle#1' });
  seedStartedPR(ctx, { ref: 'kettle#2' });

  expect(ctx.readPRs()).toHaveLength(2);
});
