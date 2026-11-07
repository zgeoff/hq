import type { Database } from 'bun:sqlite';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import type { UnblockWarning } from './types.ts';
import { UnblockRowSchema } from './unblock-row-schema.ts';

export function closedForIssues(db: Database, issues: string[], except: string): UnblockWarning[] {
  const want = new Set(issues.map((i) => i.toUpperCase()));
  if (!want.size) return [];
  const rows = runSyncQuery(db, kdb(db).selectFrom('unblocks').selectAll().where('state', 'in', ['done', 'dropped']).where('id', '!=', except).compile(), UnblockRowSchema);
  return rows
    .flatMap((u) =>
      u.unblocks
        .filter((x) => want.has(x.issue.toUpperCase()))
        .map((x) => ({ issue: x.issue, id: u.id, state: u.state as 'done' | 'dropped', closed_at: u.closed_at, task: u.task })),
    )
    .sort((a, b) => a.issue.localeCompare(b.issue) || (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));
}
