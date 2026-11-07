import type { Database } from 'bun:sqlite';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const rowSchema = buildRowSchema('slot_minutes').pick({ cause: true, minutes: true });

export interface SlotMinutes {
  delivery: number;
  triage: number;
  supply: number;
  design: number;
}

export function readSlotMinutes(db: Database, day: string): SlotMinutes {
  const query = kdb(db).selectFrom('slot_minutes').select(['cause', 'minutes']).where('day', '=', day).compile();
  const rows = runSyncQuery(db, query, rowSchema);
  const totals: SlotMinutes = { delivery: 0, triage: 0, supply: 0, design: 0 };
  for (const row of rows) {
    totals[row.cause] = row.minutes;
  }
  return totals;
}
