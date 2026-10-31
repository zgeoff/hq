import { expect, test } from 'bun:test';
import { buildLogDay } from './build-log-day.ts';

test('it holds no day when the text sets none', () => {
  expect(buildLogDay('# kettle\n\n## Log\n')).toStrictEqual({ day: null, last: null });
});

test('it holds the day of a date heading with no time', () => {
  expect(buildLogDay('## Log\n### 2026-10-13 a quiet day\n')).toStrictEqual({ day: '2026-10-13', last: null });
});

test('it holds the time of the last time-only entry, rolled past midnight', () => {
  expect(buildLogDay('## Log\n### 2026-10-13\n- 23:50Z boiled the water\n- 00:10Z poured the tea\n')).toStrictEqual({ day: '2026-10-14', last: Date.parse('2026-10-14T00:10:00Z') });
});

test('it holds no day after the no-day context line', () => {
  expect(buildLogDay('### 2026-10-13\n- 09:00Z boiled the water\n<!-- day context: none -->\n')).toStrictEqual({ day: null, last: null });
});
