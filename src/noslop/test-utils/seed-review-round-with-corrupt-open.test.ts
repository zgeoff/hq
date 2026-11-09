import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedReviewRoundWithCorruptOpen } from './seed-review-round-with-corrupt-open.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRounds: () => fresh.db.query('SELECT repo, pr, kind, conclusion, open FROM noslop_rounds ORDER BY id').all() };
}

test('#seedReviewRoundWithCorruptOpen stores a numeric open finding id, and input overrides apply', () => {
  const ctx = setupTest();

  seedReviewRoundWithCorruptOpen(ctx, { kind: 'check', conclusion: 'success' });

  expect(ctx.readRounds()).toStrictEqual([{ repo: 'widgets', pr: 7, kind: 'check', conclusion: 'success', open: '[{"id":42}]' }]);
});
