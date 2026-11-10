import { expect, test } from 'bun:test';
import { parseScheduleFlags } from './parse-schedule.ts';

test.each([
  { flags: { every: '30m' }, expected: { ok: true, value: { kind: 'every', spec: '30m' }, schedule: { kind: 'every', everyMs: 1_800_000 } } },
  { flags: { every: '2h' }, expected: { ok: true, value: { kind: 'every', spec: '2h' }, schedule: { kind: 'every', everyMs: 7_200_000 } } },
  { flags: { every: '1d' }, expected: { ok: true, value: { kind: 'every', spec: '1d' }, schedule: { kind: 'every', everyMs: 86_400_000 } } },
  { flags: { every: '366d' }, expected: { ok: true, value: { kind: 'every', spec: '366d' }, schedule: { kind: 'every', everyMs: 31_622_400_000 } } },
  { flags: { at: '2028-02-29T09:00:00Z' }, expected: { ok: true, value: { kind: 'at', spec: '2028-02-29T09:00:00Z' }, schedule: { kind: 'at', atMs: Date.UTC(2028, 1, 29, 9) } } },
  { flags: { daily: '09:30Z' }, expected: { ok: true, value: { kind: 'daily', spec: '09:30Z' }, schedule: { kind: 'daily', minuteOfDay: 570 } } },
  { flags: { daily: '00:00Z' }, expected: { ok: true, value: { kind: 'daily', spec: '00:00Z' }, schedule: { kind: 'daily', minuteOfDay: 0 } } },
  { flags: { at: '2026-11-12T09:00:00Z' }, expected: { ok: true, value: { kind: 'at', spec: '2026-11-12T09:00:00Z' }, schedule: { kind: 'at', atMs: Date.UTC(2026, 10, 12, 9) } } },
  { flags: { at: '2026-11-12T20:00:00+11:00' }, expected: { ok: true, value: { kind: 'at', spec: '2026-11-12T09:00:00Z' }, schedule: { kind: 'at', atMs: Date.UTC(2026, 10, 12, 9) } } },
])('it parses $flags', (row) => {
  expect(parseScheduleFlags(row.flags)).toStrictEqual(row.expected);
});

test.each([
  { title: 'no schedule', flags: {} },
  { title: 'two schedules', flags: { every: '30m', daily: '09:30Z' } },
  { title: 'an every without a unit', flags: { every: '30' } },
  { title: 'an every of zero', flags: { every: '0m' } },
  { title: 'an every under the 5 minute tick', flags: { every: '4m' } },
  { title: 'an every in words', flags: { every: 'hourly' } },
  { title: 'an every over 366 days', flags: { every: '367d' } },
  { title: 'an every too large for a date', flags: { every: '99999999999d' } },
  { title: 'a daily hour past 23', flags: { daily: '24:00Z' } },
  { title: 'a daily minute past 59', flags: { daily: '09:60Z' } },
  { title: 'a daily without the Z', flags: { daily: '09:30' } },
  { title: 'an at without a zone', flags: { at: '2026-11-12T09:00:00' } },
  { title: 'an at that is not a date', flags: { at: '2026-13-45T09:00:00Z' } },
  { title: 'an at in words', flags: { at: 'tomorrow' } },
  { title: 'an at on February 30', flags: { at: '2026-02-30T09:00:00Z' } },
  { title: 'an at on February 29 of a common year', flags: { at: '2027-02-29T09:00:00+11:00' } },
  { title: 'an at at hour 24', flags: { at: '2026-11-12T24:00:00Z' } },
  { title: 'an at at second 60', flags: { at: '2026-11-12T09:00:60Z' } },
])('it refuses $title', (row) => {
  expect(parseScheduleFlags(row.flags)).toStrictEqual({ ok: false, reason: expect.any(String) });
});
