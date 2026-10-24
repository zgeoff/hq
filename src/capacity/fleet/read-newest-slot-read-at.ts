import type { Database } from 'bun:sqlite';
import { z } from 'zod';

export function readNewestSlotReadAt(db: Database): string | null {
  const row = z.object({ at: z.string().nullable() }).parse(db.query('SELECT MAX(at) AS at FROM slot_usage').get());
  return row.at;
}
