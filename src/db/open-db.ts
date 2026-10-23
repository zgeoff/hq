import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { checkLiveUpgrade } from './check-live-upgrade.ts';
import { dbPath } from './db-path.ts';
import { isLiveSourceRun } from './is-live-source-run.ts';
import { migrate } from './migrate.ts';
import { MIGRATIONS } from './migrations.ts';
import { setWALMode } from './set-wal-mode.ts';

const BUSY_TIMEOUT_MS = 5000;

export function openDb(path = dbPath()): Database {
  mkdirSync(dirname(path), { recursive: true });
  const existed = existsSync(path);
  const db = new Database(path, { create: true, strict: true });
  db.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}; PRAGMA foreign_keys = ON;`);
  setWALMode(db, BUSY_TIMEOUT_MS);
  checkLiveUpgrade(db, existed, MIGRATIONS.length, isLiveSourceRun());
  migrate(db, path, existed);
  return db;
}
