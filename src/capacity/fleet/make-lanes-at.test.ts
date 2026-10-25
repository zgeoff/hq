import { expect, test } from 'bun:test';
import { makeLanesAt } from './make-lanes-at.ts';

test('it gives the working lanes of the newest slot read at or before the time', () => {
  const lanesAt = makeLanesAt([
    { at: '2026-10-14T02:00:00Z', slot: 1, status: '200', five: 0, fiveResetsAt: null, seven: 10, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 4 },
    { at: '2026-10-14T00:00:00Z', slot: 1, status: '200', five: 0, fiveResetsAt: null, seven: 8, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 },
    { at: '2026-10-14T00:00:00Z', slot: 2, status: '200', five: 0, fiveResetsAt: null, seven: 30, sevenResetsAt: '2026-10-19T00:00:00Z', workingLanes: 2 },
  ]);

  expect([lanesAt('2026-10-14T00:00:00Z'), lanesAt('2026-10-14T01:59:00Z'), lanesAt('2026-10-14T02:00:00Z'), lanesAt('2026-10-15T00:00:00Z')]).toStrictEqual([2, 2, 4, 4]);
});

test('it gives the working lanes of the oldest slot read for a time before every read', () => {
  const lanesAt = makeLanesAt([
    { at: '2026-10-14T00:00:00Z', slot: 1, status: '200', five: 0, fiveResetsAt: null, seven: 8, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 3 },
    { at: '2026-10-14T02:00:00Z', slot: 1, status: '200', five: 0, fiveResetsAt: null, seven: 10, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 1 },
  ]);

  expect(lanesAt('2026-10-13T20:00:00Z')).toBe(3);
});
