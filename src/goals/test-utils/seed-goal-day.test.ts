// oxlint-disable eslint/id-length -- n is the stored goal_days column
import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedGoalDay } from './seed-goal-day.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readDays: () => fresh.db.query('SELECT kind, key, day, n, at FROM goal_days ORDER BY kind, key, day').all() };
}

test('#seedGoalDay stores a fetched day, and input overrides apply', () => {
  const ctx = setupTest();

  seedGoalDay(ctx, { key: 'teapots', day: '2026-10-12', n: 1 });

  expect(ctx.readDays()).toStrictEqual([{ kind: 'ci', key: 'teapots', day: '2026-10-12', n: 1, at: '2026-10-16T00:10:00Z' }]);
});

test('#seedGoalDay replaces the count a day already holds', () => {
  const ctx = setupTest();
  seedGoalDay(ctx, { n: 3 });

  seedGoalDay(ctx, { n: 4 });

  expect(ctx.readDays()).toMatchObject([{ day: '2026-10-15', n: 4 }]);
});
