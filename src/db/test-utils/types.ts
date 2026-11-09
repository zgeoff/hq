import type { Database } from 'bun:sqlite';

export interface MetaDeps {
  db: Database;
}
