import type { SlotRow } from './types.ts';

export interface SlotReadings {
  known: SlotRow[];
  unknown: SlotRow[];
}

const GOOD_READ_MAX_AGE_MS = 6 * 3_600_000;

export function collectSlotReadings(rows: readonly SlotRow[], at: Date): SlotReadings {
  const slots = [...new Set(rows.map((row) => row.slot))].toSorted((left, right) => left - right);
  const known: SlotRow[] = [];
  const unknown: SlotRow[] = [];
  for (const slot of slots) {
    const own = rows.filter((row) => row.slot === slot);
    const good = own.findLast((row) => hasFigures(row) && at.getTime() - Date.parse(row.at) <= GOOD_READ_MAX_AGE_MS);
    const newest = own.at(-1);
    if (good !== undefined) {
      known.push(good);
    } else if (newest !== undefined) {
      unknown.push(newest);
    }
  }
  return { known, unknown };
}

function hasFigures(row: SlotRow): boolean {
  return row.five !== null || row.seven !== null;
}
