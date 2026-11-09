import { expect, test } from 'bun:test';
import { buildMockLanesSampleInput } from './build-mock-lanes-sample-input.ts';

test('it builds a default lanes sample input', () => {
  expect(buildMockLanesSampleInput()).toStrictEqual({ at: '2026-10-16T01:00:00Z', freeMib: 0, slots: 0, eligible: null, error: null });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockLanesSampleInput({ slots: 2, eligible: 3 })).toStrictEqual({ at: '2026-10-16T01:00:00Z', freeMib: 0, slots: 2, eligible: 3, error: null });
});
