import type { Database } from 'bun:sqlite';

export function createStagingHolderTable(lock: Database): void {
  lock.run('CREATE TABLE IF NOT EXISTS holder (id INTEGER PRIMARY KEY CHECK (id = 1), pid INTEGER NOT NULL)');
}

export function writeStagingHolder(lock: Database, pid: number): void {
  lock.query('INSERT OR REPLACE INTO holder (id, pid) VALUES (1, ?)').run(pid);
}
