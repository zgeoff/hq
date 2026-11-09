import { expect, test } from 'bun:test';
import { buildMockMergedPR } from './build-mock-merged-pr.ts';

test('it builds a default merged PR with no issue', () => {
  expect(buildMockMergedPR()).toStrictEqual({ repo: 'atc', number: 1, merged_at: '2026-10-16T03:00:00Z', title: 'x: y', kind: 'other', issue: null });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockMergedPR({ number: 5, issue: 'GEO-5' })).toStrictEqual({ repo: 'atc', number: 5, merged_at: '2026-10-16T03:00:00Z', title: 'x: y', kind: 'other', issue: 'GEO-5' });
});
