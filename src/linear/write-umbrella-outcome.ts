import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import type { UmbrellaBox, UmbrellaOutcome } from './types.ts';

// Returns false when another run decided the row first.
export function writeUmbrellaOutcome(db: Database, box: UmbrellaBox, outcome: UmbrellaOutcome): boolean {
  const result = db.query('UPDATE umbrella_boxes SET outcome = ?, decided_at = ? WHERE repo = ? AND number = ? AND issue = ? AND outcome IS NULL').run(outcome, iso(now()), box.repo, box.number, box.issue);
  return result.changes > 0;
}
