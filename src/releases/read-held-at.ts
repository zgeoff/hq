import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const ROW = z.object({ at: z.string().nullable() });

export function readHeldAt(db: Database, issue: string): string | null {
  const row = db.query("SELECT max(at) AS at FROM events WHERE subject = 'run' AND subject_id = ? AND action = 'state' AND to_state = 'deploy-held'").get(issue);
  return ROW.parse(row).at;
}
