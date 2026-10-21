import { expect, onTestFinished, test } from 'bun:test';
import { freshDb } from '../../test/helpers.ts';
import { readChainedReviewBase } from './read-chained-review-base.ts';

function setupTest() {
  const fresh = freshDb();
  onTestFinished(fresh.cleanup);
  return {
    db: fresh.db,
    addReview: (head: string, base: string, confirm = 0) => fresh.db.query("INSERT INTO noslop_rounds (repo, pr, kind, started_at, ended_at, ms, ok, head, base, depth, special, findings, redesign, sha, confirm) VALUES ('widgets', 7, 'review', 'a', 'b', 1, 1, ?, ?, 'standard', 'none', '[]', NULL, 'x', ?)").run(head, base, confirm),
  };
}

test('it follows a base that is an earlier review head back to that review base', () => {
  const ctx = setupTest();
  ctx.addReview('kettle2', 'kettle1');
  ctx.addReview('kettle3', 'kettle2');

  expect(readChainedReviewBase({ db: ctx.db, repo: 'widgets', pr: 7 }, 'kettle2')).toBe('kettle1');
});

test('it follows a base that is a --fixes-only run head back to that run base', () => {
  const ctx = setupTest();
  ctx.addReview('kettle2', 'kettle1');
  ctx.addReview('kettle3', 'kettle1', 1);
  ctx.addReview('kettle4', 'kettle3');

  expect(readChainedReviewBase({ db: ctx.db, repo: 'widgets', pr: 7 }, 'kettle3')).toBe('kettle1');
});

test('it keeps a base that no earlier review of the PR has as its head', () => {
  const ctx = setupTest();
  ctx.addReview('kettle2', 'kettle1');

  expect(readChainedReviewBase({ db: ctx.db, repo: 'widgets', pr: 7 }, 'teapot9')).toBe('teapot9');
});

test('it stops at a base it has already followed', () => {
  const ctx = setupTest();
  ctx.addReview('kettle2', 'kettle1');
  ctx.addReview('kettle1', 'kettle2');

  expect(readChainedReviewBase({ db: ctx.db, repo: 'widgets', pr: 7 }, 'kettle2')).toBe('kettle2');
});
