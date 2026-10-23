import { expect, test } from 'bun:test';
import { formatPRTag } from './format-pr-tag.ts';

test('it shows the review round of a PR reviewed at a newer head after its FINAL', () => {
  expect(
    formatPRTag({ state: 'open', final_sha: 'abc1234def', final_at: '2026-10-21T01:00:00Z', review_started_at: '2026-10-21T01:40:00Z', reviewed_sha: 'def5678', review_round: 2, reviewed_at: '2026-10-21T01:55:00Z' }),
  ).toBe('reviewed r2');
});

test('it shows the review round of a PR reviewed at its final head', () => {
  expect(formatPRTag({ state: 'open', final_sha: 'abc1234', final_at: '2026-10-21T01:00:00Z', review_started_at: '2026-10-21T00:40:00Z', reviewed_sha: 'abc1234', review_round: 1, reviewed_at: '2026-10-21T00:55:00Z' })).toBe('reviewed r1');
});

test('it shows the short final head of a PR whose only review came before its FINAL', () => {
  expect(
    formatPRTag({ state: 'open', final_sha: 'abc1234def', final_at: '2026-10-21T01:00:00Z', review_started_at: '2026-10-21T00:30:00Z', reviewed_sha: 'def5678', review_round: 1, reviewed_at: '2026-10-21T00:45:00Z' }),
  ).toBe('final abc1234');
});

test('it shows an open PR with no FINAL as open', () => {
  expect(formatPRTag({ state: 'open', final_sha: null, final_at: null, review_started_at: null, reviewed_sha: null, review_round: 0, reviewed_at: null })).toBe('open');
});

test('it shows a closed or merged PR by its state', () => {
  expect(formatPRTag({ state: 'merged', final_sha: 'abc1234', final_at: '2026-10-21T01:00:00Z', review_started_at: null, reviewed_sha: null, review_round: 0, reviewed_at: null })).toBe('merged');
});
