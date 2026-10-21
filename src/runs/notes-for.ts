import type { Database } from 'bun:sqlite';
import type { RunNote } from './types.ts';

export function notesFor(db: Database, issue: string, limit: number): RunNote[] {
  return db.query('SELECT * FROM run_notes WHERE issue = ? ORDER BY id DESC LIMIT ?').all(issue, limit) as RunNote[];
}
