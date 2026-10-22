import type { Database } from 'bun:sqlite';
import { parseUnblockRow as hydrate } from './parse-unblock-row.ts';
import type { Row, UnblockWarning } from './types.ts';

export function closedForIssues(db: Database, issues: string[], except: string): UnblockWarning[] {
  const want = new Set(issues.map((i) => i.toUpperCase()));
  if (!want.size) return [];
  const rows = (db.query("SELECT * FROM unblocks WHERE state IN ('done', 'dropped') AND id != ?").all(except) as Row[]).map(hydrate);
  return rows
    .flatMap((u) =>
      u.unblocks
        .filter((x) => want.has(x.issue.toUpperCase()))
        .map((x) => ({ issue: x.issue, id: u.id, state: u.state as 'done' | 'dropped', closed_at: u.closed_at, task: u.task })),
    )
    .sort((a, b) => a.issue.localeCompare(b.issue) || (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));
}
