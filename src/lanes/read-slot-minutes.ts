import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { kdb } from '../kdb.ts';

const BindingsSchema = z.array(z.union([z.string(), z.number(), z.null()]));

const rowsSchema = z.array(z.object({ cause: z.enum(['delivery', 'triage', 'supply', 'design']), minutes: z.number() }));

export interface SlotMinutes {
  delivery: number;
  triage: number;
  supply: number;

  // The free agent design lanes' own tally; no part of the delivery, triage or supply numbers.
  design: number;
}

// The slot-minutes each cause holds for a Sydney day; a cause with none is 0.
export function readSlotMinutes(db: Database, day: string): SlotMinutes {
  const query = kdb(db).selectFrom('slot_minutes').select(['cause', 'minutes']).where('day', '=', day).compile();
  const rows = rowsSchema.parse(db.prepare(query.sql).all(...BindingsSchema.parse(query.parameters)));
  const totals: SlotMinutes = { delivery: 0, triage: 0, supply: 0, design: 0 };
  for (const row of rows) {
    totals[row.cause] = row.minutes;
  }
  return totals;
}
