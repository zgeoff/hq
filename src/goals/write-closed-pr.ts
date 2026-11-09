import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import type { HqTables } from '../db/hq-columns.ts';

export type ClosedPRRow = Selectable<HqTables['closed_prs']>;

export function writeClosedPR(db: Database, pr: ClosedPRRow): void {
  db.query('INSERT INTO closed_prs (repo, number, closed_at) VALUES (?, ?, ?) ON CONFLICT (repo, number) DO UPDATE SET closed_at = excluded.closed_at').run(pr.repo, pr.number, pr.closed_at);
}
