import type { Database } from 'bun:sqlite';

export function writeLanesNudgeFollowUp(db: Database, id: number, slotsAfter: number, checkedAt: string): void {
  db.query('UPDATE lanes_nudges SET slots_after = ?, checked_at = ? WHERE id = ?').run(slotsAfter, checkedAt, id);
}
