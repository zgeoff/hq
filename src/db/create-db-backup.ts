import type { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';

// A copy of hq.db beside it, named for what is about to change it: `<path>.bak-<label>-<time>-<pid>`.
export function createDBBackup(db: Database, path: string, label: string): string {
  const stamp = iso(now()).replaceAll(/[-:]/gu, '');
  let backup = `${path}.bak-${label}-${stamp}-${process.pid}`;

  // A backup taken by hand in the same second has this name: never fail the change on it. The pid
  // keeps two hq processes writing at once from using the same file.
  for (let i = 1; existsSync(backup); i++) {
    backup = `${path}.bak-${label}-${stamp}-${process.pid}-${i}`;
  }
  db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
  return backup;
}
