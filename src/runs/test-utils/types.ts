import type { Database } from 'bun:sqlite';

export interface RunsDeps {
  db: Database;
}
