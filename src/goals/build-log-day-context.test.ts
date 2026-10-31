import { expect, test } from 'bun:test';
import { buildLogDayContext } from './build-log-day-context.ts';

test('it gives no line when the text sets no day', () => {
  expect(buildLogDayContext('# kettle\n\n## Log\n')).toBe('');
});

test('it gives a date heading when the last dated line is a heading', () => {
  expect(buildLogDayContext('## Log\n### 2026-10-13 a quiet day\n')).toBe('### 2026-10-13 (day context)\n');
});

test('it gives the time of the last dated entry, rolled past midnight', () => {
  expect(buildLogDayContext('## Log\n### 2026-10-13\n- 23:50Z boiled the water\n- 00:10Z poured the tea\n')).toBe('<!-- day context: 2026-10-14T00:10Z -->\n');
});

test('it gives the time of the last line with a full time', () => {
  expect(buildLogDayContext('## Log\n- 2026-10-13T22:30Z took over\n  with a note\n')).toBe('<!-- day context: 2026-10-13T22:30Z -->\n');
});
