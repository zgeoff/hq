import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { PRIVATE_TREE } from '../prompts/private-tree.ts';
import type { GrantMarkSync } from './sync-grant-marks.ts';
import { syncGrantMarks } from './sync-grant-marks.ts';

// The watcher's grant marks pass, after the tree sync fetched hq-private. Null with no clone.
export function runGrantMarksTick(db: Database, actor: string): GrantMarkSync | null {
  const directory = PRIVATE_TREE.dir();
  if (!existsSync(`${directory}/.git`)) {
    return null;
  }
  return syncGrantMarks(db, directory, actor);
}
