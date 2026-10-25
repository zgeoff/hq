import type { Database } from 'bun:sqlite';
import type { GrantMarkSync } from './sync-grant-marks.ts';
import { syncGrantMarks } from './sync-grant-marks.ts';

// Where the hq-private clone is, and how to tell that a path exists.
export interface PrivateClone {
  directory: string;
  exists: (path: string) => boolean;
}

// The watcher's grant marks pass, after the tree sync fetched hq-private. Null with no clone.
export function runGrantMarksTick(db: Database, clone: PrivateClone, actor: string): GrantMarkSync | null {
  if (!clone.exists(`${clone.directory}/.git`)) {
    return null;
  }
  return syncGrantMarks(db, clone.directory, actor);
}
