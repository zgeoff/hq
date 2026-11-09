import type { Database } from 'bun:sqlite';
import type { UsageSample } from '../capacity/usage-sample.ts';

export function writeUsageSample(db: Database, sample: UsageSample): boolean {
  const result = db.query('INSERT OR IGNORE INTO usage_samples (at, account, five_hour, seven_day, five_hour_resets_at, seven_day_resets_at) VALUES (?, ?, ?, ?, ?, ?)').run(sample.at, sample.account, sample.five_hour, sample.seven_day, sample.five_hour_resets_at, sample.seven_day_resets_at);

  return result.changes > 0;
}
