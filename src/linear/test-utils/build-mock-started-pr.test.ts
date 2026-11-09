import { expect, test } from 'bun:test';
import { buildMockStartedPR } from './build-mock-started-pr.ts';

test('it builds a default open PR on a started issue', () => {
  expect(buildMockStartedPR()).toStrictEqual({ issue: 'GEO-1', ref: 'kettle#1', status: 'open', merged_at: null });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockStartedPR({ status: 'merged', merged_at: '2026-10-13T01:00:00Z' })).toStrictEqual({ issue: 'GEO-1', ref: 'kettle#1', status: 'merged', merged_at: '2026-10-13T01:00:00Z' });
});
