import { expect, test } from 'bun:test';
import { isReviewWaitActive } from './is-review-wait-active.ts';

test.each([
  { name: 'before the date', pr: { final_sha: 'abc1234', review_wait_until: '2026-11-10T01:00:00.000Z', review_wait_sha: 'abc1234' }, at: new Date('2026-11-10T00:59:59.000Z'), want: true },
  { name: 'at the date', pr: { final_sha: 'abc1234', review_wait_until: '2026-11-10T01:00:00.000Z', review_wait_sha: 'abc1234' }, at: new Date('2026-11-10T01:00:00.000Z'), want: false },
  { name: 'after the date', pr: { final_sha: 'abc1234', review_wait_until: '2026-11-10T01:00:00.000Z', review_wait_sha: 'abc1234' }, at: new Date('2026-11-10T02:00:00.000Z'), want: false },
  { name: 'a new FINAL at another head', pr: { final_sha: 'def5678', review_wait_until: '2026-11-10T01:00:00.000Z', review_wait_sha: 'abc1234' }, at: new Date('2026-11-09T00:00:00.000Z'), want: false },
  { name: 'no wait', pr: { final_sha: 'abc1234', review_wait_until: null, review_wait_sha: null }, at: new Date('2026-11-09T00:00:00.000Z'), want: false },
  { name: 'no FINAL', pr: { final_sha: null, review_wait_until: '2026-11-10T01:00:00.000Z', review_wait_sha: 'abc1234' }, at: new Date('2026-11-09T00:00:00.000Z'), want: false },
])('it says a review wait is active $want for $name', (row) => {
  expect(isReviewWaitActive(row.pr, row.at)).toBe(row.want);
});
