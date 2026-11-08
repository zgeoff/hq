import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import { buildRowSchema } from '../db/build-row-schema.ts';
import type { HqTables } from '../db/hq-columns.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const LinearIssueRowSchema = buildRowSchema('linear_issues');

export function readLinearIssues(db: Database): Selectable<HqTables['linear_issues']>[] {
  return runSyncQuery(db, kdb(db).selectFrom('linear_issues').selectAll().orderBy('issue').compile(), LinearIssueRowSchema);
}
