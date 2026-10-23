import type { Database } from 'bun:sqlite';
import { z } from 'zod';

const RefsSchema = z.array(z.object({ ref: z.string() }));
const SessionsSchema = z.array(z.object({ session_id: z.string() }));

// Why a working run is not finished: its open PRs and its active main sessions. A stacked run merges
// its lower layers while its agent still builds the layers above them. Null when neither is left.
export function readUnfinishedWork(db: Database, issue: string): string | null {
  const open = RefsSchema.parse(db.query("SELECT ref FROM run_prs WHERE issue = ? AND state = 'open' ORDER BY ref").all(issue)).map((row) => row.ref);
  const sessions = SessionsSchema.parse(db.query('SELECT session_id FROM run_sessions WHERE issue = ? AND active = 1 AND helper = 0 ORDER BY added_at').all(issue)).map((row) => row.session_id.slice(0, 8));
  const parts = [...(open.length > 0 ? [`open PR ${open.join(', ')}`] : []), ...(sessions.length > 0 ? [`active session ${sessions.join(', ')}`] : [])];
  return parts.length > 0 ? parts.join(' and ') : null;
}
