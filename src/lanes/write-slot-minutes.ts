import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { kdb } from '../kdb.ts';
import type { SlotCauseName } from './types.ts';

const BindingsSchema = z.array(z.union([z.string(), z.number(), z.null()]));

// Adds slot-minutes to a cause's total for a Sydney day. Kysely's execute waits on its own connection
// lock, so the write runs here, at once, and a caller's bun:sqlite transaction holds it.
export function writeSlotMinutes(db: Database, day: string, cause: SlotCauseName, minutes: number): void {
  const query = kdb(db)
    .insertInto('slot_minutes')
    .values({ day, cause, minutes })
    .onConflict((conflict) => conflict.columns(['day', 'cause']).doUpdateSet((builder) => ({ minutes: builder('slot_minutes.minutes', '+', minutes) })))
    .compile();
  db.prepare(query.sql).run(...BindingsSchema.parse(query.parameters));
}
