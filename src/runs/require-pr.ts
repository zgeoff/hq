import type { Database } from 'bun:sqlite';
import { runSyncRow } from '../db/run-sync-row.ts';
import { HqError } from '../errors.ts';
import { kdb } from '../kdb.ts';
import { RunPRSchema } from './run-pr-schema.ts';
import type { RunPR } from './types.ts';

export function requirePR(db: Database, ref: string): RunPR {
  const pr = runSyncRow(db, kdb(db).selectFrom('run_prs').selectAll().where('ref', '=', ref).compile(), RunPRSchema);
  if (!pr) {
    throw new HqError('not_found', `no PR ${ref} on any run: hq run pr <issue> ${ref}`);
  }
  return pr;
}
