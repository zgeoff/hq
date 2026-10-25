import type { SlotRow } from './types.ts';

const MATCH_TOLERANCE_MS = 60_000;

// The one slot whose 7-day reset is the one the newest usage sample reports. Two matches say
// nothing about which is active, so they give null too.
export function findActiveSlot(rows: readonly SlotRow[], sevenResetsAt: string | null): number | null {
  if (sevenResetsAt === null) {
    return null;
  }
  const target = Date.parse(sevenResetsAt);
  const matches = rows.filter((row) => row.sevenResetsAt !== null && Math.abs(Date.parse(row.sevenResetsAt) - target) <= MATCH_TOLERANCE_MS);
  return matches.length === 1 ? (matches[0]?.slot ?? null) : null;
}
