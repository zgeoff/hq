import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { FOCUS_SCHEMA } from './focus-schema.ts';
import type { Focus } from './types.ts';

const rowSchema = z.object({ terms: z.string(), reserves: z.string(), set_at: z.string(), set_by: z.string() }).nullable();

// The focus set now, or null when none is set: the lanes then take all eligible work in one order.
export function readFocus(db: Database): Focus | null {
  const row = rowSchema.parse(db.query('SELECT terms, reserves, set_at, set_by FROM focus WHERE id = 1').get());
  if (row === null) {
    return null;
  }
  return { terms: FOCUS_SCHEMA.terms.parse(JSON.parse(row.terms)), reserves: FOCUS_SCHEMA.reserves.parse(JSON.parse(row.reserves)), setAt: row.set_at, setBy: row.set_by };
}
