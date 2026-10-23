import type { Database } from 'bun:sqlite';
import { SQLiteError } from 'bun:sqlite';

const RETRY_MS = 10;

export interface WaitClock {
  now: () => number;
  sleep: (pauseMs: number) => void;
}

const SYSTEM_CLOCK: WaitClock = { now: () => Date.now(), sleep: (pauseMs) => Bun.sleepSync(pauseMs) };

// SQLite never runs the busy handler for a switch into WAL: the switch upgrades a read lock to a
// write lock, and SQLite refuses that upgrade at once when another connection holds the write lock.
// Two hq processes that open a new database together would otherwise fail with "database is locked".
export function setWALMode(db: Database, timeoutMs: number, clock: WaitClock = SYSTEM_CLOCK): void {
  const deadline = clock.now() + timeoutMs;
  while (!trySetWALMode(db, clock, deadline)) {
    clock.sleep(RETRY_MS);
  }
}

function trySetWALMode(db: Database, clock: WaitClock, deadline: number): boolean {
  try {
    db.exec('PRAGMA journal_mode = WAL');
    return true;
  } catch (error) {
    if (error instanceof SQLiteError && error.code === 'SQLITE_BUSY' && clock.now() < deadline) {
      return false;
    }
    throw error;
  }
}
