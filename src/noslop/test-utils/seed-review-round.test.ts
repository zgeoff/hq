import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../../test/helpers.ts';
import { seedReviewRound } from './seed-review-round.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return { db: fresh.db, readRounds: () => fresh.db.query('SELECT repo, pr, kind, started_at, ended_at, ok, head, depth, error FROM noslop_rounds ORDER BY id').all() };
}

test('#seedReviewRound stores a passing review round, and input overrides apply', () => {
  const ctx = setupTest();

  seedReviewRound(ctx, { repo: 'teapots', pr: 9, head: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed' });

  expect(ctx.readRounds()).toStrictEqual([
    { repo: 'teapots', pr: 9, kind: 'review', started_at: '2026-10-14T00:59:00Z', ended_at: '2026-10-14T01:00:00Z', ok: 1, head: 'f00dfeedf00dfeedf00dfeedf00dfeedf00dfeed', depth: 'standard', error: null },
  ]);
});

test('#seedReviewRound stores a check round, a confirm review and its open findings when the input names them', () => {
  const ctx = setupTest();

  seedReviewRound(ctx, { kind: 'check', confirm: true, special: 'docs-only', open: [{ id: 'kettle0000000001', title: 'Kettle never boils', reason: 'still open' }] });

  expect(ctx.db.query('SELECT kind, confirm, special, open FROM noslop_rounds').all()).toStrictEqual([
    { kind: 'check', confirm: 1, special: 'docs-only', open: '[{"id":"kettle0000000001","title":"Kettle never boils","reason":"still open"}]' },
  ]);
});

test('#seedReviewRound stores a failed round with its error', () => {
  const ctx = setupTest();

  seedReviewRound(ctx, { ok: false, error: 'the kettle boiled over' });

  expect(ctx.readRounds()).toMatchObject([{ ok: 0, error: 'the kettle boiled over' }]);
});
