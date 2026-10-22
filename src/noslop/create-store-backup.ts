import { Database } from 'bun:sqlite';
import { rmSync } from 'node:fs';
import { HqError } from '../errors.ts';

// A copy of the store beside it, made with SQLite's own backup and checked with integrity_check.
// A copy that is not ok is removed and refused.
export function createStoreBackup(store: string, shortSha: string, stamp: string): string {
  const backup = `${store}.bak-${shortSha}-${stamp}`;
  try {
    const source = new Database(store, { readonly: true });
    try {
      source.run(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
    } finally {
      source.close();
    }
  } catch (error) {
    throw new HqError('store_unreadable', `hq cannot back up the store ${store}: ${(error as Error).message}`);
  }
  return requireIntact(backup, store);
}

function readIntegrity(backup: string): string {
  const db = new Database(backup, { readonly: true });
  try {
    return db.query<{ integrity_check: string }, []>('PRAGMA integrity_check').all().map((row) => row.integrity_check).join('; ');
  } finally {
    db.close();
  }
}

function requireIntact(backup: string, store: string): string {
  const verdict = readIntegrity(backup);
  if (verdict !== 'ok') {
    rmSync(backup, { force: true });
    throw new HqError('store_unreadable', `the backup of ${store} failed its integrity check (${verdict}); it was removed and nothing was changed`);
  }
  return backup;
}
