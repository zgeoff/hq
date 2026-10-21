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
    for (const r of rows) up.run(r.issue, r.type, redact(r.title, null), r.state, r.closed_at, t);
  }).immediate();
}
