import { expect, test } from 'bun:test';
import { buildHourProfile } from './build-hour-profile.ts';

test('it averages the burn of the same Sydney hour across days', () => {
  const profile = buildHourProfile([
    { at: '2026-10-14T01:00:00Z', percent: 10, resetsAt: null },
    { at: '2026-10-14T01:30:00Z', percent: 12, resetsAt: null },
    { at: '2026-10-15T01:00:00Z', percent: 20, resetsAt: null },
    { at: '2026-10-15T01:30:00Z', percent: 21, resetsAt: null },
  ]);

  expect(profile[12]).toBe(3);
  expect(profile[13]).toBeNull();
});

test('it leaves out a step across a window reset', () => {
  const profile = buildHourProfile([
    { at: '2026-10-14T01:00:00Z', percent: 80, resetsAt: '2026-10-14T01:10:00Z' },
    { at: '2026-10-14T01:30:00Z', percent: 5, resetsAt: '2026-10-14T06:10:00Z' },
    { at: '2026-10-14T01:45:00Z', percent: 6, resetsAt: '2026-10-14T06:10:00Z' },
  ]);

  expect(profile[12]).toBe(4);
});
