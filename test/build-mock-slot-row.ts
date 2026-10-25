import type { SlotRow } from '../src/capacity/fleet/types.ts';

export function buildMockSlotRow(overrides: Partial<SlotRow> = {}): SlotRow {
  return {
    at: '2026-10-14T00:30:00Z',
    slot: 1,
    status: '200',
    five: 0,
    fiveResetsAt: null,
    seven: 30,
    sevenResetsAt: '2026-10-18T00:00:00Z',
    workingLanes: 2,
    ...overrides,
  };
}
