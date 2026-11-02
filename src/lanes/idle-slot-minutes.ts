import type { Database } from 'bun:sqlite';
import { iso } from '../clock/iso.ts';
import { now } from '../clock/now.ts';

const MAX_SAMPLE_GAP_MINUTES = 30;

export function idleSlotMinutes(db: Database, hours: number): { slotMinutes: number; samples: number } {
  const from = iso(new Date(now().getTime() - hours * 3_600_000));
  const rows = db.query('SELECT at, slots FROM lanes_samples WHERE at >= ? AND error IS NULL ORDER BY seq').all(from) as { at: string; slots: number }[];
  let total = 0;
  let previous: { at: string; slots: number } | undefined;
  for (const row of rows) {
    if (previous !== undefined) {
      const gap = (new Date(row.at).getTime() - new Date(previous.at).getTime()) / 60_000;
      total += previous.slots * Math.min(gap, MAX_SAMPLE_GAP_MINUTES);
    }
    previous = row;
  }
  return { slotMinutes: Math.round(total), samples: rows.length };
}
