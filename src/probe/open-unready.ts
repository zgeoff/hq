import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncRow } from '../db/run-sync-row.ts';
import { kdb } from '../kdb.ts';
import type { OutageRow } from './types.ts';

const OutageSchema = buildRowSchema('outages');

export function openUnready(db: Database): OutageRow | null {
  return runSyncRow(db, kdb(db).selectFrom('outages').selectAll().where('ended_at', 'is', null).where('kind', '=', 'unready').compile(), OutageSchema);
}
