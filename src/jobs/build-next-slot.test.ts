import { expect, test } from 'bun:test';
import { buildNextSlot } from './build-next-slot.ts';
import type { Schedule } from './types.ts';

const EVERY_2H: Schedule = { kind: 'every', everyMs: 7_200_000 };
const DAILY_0930: Schedule = { kind: 'daily', minuteOfDay: 570 };

test.each([
  { title: 'an every slot after the anchor', schedule: EVERY_2H, anchor: '2026-11-10T00:00:00Z', after: '2026-11-10T00:00:00Z', expected: '2026-11-10T02:00:00.000Z' },
  { title: 'an every slot after a time between slots', schedule: EVERY_2H, anchor: '2026-11-10T00:00:00Z', after: '2026-11-10T03:10:00Z', expected: '2026-11-10T04:00:00.000Z' },
  { title: 'the next every slot when the time is on a slot', schedule: EVERY_2H, anchor: '2026-11-10T00:00:00Z', after: '2026-11-10T04:00:00Z', expected: '2026-11-10T06:00:00.000Z' },
  { title: 'a daily slot later today', schedule: DAILY_0930, anchor: '2026-11-01T00:00:00Z', after: '2026-11-10T08:00:00Z', expected: '2026-11-10T09:30:00.000Z' },
  { title: 'a daily slot tomorrow once today has passed', schedule: DAILY_0930, anchor: '2026-11-01T00:00:00Z', after: '2026-11-10T09:30:00Z', expected: '2026-11-11T09:30:00.000Z' },
  { title: 'an at time still ahead', schedule: { kind: 'at', atMs: Date.UTC(2026, 10, 10, 12) } satisfies Schedule, anchor: '2026-11-10T00:00:00Z', after: '2026-11-10T11:00:00Z', expected: '2026-11-10T12:00:00.000Z' },
])('it builds $title', ({ schedule, anchor, after, expected }) => {
  expect(buildNextSlot(schedule, new Date(anchor), new Date(after))?.toISOString()).toBe(expected);
});

test('it builds no slot for an at time that has passed', () => {
  const schedule: Schedule = { kind: 'at', atMs: Date.UTC(2026, 10, 10, 12) };

  expect(buildNextSlot(schedule, new Date('2026-11-10T00:00:00Z'), new Date('2026-11-10T12:00:00Z'))).toBeNull();
});
