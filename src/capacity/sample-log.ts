import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { kdb } from '../kdb.ts';
import { parseSampleRow as parse } from './parse-sample-row.ts';
import type { Reading } from './types.ts';

export async function sampleLog(db: Database, hours: number, at: Date = now()): Promise<Reading[]> {
  const rows = await kdb(db).selectFrom('capacity_samples').selectAll().where('at', '>=', iso(new Date(at.getTime() - hours * 3_600_000))).orderBy('at', 'desc').execute();
  return rows.map(parse);
}
