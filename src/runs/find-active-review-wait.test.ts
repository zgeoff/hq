import { expect, test } from 'bun:test';
import { findActiveReviewWait } from './find-active-review-wait.ts';

test.each([
  { name: 'before the date', pr: { final_sha: 'abc1234', review_wait_until: '2026-11-10T01:00:00.000Z', review_wait_sha: 'abc1234', review_wait_reason: 'out of quota' }, at: new Date('2026-11-10T00:59:59.000Z'), want: { until: '2026-11-10T01:00:00.000Z', reason: 'out of quota', sha: 'abc1234' } },
  { name: 'at the date', pr: { final_sha: 'abc1234', review_wait_until: '2026-11-10T01:00:00.000Z', review_wait_sha: 'abc1234', review_wait_reason: 'out of quota' }, at: new Date('2026-11-10T01:00:00.000Z'), want: null },
  { name: 'after the date', pr: { final_sha: 'abc1234', review_wait_until: '2026-11-10T01:00:00.000Z', review_wait_sha: 'abc1234', review_wait_reason: 'out of quota' }, at: new Date('2026-11-10T02:00:00.000Z'), want: null },
  { name: 'a new FINAL at another head', pr: { final_sha: 'def5678', review_wait_until: '2026-11-10T01:00:00.000Z', review_wait_sha: 'abc1234', review_wait_reason: 'out of quota' }, at: new Date('2026-11-09T00:00:00.000Z'), want: null },
  { name: 'no wait', pr: { final_sha: 'abc1234', review_wait_until: null, review_wait_sha: null, review_wait_reason: null }, at: new Date('2026-11-09T00:00:00.000Z'), want: null },
  { name: 'no FINAL', pr: { final_sha: null, review_wait_until: '2026-11-10T01:00:00.000Z', review_wait_sha: 'abc1234', review_wait_reason: 'out of quota' }, at: new Date('2026-11-09T00:00:00.000Z'), want: null },
])('it finds the active review wait for $name', (row) => {
  expect(findActiveReviewWait(row.pr, row.at)).toStrictEqual(row.want);
});
