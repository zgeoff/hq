import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import type { Check } from '../health/types.ts';
import { readMainGrants } from './read-main-grants.ts';
import { listUnmarkedGrants } from './sync-grant-marks.ts';

// For hq health: every grant on hq-private's main has a named mark, so `hq grant act` finds it.
// Null with no clone: the hq-private tree check reports that.
export function readGrantMarksCheck(db: Database, directory: string): Check | null {
  if (!existsSync(`${directory}/.git`)) {
    return null;
  }
  try {
    const grants = readMainGrants(directory);
    const unmarked = listUnmarkedGrants(db, grants);
    if (unmarked.length === 0) {
      return { key: 'grant-marks', ok: true, line: `grant marks: all ${grants.length} grants on hq-private main have one` };
    }
    return { key: 'grant-marks', ok: false, line: `grant marks: ${unmarked.length} grant(s) on hq-private main have none, so hq grant act refuses them: ${unmarked.map((grant) => grant.name).join(', ')}` };
  } catch (error) {
    return { key: 'grant-marks', ok: false, line: `grant marks: can't read hq-private's grants: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}` };
  }
}
