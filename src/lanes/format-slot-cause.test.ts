import { expect, test } from 'bun:test';
import { formatSlotCause } from './format-slot-cause.ts';

test('it names the cause, the free slots and when it began', () => {
  const lines = formatSlotCause({ cause: 'delivery', slots: 2, since: '2026-10-14T01:11:00Z', readyAgeMinutes: 3, reason: null, waitingMinutes: null }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines).toStrictEqual(['cause: delivery, 2 free slot(s) since 2026-10-14T01:11:00Z', 'empty slot-minutes today (Sydney): delivery 12, triage 0, supply 4']);
});

test('it says none yet and how long Ready work has waited during the grace time', () => {
  const lines = formatSlotCause({ cause: null, slots: 2, since: '2026-10-14T01:00:00Z', readyAgeMinutes: 4, reason: null, waitingMinutes: 4 }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines.at(0)).toBe('cause: none yet, Ready waiting 4 min');
});

test('it says none when no slot is free', () => {
  const lines = formatSlotCause({ cause: null, slots: 0, since: null, readyAgeMinutes: 4, reason: null, waitingMinutes: null }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines.at(0)).toBe('cause: none (no free slot)');
});

test('it names the age of stale Ready data, even at the fresh time once rounded down', () => {
  const lines = formatSlotCause({ cause: 'unknown', slots: 2, since: null, readyAgeMinutes: 30, reason: 'ready_stale', waitingMinutes: null }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines.at(0)).toBe('cause: unknown, Ready data 30 min old');
});

test('it says the Backlog count is unavailable when that count failed', () => {
  const lines = formatSlotCause({ cause: 'unknown', slots: 2, since: null, readyAgeMinutes: 5, reason: 'backlog_unknown', waitingMinutes: null }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines.at(0)).toBe('cause: unknown, Backlog count unavailable');
});

test('it says the Backlog count is stale when that count is older than the fresh time', () => {
  const lines = formatSlotCause({ cause: 'unknown', slots: 2, since: null, readyAgeMinutes: 5, reason: 'backlog_stale', waitingMinutes: null }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines.at(0)).toBe('cause: unknown, Backlog count stale');
});

test('it says Ready was never read when no snapshot exists', () => {
  const lines = formatSlotCause({ cause: 'unknown', slots: 2, since: null, readyAgeMinutes: null, reason: 'ready_never_read', waitingMinutes: null }, { delivery: 12.4, triage: 0, supply: 3.6 });

  expect(lines.at(0)).toBe('cause: unknown, Ready never read');
});
