import { expect, test } from 'bun:test';
import { buildMockSlotMinutesInput } from './build-mock-slot-minutes-input.ts';

test('it builds a default slot minutes input', () => {
  expect(buildMockSlotMinutesInput()).toStrictEqual({ day: '2026-10-14', cause: 'delivery', minutes: 10 });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockSlotMinutesInput({ cause: 'triage', minutes: 40.6 })).toStrictEqual({ day: '2026-10-14', cause: 'triage', minutes: 40.6 });
});
