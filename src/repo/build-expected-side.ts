import type { ArchiveSide } from './types.ts';

// What a side would hold after the re-key: every row of the old name takes the new one.
export function buildExpectedSide(side: ArchiveSide): ArchiveSide {
  return { ...side, counts: side.counts.map((count) => ({ ...count, from: 0, to: count.to + count.from })) };
}
