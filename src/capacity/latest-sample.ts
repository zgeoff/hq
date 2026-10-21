import type { Database } from 'bun:sqlite';
import { kdb } from '../kdb.ts';
import { parseSampleRow as parse } from './parse-sample-row.ts';
import type { Reading } from './types.ts';

export async function latestSample(db: Database): Promise<Reading | null> {
  const r = await kdb(db).selectFrom('capacity_samples').selectAll().orderBy('at', 'desc').limit(1).executeTakeFirst();
  return r ? parse(r) : null;
}
