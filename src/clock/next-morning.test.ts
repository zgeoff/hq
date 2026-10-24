import { expect, test } from 'bun:test';
import { iso } from './iso.ts';
import { nextMorning } from './next-morning.ts';

test.each([
  ['00:37 on 24 Oct', '2026-10-23T13:37:00Z', '2026-10-23T20:00:00Z'],
  ['07:30 on 24 Oct', '2026-10-23T20:30:00Z', '2026-10-24T20:00:00Z'],
  ['07:00 on 24 Oct', '2026-10-23T20:00:00Z', '2026-10-24T20:00:00Z'],
  ['00:30 AEST on 4 Oct, the day DST starts', '2026-10-03T14:30:00Z', '2026-10-03T20:00:00Z'],
  ['07:30 AEST on 3 Oct, the day before DST starts', '2026-10-02T21:30:00Z', '2026-10-03T20:00:00Z'],
  ['00:30 AEDT on 5 Apr, the day DST ends', '2026-04-04T13:30:00Z', '2026-04-04T21:00:00Z'],
  ['07:30 AEDT on 4 Apr, the day before DST ends', '2026-04-03T20:30:00Z', '2026-04-04T21:00:00Z'],
])('it puts %s Sydney off to the first 07:00 Sydney after it', (_label, from, due) => {
  const morning = nextMorning(new Date(from));

  expect(iso(morning)).toBe(due);
});
