import type { Database } from 'bun:sqlite';

// A run from source on the live database leaves its schema to the installed hq: an upgrade here would
// make the installed hq refuse hq.db. A new database, or one already at the target, passes.
export function checkLiveUpgrade(db: Database, existed: boolean, target: number, isLive: boolean): void {
  const current = (db.query('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (isLive && existed && current > 0 && current < target) {
    throw new Error(`hq.db is schema v${current} and this source run knows v${target}: a source run never upgrades the live database. Install the build (bun run install-bin), or run it on a copy with HQ_DB=<path to a copy of hq.db>.`);
  }
}
