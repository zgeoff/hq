import { expect, test } from 'bun:test';
import { formatCapUntil } from './format-cap-until.ts';

test('it formats the time as a Sydney weekday and time', () => {
  expect(formatCapUntil('2026-10-16T01:00:00Z')).toBe('Fri 12:00');
});

test('it adds the Sydney day and month when asked for the date', () => {
  expect(formatCapUntil('2026-10-16T01:00:00Z', { withDate: true })).toBe('Fri 16 Oct 12:00');
});
