import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';

const SampleSchema = buildRowSchema('probe_samples');

export function lastSample(db: Database): { at: string; target_ok: number; control_ok: number | null; ms: number | null; detail: string | null; ready_ok: number | null } | null {
  return runSyncRow(db, kdb(db).selectFrom('probe_samples').selectAll().orderBy('at', 'desc').limit(1).compile(), SampleSchema);
}
