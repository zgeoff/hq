import type { Database } from 'bun:sqlite';
import type { Selectable } from 'kysely';
import { buildRowSchema } from '../db/build-row-schema.ts';
import type { HqTables } from '../db/hq-columns.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const DeployRunSchema = buildRowSchema('deploy_runs');

export function readDeployRuns(db: Database): Selectable<HqTables['deploy_runs']>[] {
  return runSyncQuery(db, kdb(db).selectFrom('deploy_runs').selectAll().orderBy('run_id').compile(), DeployRunSchema);
}
