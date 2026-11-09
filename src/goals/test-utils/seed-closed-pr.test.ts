import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedClosedPR } from './seed-closed-pr.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readPRs: () => fresh.db.query('SELECT repo, number, closed_at FROM closed_prs ORDER BY repo, number').all() };
}

test('#seedClosedPR stores a closed, unmerged PR, and input overrides apply', () => {
  const ctx = setupTest();

  seedClosedPR(ctx, { repo: 'teapots', number: 4 });

  expect(ctx.readPRs()).toStrictEqual([{ repo: 'teapots', number: 4, closed_at: '2026-10-15T03:00:00Z' }]);
});

test('#seedClosedPR replaces the close time a PR already holds', () => {
  const ctx = setupTest();
  seedClosedPR(ctx, { number: 4 });

  seedClosedPR(ctx, { number: 4, closed_at: '2026-10-15T05:00:00Z' });

  expect(ctx.readPRs()).toMatchObject([{ number: 4, closed_at: '2026-10-15T05:00:00Z' }]);
});
