import type { Database } from 'bun:sqlite';
import { readLaneSkips } from './read-lane-skips.ts';
import { writeSkipMove } from './write-skip-move.ts';

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
