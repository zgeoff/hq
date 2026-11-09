// oxlint-disable eslint/id-length -- n is the stored merged_pr_days column
import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedMergedPRDay } from './seed-merged-pr-day.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readDays: () => fresh.db.query('SELECT day, n, at FROM merged_pr_days ORDER BY day').all() };
}

test('#seedMergedPRDay stores a fetched day, and input overrides apply', () => {
  const ctx = setupTest();

  seedMergedPRDay(ctx, { day: '2026-10-14', n: 3 });

  expect(ctx.readDays()).toStrictEqual([{ day: '2026-10-14', n: 3, at: '2026-10-16T00:10:00Z' }]);
});

test('#seedMergedPRDay replaces the count a day already holds', () => {
  const ctx = setupTest();
  seedMergedPRDay(ctx, { day: '2026-10-14', n: 3 });

  seedMergedPRDay(ctx, { day: '2026-10-14', n: 4 });

  expect(ctx.readDays()).toMatchObject([{ day: '2026-10-14', n: 4 }]);
});
