import type { Database } from 'bun:sqlite';

export interface ProbeDeps {
  db: Database;
}
