import { expect, test } from 'bun:test';
import { parseScheduleFlags } from './parse-schedule.ts';

test.each([
  { flags: { every: '30m' }, expected: { ok: true, value: { kind: 'every', spec: '30m' }, schedule: { kind: 'every', everyMs: 1_800_000 } } },
  { flags: { every: '2h' }, expected: { ok: true, value: { kind: 'every', spec: '2h' }, schedule: { kind: 'every', everyMs: 7_200_000 } } },
  { flags: { every: '1d' }, expected: { ok: true, value: { kind: 'every', spec: '1d' }, schedule: { kind: 'every', everyMs: 86_400_000 } } },
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
  { title: 'a daily hour past 23', flags: { daily: '24:00Z' } },
  { title: 'a daily minute past 59', flags: { daily: '09:60Z' } },
  { title: 'a daily without the Z', flags: { daily: '09:30' } },
  { title: 'an at without a zone', flags: { at: '2026-11-12T09:00:00' } },
  { title: 'an at that is not a date', flags: { at: '2026-13-45T09:00:00Z' } },
  { title: 'an at in words', flags: { at: 'tomorrow' } },
])('it refuses $title', (row) => {
  expect(parseScheduleFlags(row.flags)).toStrictEqual({ ok: false, reason: expect.any(String) });
});
