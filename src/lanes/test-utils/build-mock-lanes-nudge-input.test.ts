import { expect, test } from 'bun:test';
import { buildMockLanesNudgeInput } from './build-mock-lanes-nudge-input.ts';

test('it builds a default lanes nudge input', () => {
  expect(buildMockLanesNudgeInput()).toStrictEqual({ at: '2026-10-16T01:01:00Z', slots: 2, freeMinutes: 10, eligible: 3, eventSeq: 1, detail: null });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockLanesNudgeInput({ eligible: null, detail: '{}' })).toStrictEqual({ at: '2026-10-16T01:01:00Z', slots: 2, freeMinutes: 10, eligible: null, eventSeq: 1, detail: '{}' });
});
