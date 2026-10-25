import { expect, test } from 'bun:test';
import { buildMockSlotRow } from './build-mock-slot-row.ts';

test('it builds a default slot read of slot 1 at 30% of its week', () => {
  expect(buildMockSlotRow()).toStrictEqual({ at: '2026-10-14T00:30:00Z', slot: 1, status: '200', five: 0, fiveResetsAt: null, seven: 30, sevenResetsAt: '2026-10-18T00:00:00Z', workingLanes: 2 });
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockSlotRow({ slot: 3, status: '403', seven: null, sevenResetsAt: null })).toStrictEqual({ at: '2026-10-14T00:30:00Z', slot: 3, status: '403', five: 0, fiveResetsAt: null, seven: null, sevenResetsAt: null, workingLanes: 2 });
});
