import { expect, test } from 'bun:test';
import { buildNoslopTotals } from './build-noslop-totals.ts';

test('it counts no PRs and no churn for no reports', () => {
  expect(buildNoslopTotals([])).toStrictEqual({ prs: 0, roundsWithNew: 0, repeatClass: 0, classUnknown: 0, late: { n: 0, of: 0 }, lateUnknown: 0, mainMerge: 0, mergeUnknown: 0 });
});

test('it sums the churn across PRs in the totals', () => {
  expect(
    buildNoslopTotals([
      {
        ref: 'widgets#7',
        reviewsOk: 2,
        reviewsFailed: 0,
        fullReviews: 0,
        extraRounds: 1,
        confirmReviews: 0,
        findings: 2,
        bySeverity: { high: 1, low: 1 },
        latestCheck: null,
        answered: null,
        openIDs: [],
        wallMs: 120_000,
        reviewToPassMs: null,
        roundsWithNew: 2,
        repeatClass: 1,
        classUnknown: 0,
        late: { n: 1, of: 1 },
        lateUnknown: 0,
        mainMerge: 0,
        mergeUnknown: 2,
        redesign: null,
      },
      {
        ref: 'gadgets#8',
        reviewsOk: 3,
        reviewsFailed: 1,
        fullReviews: 1,
        extraRounds: 2,
        confirmReviews: 0,
        findings: 4,
        bySeverity: { high: 4 },
        latestCheck: 'success',
        answered: 4,
        openIDs: [],
        wallMs: 300_000,
        reviewToPassMs: 600_000,
        roundsWithNew: 3,
        repeatClass: 0,
        classUnknown: 2,
        late: { n: 0, of: 2 },
        lateUnknown: 1,
        mainMerge: 1,
        mergeUnknown: 0,
        redesign: null,
      },
    ]),
  ).toStrictEqual({ prs: 2, roundsWithNew: 5, repeatClass: 1, classUnknown: 2, late: { n: 1, of: 3 }, lateUnknown: 1, mainMerge: 1, mergeUnknown: 2 });
});
