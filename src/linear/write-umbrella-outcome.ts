import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { HqError } from '../errors.ts';
import type { UmbrellaBox, UmbrellaOutcome } from './types.ts';
import { UMBRELLA_TRANSITIONS } from './umbrella-transitions.ts';

// The one write to an outcome: refuses a move the table lacks, and moves the row only from the
// outcome the caller read. Returns false when another run decided the row first.
export function writeUmbrellaOutcome(db: Database, box: UmbrellaBox, outcome: UmbrellaOutcome): boolean {
  const from = box.outcome ?? 'undecided';
  if (!UMBRELLA_TRANSITIONS[from].includes(outcome)) {
    throw new HqError('bad_state', `${box.repo}#${box.number} ${box.issue} is ${from}, so it cannot move to ${outcome}`, { state: from });
  }
  const result = db.query('UPDATE umbrella_boxes SET outcome = ?, decided_at = ? WHERE repo = ? AND number = ? AND issue = ? AND outcome IS ?').run(outcome, iso(now()), box.repo, box.number, box.issue, box.outcome);
  return result.changes > 0;
}
