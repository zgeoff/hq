import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';

export function updateRunTime(db: Database, issue: string): void {
  db.query('UPDATE runs SET updated_at = ? WHERE issue = ?').run(iso(now()), issue);
}
