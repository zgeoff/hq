import type { Database } from 'bun:sqlite';
import type { GrantMarkSync } from './sync-grant-marks.ts';
import { syncGrantMarks } from './sync-grant-marks.ts';

export interface PrivateClone {
  directory: string;
  exists: (path: string) => boolean;
}

export function runGrantMarksTick(db: Database, clone: PrivateClone, actor: string): GrantMarkSync | null {
  if (!clone.exists(`${clone.directory}/.git`)) {
    return null;
  }
  return syncGrantMarks(db, clone.directory, actor);
}
