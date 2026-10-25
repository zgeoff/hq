import type { SlotRow } from './types.ts';

export function makeLanesAt(rows: readonly SlotRow[]): (time: string) => number {
  const reads = [...new Map(rows.map((row) => [row.at, row.workingLanes])).entries()].toSorted(([left], [right]) => Date.parse(left) - Date.parse(right));
  return (time) => {
    const at = Date.parse(time);
    const before = reads.findLast(([readAt]) => Date.parse(readAt) <= at);
    return (before ?? reads[0])?.[1] ?? 0;
  };
}
