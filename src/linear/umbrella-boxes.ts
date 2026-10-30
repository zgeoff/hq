import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';
import { IN_SQL } from '../scope/in-sql.ts';

export type UmbrellaOutcome = 'news' | 'ticked' | 'no_box' | 'ambiguous' | 'gone';

export interface UmbrellaBox {
  repo: string;
  number: number;
  issue: string;
  merged_at: string;
  outcome: UmbrellaOutcome | null;
  decided_at: string | null;
}

// A re-sync of the same merge never resets an outcome already decided.
export function recordUmbrellaBox(db: Database, repo: string, number: number, issue: string, mergedAt: string): void {
  db.query('INSERT INTO umbrella_boxes (repo, number, issue, merged_at) VALUES (?, ?, ?, ?) ON CONFLICT (repo, number, issue) DO NOTHING').run(repo, number, issue, mergedAt);
}

// The rows in scope with no outcome yet, or every row in scope.
export function listUmbrellaBoxes(db: Database, only: 'undecided' | 'all' = 'all'): UmbrellaBox[] {
  const where = only === 'undecided' ? 'AND outcome IS NULL' : '';
  return db.query(`SELECT repo, number, issue, merged_at, outcome, decided_at FROM umbrella_boxes WHERE repo IN ${IN_SQL} ${where} ORDER BY merged_at, repo, number, issue`).all() as UmbrellaBox[];
}

export function decideUmbrellaBox(db: Database, box: UmbrellaBox, outcome: UmbrellaOutcome): void {
  db.query('UPDATE umbrella_boxes SET outcome = ?, decided_at = ? WHERE repo = ? AND number = ? AND issue = ? AND outcome IS NULL').run(outcome, iso(now()), box.repo, box.number, box.issue);
}
