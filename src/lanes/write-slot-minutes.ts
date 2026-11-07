import type { Database } from 'bun:sqlite';
import { BindingsSchema } from '../db/bindings-schema.ts';
import { kdb } from '../kdb.ts';
import type { SlotCauseName } from './types.ts';

// Kysely's execute waits on its own connection lock, so the write runs here, at once, and a caller's
// bun:sqlite transaction holds it.
export function writeSlotMinutes(db: Database, day: string, cause: SlotCauseName, minutes: number): void {
  const query = kdb(db)
    .insertInto('slot_minutes')
    .values({ day, cause, minutes })
    .onConflict((conflict) => conflict.columns(['day', 'cause']).doUpdateSet((builder) => ({ minutes: builder('slot_minutes.minutes', '+', minutes) })))
    .compile();
  db.prepare(query.sql).run(...BindingsSchema.parse(query.parameters));
}
