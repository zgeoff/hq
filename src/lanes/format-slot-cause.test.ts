import { expect, test } from 'bun:test';
import { formatSlotCause } from './format-slot-cause.ts';

test('it names the cause, the free slots and when it began', () => {
  const lines = formatSlotCause({ cause: 'delivery', slots: 2, since: '2026-10-14T01:11:00Z', readyAgeMinutes: 3, waitingMinutes: null }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines).toStrictEqual(['cause: delivery, 2 free slot(s) since 2026-10-14T01:11:00Z', 'empty slot-minutes today (Sydney): delivery 12, triage 0, supply 4']);
});

test('it says none yet and how long Ready work has waited during the grace time', () => {
  const lines = formatSlotCause({ cause: null, slots: 2, since: '2026-10-14T01:00:00Z', readyAgeMinutes: 4, waitingMinutes: 4 }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines.at(0)).toBe('cause: none yet, Ready waiting 4 min');
});

test('it says none when no slot is free', () => {
  const lines = formatSlotCause({ cause: null, slots: 0, since: null, readyAgeMinutes: 4, waitingMinutes: null }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines.at(0)).toBe('cause: none (no free slot)');
});

test('it names the age of Ready data older than the fresh time when the cause is unknown', () => {
  const lines = formatSlotCause({ cause: 'unknown', slots: 2, since: null, readyAgeMinutes: 42, waitingMinutes: null }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines.at(0)).toBe('cause: unknown, Ready data 42 min old');
});

test('it says the Backlog count is unavailable when Ready data is fresh and the cause is unknown', () => {
  const lines = formatSlotCause({ cause: 'unknown', slots: 2, since: null, readyAgeMinutes: 5, waitingMinutes: null }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines.at(0)).toBe('cause: unknown, Backlog count unavailable');
});

test('it says Ready was never read when no snapshot exists', () => {
  const lines = formatSlotCause({ cause: 'unknown', slots: 2, since: null, readyAgeMinutes: null, waitingMinutes: null }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines.at(0)).toBe('cause: unknown, Ready never read');
});
