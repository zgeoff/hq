import { expect, test } from 'bun:test';
import { formatNoslopReview } from './format-noslop-review.ts';
import type { NoslopReviewOutcome } from './run-review.ts';

const REVIEW: NoslopReviewOutcome = {
  engine: 'noslop',
  repo: 'zgeoff/widgets',
  pr: 7,
  head: 'feat',
  base: 'main',
  reviewFile: '/reviews/widgets7-noslop.json',
  depth: 'standard',
  findings: [{ id: '00112233445566aa', lens: 'correctness', severity: 'P2', title: 'Kettle never boils' }],
  notReviewed: [
    { path: 'data/kettle-readings.json', reason: 'data' },
    { path: 'src/teapot-lid.ts', reason: 'too-large' },
  ],
  ms: 1200,
  sha: '0123456789abcdef0123456789abcdef01234567',
  issue: { issue: 'GEO-9701', attached: true, why: 'linked in the PR body' },
  checks: [],
  checksError: null,
  openThreads: 1,
  fixChecks: [],
  fixesOnly: false,
  fullDropped: false,
  round: 1,
  postFailed: null,
};

test('hq review prints a version 6 review\'s files no call read, with their reasons, after the findings', () => {
  expect(formatNoslopReview(REVIEW).split('\n')).toStrictEqual([
    '== engine: noslop (commit 0123456, depth standard)',
    '== issue: GEO-9701 (linked in the PR body)',
    '== noslop: 1 finding(s), full output: /reviews/widgets7-noslop.json',
    '  - [P2] correctness: Kettle never boils (00112233445566aa)',
    '== not reviewed by noslop: 2 file(s), check them by hand',
    '  - data/kettle-readings.json (data)',
    '  - src/teapot-lid.ts (too-large)',
    '== checks: 0 total, 0 not passing',
    '== open threads: 1',
  ]);
});

test('hq review says --full was dropped on a later round, before the issue line', () => {
  expect(formatNoslopReview({ ...REVIEW, fullDropped: true, round: 2 }).split('\n').slice(0, 3)).toStrictEqual([
    '== engine: noslop (commit 0123456, depth standard)',
    '== --full dropped: round 2 reviews only the commits since round 1.',
    '== issue: GEO-9701 (linked in the PR body)',
  ]);
});

test('hq review tells the caller to post a review noslop stored but did not post, after the findings line', () => {
  expect(formatNoslopReview({ ...REVIEW, postFailed: 'exit 1: the github reporter failed: HTTP 500' }).split('\n').slice(2, 5)).toStrictEqual([
    '== noslop: 1 finding(s), full output: /reviews/widgets7-noslop.json',
    '== not posted: noslop stored this review but did not post it to GitHub (exit 1: the github reporter failed: HTTP 500). Run noslop post /reviews/widgets7-noslop.json to finish the post.',
    '  - [P2] correctness: Kettle never boils (00112233445566aa)',
  ]);
});

test('hq review --fixes-only tells the caller to post a run noslop stored but did not post, after its first line', () => {
  expect(formatNoslopReview({ ...REVIEW, findings: [], fixesOnly: true, postFailed: 'exit 1: the github reporter failed: HTTP 500' }).split('\n').slice(0, 2)).toStrictEqual([
    '== engine: noslop (commit 0123456), fixes only: 0 fix(es) checked, full output: /reviews/widgets7-noslop.json',
    '== not posted: noslop stored this review but did not post it to GitHub (exit 1: the github reporter failed: HTTP 500). Run noslop post /reviews/widgets7-noslop.json to finish the post.',
  ]);
});

test('hq review --fixes-only prints each fix check, with the finding title when hq has it, then the noslop check', () => {
  const run: NoslopReviewOutcome = {
    ...REVIEW,
    findings: [],
    fixesOnly: true,
    fixChecks: [
      { findingID: '00112233445566aa', fixed: true, reason: 'the kettle boils now', title: 'Kettle never boils' },
      { findingID: '00112233445566bb', fixed: false, reason: 'the lid still leaks', title: null },
    ],
    checks: [{ name: 'noslop', state: 'SUCCESS', bucket: 'pass' }],
  };

  expect(formatNoslopReview(run).split('\n')).toStrictEqual([
    '== engine: noslop (commit 0123456), fixes only: 2 fix(es) checked, full output: /reviews/widgets7-noslop.json',
    '  - 00112233445566aa fixed (Kettle never boils)',
    '  - 00112233445566bb not fixed: the lid still leaks',
    '== not reviewed by noslop: 2 file(s), check them by hand',
    '  - data/kettle-readings.json (data)',
    '  - src/teapot-lid.ts (too-large)',
    '== noslop check: SUCCESS',
    '== checks: 1 total, 0 not passing',
    '== open threads: 1',
  ]);
});
