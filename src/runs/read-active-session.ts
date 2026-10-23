import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const RowSchema = z.object({ session_id: z.string() }).nullable();

// The first session still active on a run, a helper's included, or null when none is.
export function readActiveSession(db: Database, issue: string): string | null {
  return RowSchema.parse(db.query('SELECT session_id FROM run_sessions WHERE issue = ? AND active = 1 ORDER BY added_at LIMIT 1').get(issue))?.session_id ?? null;
}
