import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';

// Slot-minutes left free in the last `hours`, from the samples: the gap to shrink.
export function idleSlotMinutes(db: Database, hours: number): { slotMinutes: number; samples: number } {
  const from = iso(new Date(now().getTime() - hours * 3_600_000));
  const rows = db.query('SELECT at, slots FROM lanes_samples WHERE at >= ? AND error IS NULL ORDER BY seq').all(from) as { at: string; slots: number }[];
  let total = 0;
  for (let i = 1; i < rows.length; i++) {
    const dt = (new Date(rows[i]!.at).getTime() - new Date(rows[i - 1]!.at).getTime()) / 60_000;
    total += rows[i - 1]!.slots * Math.min(dt, 30); // a gap in sampling counts at most 30 min
  }
  return { slotMinutes: Math.round(total), samples: rows.length };
}
