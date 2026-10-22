import type { Database } from 'bun:sqlite';
import { readLaneSkips } from './read-lane-skips.ts';
import { writeSkipMove } from './write-skip-move.ts';

// Drops one issue's skip and logs it; false when the issue had none, and then nothing is logged.
export function removeLaneSkip(db: Database, issue: string, actor: string): boolean {
  return db
    .transaction(() => {
      const skip = readLaneSkips(db).find((stored) => stored.issue === issue);
      if (skip === undefined) {
        return false;
      }
      writeSkipMove(db, 'skip-dropped', skip, actor);
      return true;
    })
    .immediate();
}
