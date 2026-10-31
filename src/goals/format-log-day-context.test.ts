import { expect, test } from 'bun:test';
import { formatLogDayContext } from './format-log-day-context.ts';

test('it gives the time of the last dated line when there is one', () => {
  expect(formatLogDayContext({ day: '2026-10-14', last: Date.parse('2026-10-14T00:10:00Z') }, '- 00:20Z poured the tea\n')).toBe('<!-- day context: 2026-10-14T00:10Z -->\n');
});

test('it gives a date heading when only a heading set the day', () => {
  expect(formatLogDayContext({ day: '2026-10-13', last: null }, '- 09:00Z boiled the water\n')).toBe('### 2026-10-13 (day context)\n');
});

test('it clears the day before a time-only entry when no day is set', () => {
  expect(formatLogDayContext({ day: null, last: null }, '- 09:00Z boiled the water\n')).toBe('<!-- day context: none -->\n');
});

test('it clears the day before a DEPLOY word when no day is set', () => {
  expect(formatLogDayContext({ day: null, last: null }, 'kettle DEPLOY waits on the lid\n')).toBe('<!-- day context: none -->\n');
});

test('it gives no line when no day is set and nothing below takes one', () => {
  expect(formatLogDayContext({ day: null, last: null }, '09:00Z boiled the water\n')).toBe('');
});
