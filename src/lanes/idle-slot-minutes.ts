import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { buildRowSchema } from '../db/build-row-schema.ts';
import { runSyncQuery } from '../db/run-sync-query.ts';
import { kdb } from '../kdb.ts';

const SampleSchema = buildRowSchema('lanes_samples').pick({ at: true, slots: true });

const MAX_SAMPLE_GAP_MINUTES = 30;

export function idleSlotMinutes(db: Database, hours: number): { slotMinutes: number; samples: number } {
  const from = iso(new Date(now().getTime() - hours * 3_600_000));
  const rows = runSyncQuery(db, kdb(db).selectFrom('lanes_samples').select(['at', 'slots']).where('at', '>=', from).where('error', 'is', null).orderBy('seq').compile(), SampleSchema);
  let total = 0;
  let previous: (typeof rows)[number] | undefined;
  for (const row of rows) {
    if (previous !== undefined) {
      const gap = (new Date(row.at).getTime() - new Date(previous.at).getTime()) / 60_000;
      total += previous.slots * Math.min(gap, MAX_SAMPLE_GAP_MINUTES);
    }
    previous = row;
  }
  return { slotMinutes: Math.round(total), samples: rows.length };
}
