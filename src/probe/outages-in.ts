import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';
import type { OutageRow } from './types.ts';

const OutageSchema = buildRowSchema('outages');

export function outagesIn(db: Database, from: Date, to: Date): OutageRow[] {
  const query = kdb(db)
    .selectFrom('outages')
    .selectAll()
    .where('kind', '=', 'down')
    .where('started_at', '<', iso(to))
    .where((eb) => eb.or([eb('ended_at', 'is', null), eb('ended_at', '>', iso(from))]))
    .orderBy('started_at')
    .compile();
  return runSyncQuery(db, query, OutageSchema);
}
