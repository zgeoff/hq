import type { Database } from 'bun:sqlite';
import { createDBBackup } from './create-db-backup.ts';
import { MIGRATIONS } from './migrations.ts';
import { userVersion } from './user-version.ts';

export function migrate(db: Database, path: string, existed: boolean, migrations = MIGRATIONS): string | null {
  const target = migrations.length;
  const current = userVersion(db);
  if (current > target) {
    throw new Error(`hq.db is schema v${current}, this hq knows v${target}: install a newer hq`);
  }
  if (current === target) return null;
  let backup: string | null = null;
  if (existed && current > 0) {
    backup = createDBBackup(db, path, `v${current}`);
  }

  // Each step reads the version again under the write lock, so a second hq starting at once skips
  // what the first already applied instead of running the same ALTER twice.
  applyPendingMigrations(db, migrations);
  return backup;
}

function applyPendingMigrations(db: Database, migrations: readonly string[]): void {
  if (applyNextMigration(db, migrations)) {
    applyPendingMigrations(db, migrations);
  }
}

function applyNextMigration(db: Database, migrations: readonly string[]): boolean {
  return db
    .transaction(() => {
      const version = userVersion(db);
      if (version >= migrations.length) {
        return false;
      }
      db.exec(migrations[version] ?? '');
      db.exec(`PRAGMA user_version = ${version + 1}`);
      return true;
    })
    .immediate();
}
