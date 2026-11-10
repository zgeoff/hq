import { expect, test } from 'bun:test';
import { buildNextSlot } from './build-next-slot.ts';
import type { Schedule } from './types.ts';

test.each([
  { title: 'an every slot after the anchor', schedule: { kind: 'every', everyMs: 7_200_000 } satisfies Schedule, anchor: '2026-11-10T00:00:00Z', after: '2026-11-10T00:00:00Z', expected: '2026-11-10T02:00:00.000Z' },
  { title: 'an every slot after a time between slots', schedule: { kind: 'every', everyMs: 7_200_000 } satisfies Schedule, anchor: '2026-11-10T00:00:00Z', after: '2026-11-10T03:10:00Z', expected: '2026-11-10T04:00:00.000Z' },
  { title: 'the next every slot when the time is on a slot', schedule: { kind: 'every', everyMs: 7_200_000 } satisfies Schedule, anchor: '2026-11-10T00:00:00Z', after: '2026-11-10T04:00:00Z', expected: '2026-11-10T06:00:00.000Z' },
  { title: 'a daily slot later today', schedule: { kind: 'daily', minuteOfDay: 570 } satisfies Schedule, anchor: '2026-11-01T00:00:00Z', after: '2026-11-10T08:00:00Z', expected: '2026-11-10T09:30:00.000Z' },
  { title: 'a daily slot tomorrow once today has passed', schedule: { kind: 'daily', minuteOfDay: 570 } satisfies Schedule, anchor: '2026-11-01T00:00:00Z', after: '2026-11-10T09:30:00Z', expected: '2026-11-11T09:30:00.000Z' },
  { title: 'an at time still ahead', schedule: { kind: 'at', atMs: Date.UTC(2026, 10, 10, 12) } satisfies Schedule, anchor: '2026-11-10T00:00:00Z', after: '2026-11-10T11:00:00Z', expected: '2026-11-10T12:00:00.000Z' },
])('it builds $title', (row) => {
  expect(buildNextSlot(row.schedule, new Date(row.anchor), new Date(row.after))?.toISOString()).toBe(row.expected);
});

test('it builds no slot for an at time that has passed', () => {
  const schedule: Schedule = { kind: 'at', atMs: Date.UTC(2026, 10, 10, 12) };

  expect(buildNextSlot(schedule, new Date('2026-11-10T00:00:00Z'), new Date('2026-11-10T12:00:00Z'))).toBeNull();
});
