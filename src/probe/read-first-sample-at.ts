import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';

const FirstSampleSchema = buildRowSchema('probe_samples').pick({ at: true });

export function readFirstSampleAt(db: Database): string | null {
  const first = runSyncRow(db, kdb(db).selectFrom('probe_samples').select('at').orderBy('at', 'asc').limit(1).compile(), FirstSampleSchema);
  return first?.at ?? null;
}
