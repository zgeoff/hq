import { buildMockSlotRow } from '../../../../test/build-mock-slot-row.ts';
import type { SlotRow } from '../types.ts';
import { writeSlotUsage } from '../write-slot-usage.ts';
import type { FleetDeps } from './types.ts';

export function seedSlotUsage(deps: FleetDeps, input: Partial<SlotRow> = {}): SlotRow {
  const row = buildMockSlotRow(input);
  writeSlotUsage(deps.db, [row], row.workingLanes, new Date(row.at));

  return row;
}
