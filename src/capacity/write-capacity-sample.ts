import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import type { CapacitySampleRow } from '../kdb.ts';
import { kdb } from '../kdb.ts';
import type { Reading } from './types.ts';

export async function writeCapacitySample(db: Database, r: Reading): Promise<void> {
  const KEEP_DAYS = 30,
    { at, errors, ...rest } = r;
  const row: CapacitySampleRow = { at, ...rest, errors: JSON.stringify(errors) };
  const { at: _at, ...update } = row;
  await kdb(db).insertInto('capacity_samples').values(row).onConflict((oc) => oc.column('at').doUpdateSet(update)).execute();
  await kdb(db).deleteFrom('capacity_samples').where('at', '<', iso(new Date(Date.parse(at) - KEEP_DAYS * 86_400_000))).execute();
}
