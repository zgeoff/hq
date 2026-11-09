import type { Database } from 'bun:sqlite';

export interface LinearDeps {
  db: Database;
}
