import type { SlotRow } from './types.ts';

const MATCH_TOLERANCE_MS = 60_000;

export function findActiveSlot(rows: readonly SlotRow[], sevenResetsAt: string | null): number | null {
  if (sevenResetsAt === null) {
    return null;
  }
  const target = Date.parse(sevenResetsAt);
  const matches = rows.filter((row) => row.sevenResetsAt !== null && Math.abs(Date.parse(row.sevenResetsAt) - target) <= MATCH_TOLERANCE_MS);
  return matches.length === 1 ? (matches[0]?.slot ?? null) : null;
}
