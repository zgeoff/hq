import type { Database } from 'bun:sqlite';

export interface EventsDeps {
  db: Database;
}
