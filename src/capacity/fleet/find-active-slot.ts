import { isSameSevenReset } from './is-same-seven-reset.ts';
import type { SlotRow } from './types.ts';

export function findActiveSlot(rows: readonly SlotRow[], sevenResetsAt: string | null): number | null {
  if (sevenResetsAt === null) {
    return null;
  }
  const matches = rows.filter((row) => row.sevenResetsAt !== null && isSameSevenReset(row.sevenResetsAt, sevenResetsAt));
  return matches.length === 1 ? (matches[0]?.slot ?? null) : null;
}
