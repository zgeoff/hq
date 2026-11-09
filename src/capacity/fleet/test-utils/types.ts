import type { Database } from 'bun:sqlite';

export interface FleetDeps {
  db: Database;
}
