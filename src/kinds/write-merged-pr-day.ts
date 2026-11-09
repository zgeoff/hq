import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import type { HqTables } from '../db/hq-columns.ts';

export type MergedPRDayRow = Selectable<HqTables['merged_pr_days']>;

export function writeMergedPRDay(db: Database, day: MergedPRDayRow): void {
  db.query('INSERT INTO merged_pr_days (day, n, at) VALUES (?, ?, ?) ON CONFLICT (day) DO UPDATE SET n = excluded.n, at = excluded.at').run(day.day, day.n, day.at);
}
