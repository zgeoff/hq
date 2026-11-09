import type { Database } from 'bun:sqlite';

export interface NoslopDeps {
  db: Database;
}
