import type { Database } from 'bun:sqlite';
import { HqError } from '../errors.ts';
import { getRun } from './get-run.ts';
import type { Run } from './types.ts';

// A row by issue, or by one of its sessions (full id or 8-character prefix).
export function resolveRun(db: Database, key: string): Run {
  const byIssue = getRun(db, key);
  if (byIssue) return byIssue;
  const rows = db.query('SELECT DISTINCT issue FROM run_sessions WHERE session_id = ? OR substr(session_id, 1, 8) = ?').all(key, key) as { issue: string }[];
  if (rows.length === 1) return getRun(db, rows[0]!.issue)!;
  if (rows.length > 1) throw new HqError('ambiguous', `${key} matches sessions on ${rows.map((r) => r.issue).join(', ')}`);
  throw new HqError('not_found', `no run for ${key} (issue or session)`);
}
