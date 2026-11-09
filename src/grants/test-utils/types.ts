import type { Database } from 'bun:sqlite';

export interface GrantsDeps {
  db: Database;
}
