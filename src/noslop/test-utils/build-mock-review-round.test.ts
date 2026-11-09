import { expect, test } from 'bun:test';
import { buildMockReviewRound } from './build-mock-review-round.ts';

test('it builds a default round on the first review of a PR', () => {
  expect(buildMockReviewRound()).toStrictEqual({ repo: 'widgets', pr: 7, head: 'abc1234abc1234abc1234abc1234abc1234abc12' });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockReviewRound({ pr: 9, ok: false })).toStrictEqual({ repo: 'widgets', pr: 9, head: 'abc1234abc1234abc1234abc1234abc1234abc12', ok: false });
});
