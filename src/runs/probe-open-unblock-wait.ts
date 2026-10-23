import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const IdsSchema = z.array(z.object({ id: z.string() }));

export function probeOpenUnblockWait(db: Database, waitsOn: string | null): boolean {
  if (waitsOn === null) {
    return false;
  }
  const words = new Set(waitsOn.split(/[^a-z0-9._-]+/iu));
  const open = IdsSchema.parse(db.query("SELECT id FROM unblocks WHERE state = 'open'").all());
  return open.some((row) => words.has(row.id));
}
