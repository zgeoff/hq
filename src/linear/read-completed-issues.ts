import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const IssueSchema = z.object({ issue: z.string() });

export function readCompletedIssues(db: Database): Set<string> {
  const rows = runSyncQuery(db, kdb(db).selectFrom('linear_issues').select('issue').where('state', '=', 'completed').compile(), IssueSchema);
  return new Set(rows.map((row) => row.issue));
}
