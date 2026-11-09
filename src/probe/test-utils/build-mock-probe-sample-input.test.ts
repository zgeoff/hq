import { expect, test } from 'bun:test';
import { buildMockProbeSampleInput } from './build-mock-probe-sample-input.ts';

test('it builds a default probe sample input', () => {
  expect(buildMockProbeSampleInput()).toStrictEqual({ at: '2026-10-14T00:59:00Z', targetOk: true, controlOk: null, durationMs: null, detail: null, readyOk: null });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockProbeSampleInput({ at: '2026-10-15T00:00:00Z', readyOk: false })).toStrictEqual({ at: '2026-10-15T00:00:00Z', targetOk: true, controlOk: null, durationMs: null, detail: null, readyOk: false });
});
