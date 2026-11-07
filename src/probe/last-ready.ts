import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';

const ReadySchema = buildRowSchema('probe_samples').pick({ at: true, ready_ok: true }).extend({ ready_ok: z.number() });

export function lastReady(db: Database): { at: string; ready_ok: number } | null {
  return runSyncRow(db, kdb(db).selectFrom('probe_samples').select(['at', 'ready_ok']).where('ready_ok', 'is not', null).orderBy('at', 'desc').limit(1).compile(), ReadySchema);
}
