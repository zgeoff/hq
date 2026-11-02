import type { ArchiveSide } from './types.ts';

export function buildExpectedSide(side: ArchiveSide): ArchiveSide {
  return { ...side, counts: side.counts.map((count) => ({ ...count, from: 0, to: count.to + count.from })) };
}
