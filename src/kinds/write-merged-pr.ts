import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import type { HqTables } from '../db/hq-columns.ts';

export type MergedPRRow = Selectable<HqTables['merged_prs']>;

export function writeMergedPR(db: Database, pr: MergedPRRow): void {
  db.query(`INSERT INTO merged_prs (repo, number, merged_at, title, kind, issue) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (repo, number) DO UPDATE SET merged_at = excluded.merged_at, title = excluded.title, kind = excluded.kind, issue = excluded.issue`).run(pr.repo, pr.number, pr.merged_at, pr.title, pr.kind, pr.issue);
}
