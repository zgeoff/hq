import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { redact } from './redact.ts';
import type { LinearIssue } from './types.ts';

export function writeIssues(db: Database, rows: LinearIssue[]): void {
  const t = iso(now());
  db.transaction(() => {
    const up = db.query(`INSERT INTO linear_issues (issue, type, title, state, closed_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (issue) DO UPDATE SET type = excluded.type, title = excluded.title, state = excluded.state, closed_at = excluded.closed_at, fetched_at = excluded.fetched_at`);
    for (const row of rows) {
      up.run(row.issue, row.type, redact(row.title, null), row.state, toStoredTime(row.closed_at), t);
    }
  }).immediate();
}

// Linear gives milliseconds and hq compares times as text in its own format, where
// 13:00:00.001Z sorts before 13:00:00Z; a time Linear sends that does not parse is kept as given.
function toStoredTime(at: string | null): string | null {
  return at === null || Number.isNaN(Date.parse(at)) ? at : iso(new Date(at));
}
