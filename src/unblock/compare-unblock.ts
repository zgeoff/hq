import { PRIORITIES } from './priorities.ts';
import type { UnblockItem } from './types.ts';

// Explicit ranks first (lowest first). Then Urgent/High work unblocked, then
// the most work unblocked, then the fewest minutes, then the oldest.
export function compareUnblock(a: UnblockItem, b: UnblockItem): number {
  if (a.rank !== null || b.rank !== null) {
    if (a.rank === null) return 1;
    if (b.rank === null) return -1;
    if (a.rank !== b.rank) return a.rank - b.rank;
  }
  return (
    bestPriority(a) - bestPriority(b) ||
    b.unblocks.length - a.unblocks.length ||
    (a.minutes ?? Infinity) - (b.minutes ?? Infinity) ||
    a.added_seq - b.added_seq
  );
}

const bestPriority = (u: UnblockItem) => Math.min(PRIORITIES.length - 1, ...u.unblocks.map((x) => PRIORITIES.indexOf(x.priority)));
