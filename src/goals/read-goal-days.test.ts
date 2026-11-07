/* oxlint-disable id-length -- n is the goal_days column and GoalDay's own field */
import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { readGoalDays } from './read-goal-days.ts';
import { upsertGoalDay } from './upsert-goal-day.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db };
}

test('it reads the days of one kind, ordered by day, then key', () => {
  const ctx = setupTest();
  upsertGoalDay(ctx.db, { kind: 'ci', key: 'teapots', day: '2026-10-15', n: 3, at: new Date('2026-10-16T01:00:00Z') });
  upsertGoalDay(ctx.db, { kind: 'ci', key: 'kettles', day: '2026-10-15', n: 2, at: new Date('2026-10-16T01:00:00Z') });
  upsertGoalDay(ctx.db, { kind: 'ci', key: 'teapots', day: '2026-10-14', n: 1, at: new Date('2026-10-15T01:00:00Z') });
  upsertGoalDay(ctx.db, { kind: 'closed', key: 'teapots', day: '2026-10-14', n: 4, at: new Date('2026-10-15T01:00:00Z') });

  expect(readGoalDays(ctx.db, 'ci')).toStrictEqual([
    { kind: 'ci', key: 'teapots', day: '2026-10-14', n: 1, at: '2026-10-15T01:00:00Z' },
    { kind: 'ci', key: 'kettles', day: '2026-10-15', n: 2, at: '2026-10-16T01:00:00Z' },
    { kind: 'ci', key: 'teapots', day: '2026-10-15', n: 3, at: '2026-10-16T01:00:00Z' },
  ]);
});

test('it reads no rows for a kind with no stored day', () => {
  const ctx = setupTest();

  expect(readGoalDays(ctx.db, 'ci')).toStrictEqual([]);
});
