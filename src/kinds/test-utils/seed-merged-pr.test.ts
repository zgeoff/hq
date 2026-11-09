import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedMergedPR } from './seed-merged-pr.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readPRs: () => fresh.db.query('SELECT repo, number, merged_at, title, kind, issue FROM merged_prs ORDER BY repo, number').all() };
}

test('#seedMergedPR stores a merged PR, and input overrides apply', () => {
  const ctx = setupTest();

  seedMergedPR(ctx, { repo: 'teapots', number: 3, kind: 'fix', issue: 'GEO-3' });

  expect(ctx.readPRs()).toStrictEqual([{ repo: 'teapots', number: 3, merged_at: '2026-10-16T03:00:00Z', title: 'x: y', kind: 'fix', issue: 'GEO-3' }]);
});

test('#seedMergedPR replaces the PR a repo and number already hold', () => {
  const ctx = setupTest();
  seedMergedPR(ctx, { number: 3, title: 'fix: old' });

  seedMergedPR(ctx, { number: 3, title: 'fix: new' });

  expect(ctx.readPRs()).toMatchObject([{ number: 3, title: 'fix: new' }]);
});
