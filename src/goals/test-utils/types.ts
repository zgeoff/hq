import type { Database } from 'bun:sqlite';

export interface GoalsDeps {
  db: Database;
}
