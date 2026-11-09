import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import type { HqTables } from '../db/hq-columns.ts';

export type StartedIssueRow = Selectable<HqTables['linear_started']>;

export function writeStartedIssue(db: Database, issue: StartedIssueRow): void {
  db.query('INSERT INTO linear_started (issue, started_at, fetched_at) VALUES (?, ?, ?)').run(issue.issue, issue.started_at, issue.fetched_at);
}
