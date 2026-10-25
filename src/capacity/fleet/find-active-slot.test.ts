import { expect, test } from 'bun:test';
import { findActiveSlot } from './find-active-slot.ts';
import type { SlotRow } from './types.ts';

test('it finds the slot whose 7-day reset is within a minute of the sample reset', () => {
  const rows: SlotRow[] = [
    { at: '2026-10-14T01:00:00Z', slot: 1, status: '200', five: 1, fiveResetsAt: null, seven: 2, sevenResetsAt: '2026-10-17T08:00:00Z', workingLanes: 2 },
    { at: '2026-10-14T01:00:00Z', slot: 2, status: '200', five: 1, fiveResetsAt: null, seven: 2, sevenResetsAt: '2026-10-19T09:00:30Z', workingLanes: 2 },
  ];

  expect(findActiveSlot(rows, '2026-10-19T09:00:00Z')).toBe(2);
});

test('it finds no active slot when none is within a minute', () => {
  const rows: SlotRow[] = [{ at: '2026-10-14T01:00:00Z', slot: 1, status: '200', five: 1, fiveResetsAt: null, seven: 2, sevenResetsAt: '2026-10-17T08:00:00Z', workingLanes: 2 }];

  expect(findActiveSlot(rows, '2026-10-17T08:01:01Z')).toBeNull();
});

test('it finds no active slot when two slots match', () => {
  const rows: SlotRow[] = [
    { at: '2026-10-14T01:00:00Z', slot: 1, status: '200', five: 1, fiveResetsAt: null, seven: 2, sevenResetsAt: '2026-10-17T08:00:00Z', workingLanes: 2 },
    { at: '2026-10-14T01:00:00Z', slot: 3, status: '200', five: 1, fiveResetsAt: null, seven: 2, sevenResetsAt: '2026-10-17T08:00:10Z', workingLanes: 2 },
  ];

  expect(findActiveSlot(rows, '2026-10-17T08:00:00Z')).toBeNull();
});

test('it finds no active slot when a slot read failed and has no reset', () => {
  const rows: SlotRow[] = [{ at: '2026-10-14T01:00:00Z', slot: 1, status: '403', five: null, fiveResetsAt: null, seven: null, sevenResetsAt: null, workingLanes: 2 }];

  expect(findActiveSlot(rows, null)).toBeNull();
});
