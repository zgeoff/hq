import type { Database } from 'bun:sqlite';
import { isSkipActive } from './is-skip-active.ts';
import { readLaneSkips } from './read-lane-skips.ts';
import { writeSkipMove } from './write-skip-move.ts';

// Drops the skips whose time has passed, and those whose until issue Linear reads Done or Canceled
// (settled), logging each; returns the issues whose skips ended. The caller holds the transaction.
export function removeEndedSkips(db: Database, settled: ReadonlySet<string>, actor: string, at: Date): string[] {
  const ended = readLaneSkips(db).filter((skip) => !isSkipActive(skip, at) || settled.has(skip.until));
  for (const skip of ended) {
    writeSkipMove(db, 'skip-ended', skip, actor);
  }
  return ended.map((skip) => skip.issue);
}
