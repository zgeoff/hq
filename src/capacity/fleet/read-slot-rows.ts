import type { Database } from 'bun:sqlite';
import { iso } from '../../clock/iso.ts';
import { SLOT_ROWS } from './slot-row-schema.ts';
import type { SlotRow } from './types.ts';

export function readSlotRows(db: Database, since: Date, at: Date): SlotRow[] {
  const rows = SLOT_ROWS.parse(db.query('SELECT at, slot, status, five_hour, five_hour_resets_at, seven_day, seven_day_resets_at, working_lanes FROM slot_usage WHERE at >= ? AND at <= ? ORDER BY at, slot').all(iso(since), iso(at)));
  return rows.map((row) => ({ at: row.at, slot: row.slot, status: row.status, five: row.five_hour, fiveResetsAt: row.five_hour_resets_at, seven: row.seven_day, sevenResetsAt: row.seven_day_resets_at, workingLanes: row.working_lanes }));
}
