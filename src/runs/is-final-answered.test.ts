import { expect, test } from 'bun:test';
import { isFinalAnswered } from './is-final-answered.ts';

test.each([
  ['a review at the final head', { final_sha: 'abc1234', final_at: '2026-10-21T01:00:00Z', review_started_at: '2026-10-21T00:10:00Z', reviewed_sha: 'abc1234def567890abc1234def567890abc12345', reviewed_at: '2026-10-21T00:20:00Z' }, true],
  ['a round that started after the FINAL and ended at another head', { final_sha: 'abc1234', final_at: '2026-10-21T01:00:00Z', review_started_at: '2026-10-21T02:00:00Z', reviewed_sha: 'def5678', reviewed_at: '2026-10-21T02:20:00Z' }, true],
  ['a round that started in the same second as the FINAL', { final_sha: 'abc1234', final_at: '2026-10-21T01:00:00Z', review_started_at: '2026-10-21T01:00:00Z', reviewed_sha: 'def5678', reviewed_at: '2026-10-21T01:20:00Z' }, false],
  ['a review marked by hand in the same second as the FINAL', { final_sha: 'abc1234', final_at: '2026-10-21T01:00:00Z', review_started_at: null, reviewed_sha: 'def5678', reviewed_at: '2026-10-21T01:00:00Z' }, false],
  ['a review marked by hand after the FINAL, with no round started', { final_sha: 'abc1234', final_at: '2026-10-21T01:00:00Z', review_started_at: null, reviewed_sha: 'def5678', reviewed_at: '2026-10-21T02:00:00Z' }, true],
  ['no review', { final_sha: 'abc1234', final_at: '2026-10-21T01:00:00Z', review_started_at: null, reviewed_sha: null, reviewed_at: null }, false],
  ['a review before the FINAL at another head', { final_sha: 'abc1234', final_at: '2026-10-21T01:00:00Z', review_started_at: '2026-10-21T00:10:00Z', reviewed_sha: 'def5678', reviewed_at: '2026-10-21T00:20:00Z' }, false],
  ['a review marked by hand before the FINAL', { final_sha: 'abc1234', final_at: '2026-10-21T01:00:00Z', review_started_at: null, reviewed_sha: 'def5678', reviewed_at: '2026-10-21T00:20:00Z' }, false],
  ['a round that started before the FINAL and ended after it', { final_sha: 'abc1234', final_at: '2026-10-21T01:00:00Z', review_started_at: '2026-10-21T00:50:00Z', reviewed_sha: 'def5678', reviewed_at: '2026-10-21T01:10:00Z' }, false],
  ['an earlier review while a round that started after the FINAL still runs', { final_sha: 'abc1234', final_at: '2026-10-21T01:00:00Z', review_started_at: '2026-10-21T02:00:00Z', reviewed_sha: 'def5678', reviewed_at: '2026-10-21T00:20:00Z' }, false],
])('it answers for %s', (_, marks, answered) => {
  expect(isFinalAnswered(marks)).toBe(answered);
});
