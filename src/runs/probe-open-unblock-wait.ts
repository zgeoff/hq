import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const IdsSchema = z.array(z.object({ id: z.string() }));

// True when a run's waits-on text names an open unblock item, as in "waits on u193": its PRs'
// reviews wait with it, and the wait ends by itself when the item closes.
export function probeOpenUnblockWait(db: Database, waitsOn: string | null): boolean {
  if (waitsOn === null) {
    return false;
  }
  const words = new Set(waitsOn.split(/[^a-z0-9._-]+/iu));
  const open = IdsSchema.parse(db.query("SELECT id FROM unblocks WHERE state = 'open'").all());
  return open.some((row) => words.has(row.id));
}
