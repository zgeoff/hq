import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const RefsSchema = z.array(z.object({ ref: z.string() }));
const SessionsSchema = z.array(z.object({ session_id: z.string(), helper: z.number() }));

// A stacked run merges its lower layers while its agent still builds the layers above them.
export function readUnfinishedWork(db: Database, issue: string): string | null {
  const open = RefsSchema.parse(db.query("SELECT ref FROM run_prs WHERE issue = ? AND state = 'open' AND design_pass = 0 ORDER BY ref").all(issue)).map((row) => row.ref);
  const sessions = SessionsSchema.parse(db.query('SELECT session_id, helper FROM run_sessions WHERE issue = ? AND active = 1 ORDER BY added_at').all(issue));
  const main = sessions.filter((row) => row.helper === 0).map((row) => row.session_id.slice(0, 8));
  const helpers = sessions.filter((row) => row.helper !== 0).map((row) => row.session_id.slice(0, 8));
  const parts = [...(open.length > 0 ? [`open PR ${open.join(', ')}`] : []), ...(main.length > 0 ? [`active session ${main.join(', ')}`] : []), ...(helpers.length > 0 ? [`active helper session ${helpers.join(', ')}`] : [])];
  return parts.length > 0 ? parts.join(' and ') : null;
}
