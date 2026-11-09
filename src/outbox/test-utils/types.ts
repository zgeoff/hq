import type { Database } from 'bun:sqlite';

export interface OutboxDeps {
  db: Database;
}
