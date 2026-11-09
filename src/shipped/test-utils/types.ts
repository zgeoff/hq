import type { Database } from 'bun:sqlite';

export interface ShippedDeps {
  db: Database;
}
