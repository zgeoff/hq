import type { Database } from 'bun:sqlite';

export interface AsksDeps {
  db: Database;
}
