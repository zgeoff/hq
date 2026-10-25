import type { SlotRow } from './types.ts';

// The rows of the newest read, one per slot, or an empty list when there is none.
export function getNewestSlotRead(rows: readonly SlotRow[]): SlotRow[] {
  const newest = rows.at(-1)?.at;
  return rows.filter((row) => row.at === newest);
}
