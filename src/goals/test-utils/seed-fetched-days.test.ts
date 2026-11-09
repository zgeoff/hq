// oxlint-disable eslint/id-length -- n is the stored goal_days and merged_pr_days column
import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedFetchedDays } from './seed-fetched-days.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    readGoalDays: () => fresh.db.query('SELECT kind, key, day, n, at FROM goal_days ORDER BY day, key').all(),
    readMergedPRDays: () => fresh.db.query('SELECT day, n, at FROM merged_pr_days ORDER BY day').all(),
  };
}

test('#seedFetchedDays stores every day from September through November as fetched with nothing in it', () => {
  const ctx = setupTest();

  seedFetchedDays(ctx);

  expect(ctx.readMergedPRDays()).toHaveLength(91);
});

test('#seedFetchedDays stores a CI day per repo and a merged-PR day for each day in the range', () => {
  const ctx = setupTest();

  seedFetchedDays(ctx, { from: '2026-10-14', to: '2026-10-15', repos: ['atc', 'cloud'] });

  expect({ goalDays: ctx.readGoalDays(), mergedPRDays: ctx.readMergedPRDays() }).toStrictEqual({
    goalDays: [
      { kind: 'ci', key: 'atc', day: '2026-10-14', n: 0, at: '2026-09-01T00:00:00Z' },
      { kind: 'ci', key: 'cloud', day: '2026-10-14', n: 0, at: '2026-09-01T00:00:00Z' },
      { kind: 'ci', key: 'atc', day: '2026-10-15', n: 0, at: '2026-09-01T00:00:00Z' },
      { kind: 'ci', key: 'cloud', day: '2026-10-15', n: 0, at: '2026-09-01T00:00:00Z' },
    ],
    mergedPRDays: [
      { day: '2026-10-14', n: 0, at: '2026-09-01T00:00:00Z' },
      { day: '2026-10-15', n: 0, at: '2026-09-01T00:00:00Z' },
    ],
  });
});

test('#seedFetchedDays leaves the unfetched days out of each table', () => {
  const ctx = setupTest();

  seedFetchedDays(ctx, { from: '2026-10-14', to: '2026-10-16', unfetchedPRDays: ['2026-10-15'], unfetchedCIDays: ['2026-10-16'] });

  expect({ goalDays: ctx.readGoalDays(), mergedPRDays: ctx.readMergedPRDays() }).toMatchObject({
    goalDays: [{ day: '2026-10-14' }, { day: '2026-10-15' }],
    mergedPRDays: [{ day: '2026-10-14' }, { day: '2026-10-16' }],
  });
});
