import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedInReviewIssue } from './seed-in-review-issue.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRows: () => fresh.db.query('SELECT issue, updated_at, fetched_at FROM linear_in_review ORDER BY issue').all() };
}

test('#seedInReviewIssue stores an issue In Review, and input overrides apply', () => {
  const ctx = setupTest();

  seedInReviewIssue(ctx, { issue: 'GEO-9800', fetchedAt: '2026-10-16T07:00:00Z' });

  expect(ctx.readRows()).toStrictEqual([{ issue: 'GEO-9800', updated_at: '2026-10-14T07:00:00Z', fetched_at: '2026-10-16T07:00:00Z' }]);
});

test('#seedInReviewIssue stores the fetch time of a default sync', () => {
  const ctx = setupTest();

  seedInReviewIssue(ctx);

  expect(ctx.readRows()).toStrictEqual([{ issue: 'GEO-1', updated_at: '2026-10-14T07:00:00Z', fetched_at: '2026-10-15T07:00:00Z' }]);
});
