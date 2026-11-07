import type { Database } from 'bun:sqlite';
import { runSyncRow } from '../db/run-sync-row.ts';
import { HqError } from '../errors.ts';
import { kdb } from '../kdb.ts';
import { RunPrSchema } from './run-pr-schema.ts';
import type { RunPr } from './types.ts';

export function requirePR(db: Database, ref: string): RunPr {
  const pr = runSyncRow(db, kdb(db).selectFrom('run_prs').selectAll().where('ref', '=', ref).compile(), RunPrSchema);
  if (!pr) {
    throw new HqError('not_found', `no PR ${ref} on any run: hq run pr <issue> ${ref}`);
  }
  return pr;
}
