import type { SlotRow } from './types.ts';

export function getNewestSlotRead(rows: readonly SlotRow[]): SlotRow[] {
  const newest = rows.at(-1)?.at;
  return rows.filter((row) => row.at === newest);
}
