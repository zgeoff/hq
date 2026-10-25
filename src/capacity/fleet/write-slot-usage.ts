import type { Database } from 'bun:sqlite';
import { iso } from '../../clock/iso.ts';
import type { SlotReading } from './types.ts';

export function writeSlotUsage(db: Database, readings: readonly SlotReading[], workingLanes: number, at: Date): void {
  const insert = db.query('INSERT OR REPLACE INTO slot_usage (at, slot, status, five_hour, five_hour_resets_at, seven_day, seven_day_resets_at, working_lanes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (const reading of readings) {
      insert.run(iso(at), reading.slot, reading.status, reading.five, reading.fiveResetsAt, reading.seven, reading.sevenResetsAt, workingLanes);
    }
  })();
}
