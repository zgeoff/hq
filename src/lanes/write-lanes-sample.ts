import type { Database } from 'bun:sqlite';
import type { LanesSampleInput } from './types.ts';

export function writeLanesSample(db: Database, sample: LanesSampleInput): void {
  db.query('INSERT INTO lanes_samples (at, free_mib, slots, eligible, error) VALUES (?, ?, ?, ?, ?)').run(sample.at, sample.freeMib, sample.slots, sample.eligible, sample.error);
}
