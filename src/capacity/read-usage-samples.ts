import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { iso } from '../clock/iso.ts';
import { USAGE_SAMPLE } from './usage-sample.ts';
import type { UsageSample } from './usage-sample.ts';

const rowsSchema = z.array(USAGE_SAMPLE);

export function readUsageSamples(db: Database, at: Date, hours: number): UsageSample[] {
  const newest = db.query('SELECT account FROM usage_samples WHERE at <= ? ORDER BY at DESC LIMIT 1').get(iso(at));
  const account = z.object({ account: z.string() }).nullable().parse(newest);
  if (account === null) {
    return [];
  }
  const from = iso(new Date(at.getTime() - hours * 3_600_000));
  return rowsSchema.parse(db.query('SELECT at, account, five_hour, seven_day, five_hour_resets_at, seven_day_resets_at FROM usage_samples WHERE account = ? AND at >= ? AND at <= ? ORDER BY at').all(account.account, from, iso(at)));
}
